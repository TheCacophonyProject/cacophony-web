/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import moment from "moment";
import { v4 as uuidv4 } from "uuid";
import multiparty from "multiparty";
import log from "@log";
import responseUtil, { serverErrorResponse } from "./responseUtil";
import modelsUtil from "@models/util/util";
import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { Device } from "@models/Device";
import models, { ModelCommon } from "@models";
import { User } from "@models/User";
import stream, { Stream } from "stream";
import { RecordingType } from "@typedefs/api/consts";
import config from "@config";
import { Op } from "sequelize";
import { UnprocessableError } from "@api/customErrors";
import logger from "@log";
import Event from "@models/Event";

interface MultiPartFormPart extends stream.Readable {
  headers: Record<string, any>;
  name: string;
  filename?: string;
  byteOffset: number;
  byteCount: number;
}

const stream2Buffer = (stream: Stream): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const _buf = [];
    stream.on("data", (chunk) => _buf.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(_buf)));
    stream.on("error", (err) => reject(err));
  });
};

function multipartUpload(
  keyPrefix: string,
  onFileUploadComplete: <T>(
    uploader: "device" | "user",
    uploadingDevice: Device,
    uploadingUser: User | null,
    data: any,
    key: string,
    uploadedFileData: Uint8Array,
    locals: Record<string, any>
  ) => Promise<ModelCommon<T> | string>
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const key = keyPrefix + "/" + moment().format("YYYY/MM/DD/") + uuidv4();
    let data;
    let filename;
    let uploadPromise;
    let fileDataPromise;

    let uploadingDevice =
      response.locals.requestDevice || response.locals.device;
    if (uploadingDevice) {
      // If it was the actual device uploading the recording, not a user
      // on the devices' behalf, set the lastConnectionTime for the device.
      if (
        response.locals.requestDevice &&
        !response.locals.requestDevice.deviceName
      ) {
        // We just have a device id, so get the actual device object to update.
        uploadingDevice = await models.Device.findByPk(
          response.locals.requestDevice.id
        );
        // Update the last connection time for the uploading device.
        await uploadingDevice.update({ lastConnectionTime: new Date() });
      }
    }

    // Note regarding multiparty: there are no guarantees about the
    // order that the field and part handlers will be called. You need
    // to formulate the response to the client in the close handler.
    const form = new multiparty.Form();

    // Handle the "data" field.
    form.on("field", async (name: string, value: any) => {
      if (name !== "data") {
        return;
      }

      try {
        data = JSON.parse(value);
        if (keyPrefix === "raw") {
          if (
            (data.hasOwnProperty("recordingDateTime") ||
              data.type === RecordingType.Audio) &&
            isNaN(Date.parse(data.recordingDateTime))
          ) {
            return next(new UnprocessableError("Invalid recordingDateTime"));
          }
        }
      } catch (err) {
        // This leaves `data` unset so that the close handler (below)
        // will fail the upload.
        log.error("Invalid 'data' field: %s", err.toString());
      }
    });

    // Handle the "file" part.
    form.on("part", (part: MultiPartFormPart) => {
      if (part.name !== "file") {
        part.resume();
        return;
      }
      filename = part.filename;
      const uploadStream = (Key) => {
        const pass = new stream.PassThrough();
        return {
          writeStream: pass,
          promise: modelsUtil
            .openS3()
            .upload({ Key, Body: pass })
            .promise()
            .catch((err) => {
              return err;
            }),
        };
      };
      const { writeStream, promise } = uploadStream(key);
      uploadPromise = promise;
      part.pipe(writeStream);
      fileDataPromise = stream2Buffer(writeStream);
      log.debug("Started streaming upload to bucket...");
    });

    // Handle any errors. If this is called, the close handler
    // shouldn't be.
    form.on("error", (err) => {
      return serverErrorResponse(response, err);
    });

    // This gets called once all fields and parts have been read.
    form.on("close", async () => {
      if (!data) {
        log.error("Upload missing 'data' field.");
        responseUtil.invalidDatapointUpload(
          response,
          "Upload missing 'data' field."
        );
        return;
      }
      if (!uploadPromise) {
        log.error("Upload was never started.");
        responseUtil.invalidDatapointUpload(
          response,
          "Upload was never started."
        );
        return;
      }

      if (uploadingDevice && data.fileHash && keyPrefix === "raw") {
        // Try and handle duplicates early in the upload if possible,
        // so that we can return early and not waste bandwidth
        const existingRecordingWithHashForDevice =
          await models.Recording.findOne({
            where: {
              DeviceId: uploadingDevice.id,
              rawFileHash: data.fileHash,
              deletedAt: { [Op.eq]: null },
            },
          });
        if (existingRecordingWithHashForDevice !== null) {
          log.error(
            "Recording with hash %s for device %s already exists, discarding duplicate",
            data.fileHash,
            uploadingDevice.id
          );
          responseUtil.validRecordingUpload(
            response,
            existingRecordingWithHashForDevice.id,
            "Duplicate recording found for device"
          );
          return;
        }
      }

      let dbRecordOrFileKey: any;
      try {
        // Wait for the upload to complete.
        const [uploadResult, fileData] = await Promise.all([
          uploadPromise,
          fileDataPromise,
        ]);
        const fileDataArray = new Uint8Array(fileData);
        if (uploadResult instanceof Error) {
          return serverErrorResponse(response, uploadResult);
        }
        log.info("Finished streaming upload to object store. Key: %s", key);

        // Optional file integrity check, opt-in to be backward compatible with existing clients.
        if (data.fileHash && keyPrefix === "raw") {
          log.info("Checking file hash. Key: %s", key);
          // Hash the full file
          const checkHash = crypto
            .createHash("sha1")
            // @ts-ignore
            .update(fileDataArray, "binary")
            .digest("hex");
          if (data.fileHash !== checkHash) {
            log.error("File hash check failed, deleting key: %s", key);
            // Hash check failed, delete the file from s3, and return an error which the client can respond to to decide
            // whether or not to retry immediately.
            await modelsUtil
              .openS3()
              .deleteObject({
                Key: key,
              })
              .promise()
              .catch((err) => {
                return err;
              });
            responseUtil.invalidDatapointUpload(
              response,
              "Uploaded file integrity check failed, please retry."
            );
            return;
          }
        } else if (keyPrefix === "raw" && config.productionEnv) {
          // NOTE: We need to allow duplicate uploads on test currently.
          // Create a fileHash if we didn't get one from the device upload, and check for
          // duplicates.
          data.fileHash = crypto
            .createHash("sha1")
            // @ts-ignore
            .update(fileDataArray, "binary")
            .digest("hex");

          const existingRecordingWithHashForDevice =
            await models.Recording.findOne({
              where: {
                DeviceId: uploadingDevice.id,
                rawFileHash: data.fileHash,
                deletedAt: { [Op.eq]: null },
              },
            });
          if (existingRecordingWithHashForDevice !== null) {
            log.error(
              "Recording with hash %s for device %s already exists, discarding duplicate",
              data.fileHash,
              uploadingDevice.id
            );
            // Remove from s3
            await modelsUtil
              .openS3()
              .deleteObject({
                Key: key,
              })
              .promise()
              .catch((err) => {
                return err;
              });
            responseUtil.validRecordingUpload(
              response,
              existingRecordingWithHashForDevice.id,
              "Duplicate recording found for device"
            );
            return;
          }
        }

        data.filename = filename;
        // Store a record for the upload.
        const uploader = response.locals.requestDevice ? "device" : "user";
        dbRecordOrFileKey = await onFileUploadComplete(
          uploader,
          uploadingDevice,
          response.locals.requestUser || null,
          data,
          key,
          fileDataArray,
          response.locals
        );
        if (typeof dbRecordOrFileKey !== "string") {
          await dbRecordOrFileKey.save();
          if (dbRecordOrFileKey.type === "audioBait") {
            // FIXME - this is pretty nasty.
            responseUtil.validAudiobaitUpload(response, dbRecordOrFileKey.id);
          } else if (dbRecordOrFileKey instanceof models.Event) {
            responseUtil.validEventThumbnailUpload(
              response,
              (dbRecordOrFileKey as any).id
            );
          } else {
            responseUtil.validRecordingUpload(response, dbRecordOrFileKey.id);
          }
        } else {
          // Returning the s3 key of an uploaded asset - will be entered against
          // the recording in the DB by a subsequent api call.
          responseUtil.validFileUpload(response, dbRecordOrFileKey);
          return;
        }
      } catch (err) {
        return serverErrorResponse(response, err);
      }
    });

    form.parse(request);
  };
}

function getS3Object(fileKey) {
  const s3 = modelsUtil.openS3();
  const params = {
    Key: fileKey,
  };
  return s3.headObject(params).promise();
}

async function getS3ObjectFileSize(fileKey) {
  try {
    const s3Ojb = await getS3Object(fileKey);
    return s3Ojb.ContentLength;
  } catch (err) {
    log.warning(
      `Error retrieving S3 Object for with fileKey: ${fileKey}. Error was: ${err.message}`
    );
  }
}

async function deleteS3Object(fileKey) {
  const s3 = modelsUtil.openS3();
  const params = {
    Key: fileKey,
  };
  return s3.deleteObject(params).promise();
}

export default {
  getS3Object,
  deleteS3Object,
  getS3ObjectFileSize,
  multipartUpload,
};
