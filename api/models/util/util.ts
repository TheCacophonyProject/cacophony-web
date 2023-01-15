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
import { LatLng } from "@typedefs/api/common";
import validation from "@models/util/validation";
import { DataTypes } from "sequelize";

const EPSILON = 0.000000000001;

export const canonicalLatLng = (
  location: LatLng | { coordinates: [number, number] } | [number, number]
): LatLng => {
  if (Array.isArray(location)) {
    return { lat: location[0], lng: location[1] };
  } else if (location.hasOwnProperty("coordinates")) {
    // Lat lng is stored in the database as lng/lat (X,Y).
    // If we get lat/lng in this format we are getting it from the DB.
    return {
      lat: (location as { coordinates: [number, number] }).coordinates[1],
      lng: (location as { coordinates: [number, number] }).coordinates[0],
    };
  }
  return location as LatLng;
};

export const locationsAreEqual = (
  a: LatLng | { coordinates: [number, number] },
  b: LatLng | { coordinates: [number, number] }
): boolean => {
  const canonicalA = canonicalLatLng(a);
  const canonicalB = canonicalLatLng(b);
  // NOTE: We need to compare these numbers with an epsilon value, otherwise we get floating-point precision issues.
  return (
    Math.abs(canonicalA.lat - canonicalB.lat) < EPSILON &&
    Math.abs(canonicalA.lng - canonicalB.lng) < EPSILON
  );
};

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
  // based on the prefix of the key `a_` prefix for backblaze, otherwise use the
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

const geometrySetter = (
  val:
    | { coordinates: [number, number] }
    | [number, number]
    | LatLng
    | string
    | undefined
    | null
): { type: "Point"; coordinates: [number, number] } | null => {
  if (val === undefined || val === null || typeof val === "string") {
    return null;
  }
  const location = canonicalLatLng(val);
  // Flip coordinates to X,Y, expected by PostGIS (Longitude, Latitude)
  return {
    type: "Point",
    coordinates: [location.lng, location.lat],
  };
};

export function locationField(fieldName: string = "location") {
  return {
    type: DataTypes.GEOMETRY,
    set(value) {
      this.setDataValue(fieldName, geometrySetter(value));
    },
    get() {
      const location = this.getDataValue(fieldName);
      if (location) {
        return canonicalLatLng(location);
      }
      return null;
    },
    validate: {
      isLatLon: validation.isLatLon,
    },
  };
}

export default {
  locationField,
  userCanEdit,
  openS3,
  saveFile,
};
