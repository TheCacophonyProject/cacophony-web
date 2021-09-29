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

import AWS from "aws-sdk";
import log from "@log";
import fs from "fs";
import mime from "mime";
import config from "@config";
import Sequelize from "sequelize";
import { User } from "@models/User";
import { ModelStaticCommon } from "@models";
import { ClientError } from "@api/customErrors";

const Op = Sequelize.Op;
interface QueryResult<T> {
  rows: null | T[];
  limit: number;
  offset: number;
}

export function findAllWithUser<T extends ModelStaticCommon<T>>(
  model: T,
  user,
  queryParams
): Promise<QueryResult<T>> {
  return new Promise(function (resolve) {
    const models = require("../index");
    if (typeof queryParams.limit == "undefined") {
      queryParams.limit = 20;
    }
    if (typeof queryParams.offset == "undefined") {
      queryParams.offset = 0;
    }
    queryParams.order = [["recordingDateTime", "DESC"]];
    // Find what devices the user can see.
    if (!user) {
      // Not logged in, can onnly see public recordings.
      model
        .findAndCountAll({
          where: { [Op.and]: [queryParams.where, { public: true }] },
          include: [models.Group],
          limit: queryParams.limit,
          offset: queryParams.offset,
        })
        .then(function (result: QueryResult<T>) {
          result.limit = queryParams.limit;
          result.offset = queryParams.offset;
          resolve(result);
        });
    } else {
      user
        .getGroupsIds()
        .then(function (ids) {
          // Adding filter so they only see recordings that they are allowed to.
          queryParams.where = {
            [Op.and]: [
              queryParams.where,
              { [Op.or]: [{ public: true }, { GroupId: { [Op.in]: ids } }] },
            ],
          };
          queryParams.include = [
            { model: models.Group },
            { model: models.Tag },
          ];
          return model.findAndCountAll(queryParams);
        })
        .then(function (result: QueryResult<T>) {
          result.limit = queryParams.limit;
          result.offset = queryParams.offset;
          resolve(result);
        });
    }
  });
}

//NOTE: Currently unused by anyone
export function getFileData<T extends ModelStaticCommon<T>>(
  model: T,
  id: number,
  user: User
) {
  return new Promise(function (resolve, reject) {
    findAllWithUser(model, user, { where: { id } })
      .then(function (result: { rows: null | T[] }) {
        if (result.rows !== null && result.rows.length >= 1) {
          const model = result.rows[0];
          const fileData = {
            key: model.getDataValue("fileKey"),
            name: getFileName(model),
            mimeType: model.getDataValue("mimeType"),
          };
          return resolve(fileData);
        } else {
          return resolve(null);
        }
      })
      .catch(function (err) {
        log.error("Error at models/util.js getFileKey:");
        reject(err);
      });
  });
}

export function getFileName(model) {
  let fileName;
  const dateStr = model.getDataValue("recordingDateTime");
  if (dateStr) {
    fileName = new Date(dateStr)
      .toISOString()
      .replace(/\..+/, "")
      .replace(/:/g, "");
  } else {
    fileName = "file";
  }

  const ext = mime.getExtension(model.getDataValue("mimeType") || "");
  if (ext) {
    fileName = fileName + "." + ext;
  }
  return fileName;
}

export function geometrySetter(val) {
  // Put here so old apps that send location in a string still work.
  // TODO remove this when nobody is using the old app that sends a string.
  if (typeof val === "string") {
    return;
  }
  this.setDataValue("location", { type: "Point", coordinates: val });
}

export function getFromId(id: number, user: User, attributes) {
  const modelClass = this;
  return new Promise((resolve) => {
    // Get just public models if no user was given
    if (!user) {
      return modelClass
        .findOne({ where: { id: id, public: true } })
        .then(resolve);
    }

    user
      .getGroupsIds()
      .then((ids) => {
        // Condition where you get a public recordin or a recording that you
        // have permission to view (in same group).
        const condition = {
          where: {
            id: id,
            [Op.or]: [{ GroupId: { [Op.in]: ids } }, { public: true }],
          },
          attributes,
        };
        return modelClass.findOne(condition);
      })
      .then(resolve);
  });
}

/**
 * Deletes the deleteModelInstance and the file attached to the model with the
 * given id.
 * A promise is returned that will resolve if successful and reject if failed
 * to delete the file and modelInstance.
 */
// FIXME - this is dead code?
export function deleteModelInstance(id, user) {
  const modelClass = this;
  let modelInstance = null;
  return new Promise((resolve, reject) => {
    modelClass
      .getFromId(id, user, ["fileKey", "id"])
      .then((mi) => {
        modelInstance = mi;
        if (modelInstance === null) {
          throw new ClientError("No file found");
        }
        return modelInstance.fileKey;
      })
      .then((fileKey) => deleteFile(fileKey))
      .then(() => modelInstance.destroy())
      .then(resolve)
      .catch(reject);
  });
}

export function userCanEdit(id, user) {
  const modelClass = this;
  return new Promise((resolve) => {
    //models.User.where
    modelClass.getFromId(id, user, ["id"]).then((result) => {
      if (result === null) {
        return resolve(false);
      } else {
        return resolve(true);
      }
    });
  });
}

export function openS3() {
  // This is a shim around the s3 compatible object store provider.
  // Based on the bucket passed in the params if there is no object key provided,
  // pick the correct s3 provider.  If there is a key provided, pick the provider
  // based on the prefix of the key `bb_` prefix for backblaze, otherwise use the
  // local minio storage.

  const providers = {
    s3Local: null,
    s3Archive: null,
  };

  const getProviderForParams = (params: {
    Key?: string;
    Bucket?: string;
    Prefix?: string;
  }): AWS.S3 => {
    if (!params.Key && !params.Bucket && !params.Prefix) {
      throw new Error("s3 params must contain a 'Key' or a 'Bucket' field");
    }
    let chooseProvider = "s3Local";
    if (
      config.hasOwnProperty("s3Archive") &&
      ((params.Key && params.Key.startsWith("a_")) ||
        (params.Prefix && params.Prefix.startsWith("a_")) ||
        (!params.Key &&
          !params.Prefix &&
          params.Bucket === config.s3Archive.bucket))
    ) {
      // NOTE: If archive bucket is not configured, we fall back to just using local.
      chooseProvider = "s3Archive";
    }
    if (chooseProvider === "s3Archive") {
      params.Bucket = config.s3Archive.bucket;
      if (!providers.s3Archive) {
        providers.s3Archive = new AWS.S3({
          endpoint: config.s3Archive.endpoint,
          accessKeyId: config.s3Archive.publicKey,
          secretAccessKey: config.s3Archive.privateKey,
          s3ForcePathStyle: true, // needed for minio
        });
      }
      return providers.s3Archive as AWS.S3;
    } else {
      params.Bucket = config.s3Local.bucket;
      if (!providers.s3Local) {
        providers.s3Local = new AWS.S3({
          endpoint: config.s3Local.endpoint,
          accessKeyId: config.s3Local.publicKey,
          secretAccessKey: config.s3Local.privateKey,
          s3ForcePathStyle: true, // needed for minio
        });
      }
      return providers.s3Local as AWS.S3;
    }
  };

  return {
    getObject(params, callback?) {
      return getProviderForParams(params).getObject(params, callback);
    },
    copyObject(params, callback?) {
      return getProviderForParams(params).copyObject(params, callback);
    },
    deleteObject(params, callback?) {
      return getProviderForParams(params).deleteObject(params, callback);
    },
    listObjects(params, callback?) {
      return getProviderForParams(params).listObjects(params, callback);
    },
    headObject(params, callback?) {
      return getProviderForParams(params).headObject(params, callback);
    },
    upload(params, callback?) {
      return getProviderForParams(params).upload(params, callback);
    },
    headBucket(params, callback?) {
      return getProviderForParams(params).headBucket(params, callback);
    },
    createBucket(params, callback?) {
      return getProviderForParams(params).createBucket(params, callback);
    },
    listBuckets(params, callback?) {
      return getProviderForParams(params).listBuckets(callback);
    },
  };
}

export function saveFile(file /* model.File */) {
  const model = this;
  return new Promise(function (resolve, reject) {
    // Gets date object set to recordingDateTime field or now if field not set.
    const date = new Date(
      model.getDataValue("recordingDateTime") || new Date()
    );

    // Generate key for file using the date.
    const key = `${date.getFullYear()}/${date.getMonth()}/${date
      .toISOString()
      .replace(/\..+/, "")
      .replace(/:/g, "")}_${Math.random().toString(36).substr(2)}`;

    // Save file with key.
    const s3 = openS3();
    fs.readFile(file.path, function (err, data) {
      const params = {
        Key: key,
        Body: data,
      };
      s3.upload(params, function (err) {
        if (err) {
          log.error("Error with saving to S3.");
          log.error(err.toString());
          return reject(err);
        } else {
          fs.unlinkSync(file.path); // Delete local file.
          log.info("Successful saving to S3.");
          file.key = key;

          model.setDataValue("filename", file.name);
          model.setDataValue("mimeType", file.mimeType);
          model.setDataValue("size", file.size);
          model.setDataValue("fileKey", file.key);
          return resolve(model.save());
        }
      });
    });
  });
}

export function deleteFile(fileKey) {
  return new Promise((resolve, reject) => {
    const s3 = openS3();
    const params = {
      Key: fileKey,
    };
    s3.deleteObject(params, function (err, data) {
      if (err) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
}

export default {
  geometrySetter,
  findAllWithUser,
  getFileData,
  getFromId,
  deleteModelInstance,
  userCanEdit,
  openS3,
  saveFile,
};
