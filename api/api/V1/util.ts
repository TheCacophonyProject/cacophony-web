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
import responseUtil, {
  serverErrorResponse,
  someResponse,
} from "./responseUtil.js";
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { Device } from "@models/Device.js";
import type { ModelCommon } from "@models/index.js";
import modelsInit from "@models/index.js";
import type { User } from "@models/User.js";
import type { Stream } from "stream";
import stream from "stream";
import { HttpStatusCode, RecordingType } from "@typedefs/api/consts.js";
import config from "@config";
import { Op } from "sequelize";
import { UnprocessableError } from "@api/customErrors.js";
import { openS3 } from "@models/util/util.js";

const models = await modelsInit();

interface MultiPartFormPart extends stream.Readable {
  headers: Record<string, any>;
  name: string;
  filename?: string;
  byteOffset: number;
  byteCount: number;
}

const stream2Buffer = (
  stream: Stream,
  key: string,
  filename: string
): Promise<{ key: string; filename: string; buffer: Buffer }> => {
  return new Promise((resolve, reject) => {
    const _buf = [];
    stream.on("data", (chunk) => _buf.push(chunk));
    stream.on("end", () =>
      resolve({ key, filename, buffer: Buffer.concat(_buf) })
    );
    stream.on("error", (err) => reject(err));
  });
};

export const uploadFileStream = async (
  request: Request,
  keyPrefix?: string,
  fullKey?: string
): Promise<{
  size: number;
  key: string;
  hash: string;
}> => {
  if (!fullKey && !keyPrefix) {
    throw new Error("Must supply either key or keyPrefix");
  }
  if (!fullKey) {
    fullKey = `${keyPrefix}/${moment().format("YYYY/MM/DD/")}${uuidv4()}`;
  }

  const hash = crypto.createHash("sha1");

  const pass = new stream.PassThrough();
  let dataLength = 0;
  if (request.body && request.body.length) {
    dataLength = request.body.length;
  }

  pass.on("data", (d) => {
    dataLength += d.length;
    hash.update(d, "binary");
  });
  request.pipe(pass);
  const upload = openS3().upload({ Key: fullKey, Body: pass });
  // upload.on("httpUploadProgress", (p) => {
  //   console.log(p);
  // });
  await upload.promise().catch((err) => {
    return err;
  });
  return {
    hash: hash.digest("hex"),
    key: fullKey,
    size: dataLength,
  };
};

function multipartUpload(
  keyPrefix: string,
  onFileUploadComplete: <T>(
    uploader: "device" | "user",
    uploadingDevice: Device,
    uploadingUser: User | null,
    data: any,
    keys: string[],
    uploadedFileDatas: { key: string; data: Uint8Array; filename: string }[],
    locals: Record<string, any>
  ) => Promise<ModelCommon<T> | string>
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const key = `${keyPrefix}/${moment().format("YYYY/MM/DD")}/${uuidv4()}`;
    let data;
    const uploadPromises = {};
    const fileDataPromises: Record<
      string,
      Promise<{ key: string; buffer: Buffer }>
    > = {};

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
        // Update the last connection time for the uploading device, and set the device to active (just in case it's been set inactive)
        await uploadingDevice.update({
          lastConnectionTime: new Date(),
          active: true,
        });
      }
    }

    // Note regarding multiparty: there are no guarantees about the
    // order that the field and part handlers will be called. You need
    // to formulate the response to the client in the close handler.
    const form = new multiparty.Form();
    let canceledRequest = false;
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
            canceledRequest = true;
            return someResponse(
              response,
              HttpStatusCode.Unprocessable,
              `Invalid recordingDateTime '${data.recordingDateTime}'`
            );
          }
        }

        if (
          uploadingDevice &&
          "fileHash" in data &&
          !!data.fileHash &&
          keyPrefix === "raw"
        ) {
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
            log.warning(
              "Recording with hash %s for device %s already exists, discarding duplicate",
              data.fileHash,
              uploadingDevice.id
            );
            canceledRequest = true;
            responseUtil.validRecordingUpload(
              response,
              existingRecordingWithHashForDevice.id,
              "Duplicate recording found for device"
            );
            return;
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
      if (
        canceledRequest ||
        (part.name !== "file" &&
          part.name !== "derived" &&
          part.name !== "thumb")
      ) {
        part.resume();
        return;
      }
      const uploadStream = (Key) => {
        const pass = new stream.PassThrough();
        return {
          writeStream: pass,
          promise: openS3()
            .upload({ Key, Body: pass })
            .promise()
            .catch((err) => {
              return err;
            }),
        };
      };
      let partKey = key;
      if (part.name === "derived") {
        partKey = key.replace("raw", "web");
      }
      if (part.name === "thumb") {
        partKey = `${key.replace("raw", "web")}-thumb`;
      }
      const { writeStream, promise } = uploadStream(partKey);
      uploadPromises[part.filename] = promise;
      part.pipe(writeStream);
      fileDataPromises[partKey] = stream2Buffer(
        writeStream,
        partKey,
        part.filename
      );
      log.debug("Started streaming upload to bucket...");
    });

    // Handle any errors. If this is called, the close handler
    // shouldn't be.
    form.on("error", (err) => {
      canceledRequest = true;
      return serverErrorResponse(request, response, err);
    });

    // This gets called once all fields and parts have been read.
    form.on("close", async () => {
      if (canceledRequest) {
        return;
      }
      if (!data) {
        log.error("Upload missing 'data' field.");
        responseUtil.invalidDatapointUpload(
          response,
          "Upload missing 'data' field."
        );
        return;
      }
      if (!Object.values(uploadPromises).length) {
        log.error("Upload was never started.");
        responseUtil.invalidDatapointUpload(
          response,
          "Upload was never started."
        );
        return;
      }

      let dbRecordOrFileKey: any;
      try {
        const uploadKeys = Object.keys(fileDataPromises);
        const numUploads = Object.values(uploadPromises).length;
        // Wait for the upload(s) to complete.
        const results = await Promise.all([
          ...Object.values(uploadPromises),
          ...Object.values(fileDataPromises),
        ]);
        for (let i = 0; i < numUploads; i++) {
          const uploadResult = results[i];
          if (uploadResult instanceof Error && !canceledRequest) {
            return serverErrorResponse(request, response, uploadResult);
          }
        }

        // We only want to check the fileHash against the raw file part.
        const fileDataArrays = results
          .slice(numUploads)
          .map(
            ({
              key,
              filename,
              buffer,
            }: {
              key: string;
              buffer: Buffer;
              filename: string;
            }) => ({ key, filename, data: new Uint8Array(buffer) })
          );
        log.info("Finished streaming upload to object store. Key: %s", key);
        if (keyPrefix === "raw") {
          const fileDataArray = (
            fileDataArrays.find(({ key }) => key.startsWith("raw")) as {
              key: string;
              data: Uint8Array;
            }
          ).data;
          // Optional file integrity check, opt-in to be backward compatible with existing clients.
          if (data.fileHash) {
            log.info("Checking file hash. Key: %s", key);
            // Hash the full file
            const checkHash = crypto
              .createHash("sha1")
              // @ts-ignore
              .update(fileDataArray, "binary")
              .digest("hex");

            if (data.fileHash !== checkHash) {
              for (const key of uploadKeys) {
                log.error("File hash check failed, deleting key: %s", key);
                // Hash check failed, delete the file from s3, and return an error which the client can respond
                // to in order to decide whether to retry immediately.
                await openS3()
                  .deleteObject({
                    Key: key,
                  })
                  .promise()
                  .catch((err) => {
                    return err;
                  });
                if (!canceledRequest) {
                  responseUtil.invalidDatapointUpload(
                    response,
                    "Uploaded file integrity check failed, please retry."
                  );
                }
              }
              return;
            }
          } else if (config.productionEnv) {
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
              for (const key of uploadKeys) {
                log.warning(
                  "Recording with hash %s for device %s already exists, discarding duplicate",
                  data.fileHash,
                  uploadingDevice.id
                );
                // Remove from s3
                await openS3()
                  .deleteObject({
                    Key: key,
                  })
                  .promise()
                  .catch((err) => {
                    return err;
                  });
                if (!canceledRequest) {
                  responseUtil.validRecordingUpload(
                    response,
                    existingRecordingWithHashForDevice.id,
                    "Duplicate recording found for device"
                  );
                }
              }
              return;
            }
          }
        }

        // Store a record for the upload.
        const uploader = response.locals.requestDevice ? "device" : "user";
        dbRecordOrFileKey = await onFileUploadComplete(
          uploader,
          uploadingDevice,
          response.locals.requestUser || null,
          data,
          uploadKeys,
          fileDataArrays,
          response.locals
        );
        if (typeof dbRecordOrFileKey !== "string") {
          await dbRecordOrFileKey.save();
          if (dbRecordOrFileKey.type === "audioBait" && !canceledRequest) {
            // FIXME - this is pretty nasty.
            responseUtil.validAudiobaitUpload(response, dbRecordOrFileKey.id);
          } else if (
            dbRecordOrFileKey instanceof models.Event &&
            !canceledRequest
          ) {
            responseUtil.validEventThumbnailUpload(
              response,
              (dbRecordOrFileKey as any).id
            );
          } else if (!canceledRequest) {
            responseUtil.validRecordingUpload(response, dbRecordOrFileKey.id);
          }
        } else if (!canceledRequest) {
          // Returning the s3 key of an uploaded asset - will be entered against
          // the recording in the DB by a subsequent api call.
          responseUtil.validFileUpload(response, dbRecordOrFileKey);
          return;
        }
      } catch (err) {
        if (!canceledRequest) {
          return serverErrorResponse(request, response, err);
        }
      }
    });

    form.parse(request);
  };
}

function getS3Object(fileKey) {
  const s3 = openS3();
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
  const s3 = openS3();
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
