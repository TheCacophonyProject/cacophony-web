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
import responseUtil from "./responseUtil";
import modelsUtil from "@models/util/util";
import crypto from "crypto";
import { Request, Response } from "express";
import { Recording } from "@models/Recording";
import { Device } from "@models/Device";
import models, { ModelCommon } from "@models";
import { DeviceType, RecordingType } from "@typedefs/api/consts";

function multipartUpload(
  keyPrefix: string,
  onSaved: <T>(
    uploadingDevice: Device | null,
    data: any,
    key: string
  ) => Promise<ModelCommon<T> | string>
) {
  return (request: Request, response: Response) => {
    const key = keyPrefix + "/" + moment().format("YYYY/MM/DD/") + uuidv4();
    let data;
    let filename;
    let upload;

    // Note regarding multiparty: there are no guarantees about the
    // order that the field and part handlers will be called. You need
    // to formulate the response to the client in the close handler.
    const form = new multiparty.Form();

    // Handle the "data" field.
    form.on("field", (name, value) => {
      if (name != "data") {
        return;
      }

      try {
        data = JSON.parse(value);
      } catch (err) {
        // This leaves `data` unset so that the close handler (below)
        // will fail the upload.
        log.error("Invalid 'data' field: %s", err.toString());
      }
    });

    // Handle the "file" part.
    form.on("part", (part) => {
      if (part.name != "file") {
        part.resume();
        return;
      }
      filename = part.filename;

      upload = modelsUtil
        .openS3()
        .upload({
          Key: key,
          Body: part,
        })
        .promise()
        .catch((err) => {
          return err;
        });
      log.debug("Started streaming upload to bucket...");
    });

    // Handle any errors. If this is called, the close handler
    // shouldn't be.
    form.on("error", (err) => {
      responseUtil.serverError(response, err);
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
      if (!upload) {
        log.error("Upload was never started.");
        responseUtil.invalidDatapointUpload(
          response,
          "Upload was never started."
        );
        return;
      }

      let dbRecordOrFileKey: any;
      try {
        // Wait for the upload to complete.
        const uploadResult = await upload;
        // log.warning("Upload %s", performance.now() - s);
        if (uploadResult instanceof Error) {
          responseUtil.serverError(response, uploadResult);
          return;
        }
        log.info("Finished streaming upload to object store. Key: %s", key);

        // Optional file integrity check, opt-in to be backward compatible with existing clients.
        if (data.fileHash) {
          // TODO: ***Maybe*** check if fileHash already exists in DB?  We may actually want to allow duplicate files though,
          //  so maybe rather than disallowing the entry being created, we should just make a new recording that
          //  references the same data (fileKey, tracks etc) as the existing recording?  Then we just want to make sure
          //  we stop running our script to prune duplicates.

          log.info("Checking file hash. Key: %s", key);
          // Read the full file back from s3 and hash it
          const fileData = await modelsUtil
            .openS3()
            .getObject({
              Key: key,
            })
            .promise()
            .catch((err) => {
              return err;
            });
          const checkHash = crypto
            .createHash("sha1")
            // @ts-ignore
            .update(new Uint8Array(fileData.Body), "binary")
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
        }

        data.filename = filename;

        let uploadingDevice =
          response.locals.device || response.locals.requestDevice;
        if (uploadingDevice) {
          if (
            response.locals.requestDevice &&
            !response.locals.requestDevice.devicename
          ) {
            // We just have a device id, so get the actual device object to update.
            uploadingDevice = await models.Device.findByPk(
              response.locals.requestDevice.id
            );
            // Update the last connection time for the uploading device.
            await uploadingDevice.update({ lastConnectionTime: new Date() });
          }
        }

        // Store a record for the upload.
        dbRecordOrFileKey = await onSaved(uploadingDevice || null, data, key);
        // log.warning("Parsing and saving recording meta %s", performance.now() - sss);

        if (uploadingDevice) {
          // Update the device location from the recording.
          await uploadingDevice.update({
            location: (dbRecordOrFileKey as Recording).location,
          });
          if (uploadingDevice.kind === DeviceType.Unknown) {
            // If this is the first recording we've gotten from a device, we can set its type.
            const deviceType =
              (dbRecordOrFileKey as Recording).type === RecordingType.ThermalRaw
                ? "thermal"
                : "audio";
            await uploadingDevice.update({ kind: deviceType });
          }
        }
        if (typeof dbRecordOrFileKey !== "string") {
          await dbRecordOrFileKey.save();
          responseUtil.validRecordingUpload(response, dbRecordOrFileKey.id);
        } else {
          responseUtil.validRecordingUpload(response, dbRecordOrFileKey);
        }
      } catch (err) {
        responseUtil.serverError(response, err);
        return;
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
