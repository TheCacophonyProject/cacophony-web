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

import type {
  HeadBucketCommandInput,
  PutObjectCommandInput,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime";
import config from "@config";
import type { LatLng } from "@typedefs/api/common.js";
import { DataTypes } from "sequelize";
import { canonicalLatLng } from "@models/util/locationUtils.js";
import { isLatLon } from "@models/util/validation.js";
import type { Readable } from "stream";
import type { ReadableStream } from "stream/web";

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
  }): { client: S3Client; bucket: string } => {
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
      if (!providers.s3Archive) {
        const clientConfig: S3ClientConfig = {
          region: "dummy-region",
          endpoint: config.s3Archive.endpoint,
          credentials: {
            accessKeyId: config.s3Archive.publicKey,
            secretAccessKey: config.s3Archive.privateKey,
          },
          forcePathStyle: true, // needed for minio
        };
        providers.s3Archive = new S3Client(clientConfig);
      }
      return {
        client: providers.s3Archive as S3Client,
        bucket: config.s3Archive.bucket,
      };
    } else {
      if (!providers.s3Local) {
        const clientConfig: S3ClientConfig = {
          region: "dummy-region",
          endpoint: config.s3Local.endpoint,
          credentials: {
            accessKeyId: config.s3Local.publicKey,
            secretAccessKey: config.s3Local.privateKey,
          },
          forcePathStyle: true, // needed for minio
        };
        providers.s3Local = new S3Client(clientConfig);
      }
      return {
        client: providers.s3Local as S3Client,
        bucket: config.s3Local.bucket,
      };
    }
  };

  return {
    getObject(key: string) {
      const { client, bucket } = getProviderForParams({ Key: key });
      return client.send(new GetObjectCommand({ Key: key, Bucket: bucket }));
    },
    // copyObject(params: CopyObjectCommandInput) {
    //   const { client, bucket} = getProviderForParams(params);
    //   return getProviderForParams(params).send(new CopyObjectCommand(params));
    // },
    deleteObject(key: string) {
      const { client, bucket } = getProviderForParams({ Key: key });
      return client.send(new DeleteObjectCommand({ Key: key, Bucket: bucket }));
    },
    // listObjects(params: ListObjectsCommandInput) {
    //   const { client, bucket} = getProviderForParams(params);
    //   return client.send(new ListObjectsCommand({ ...params, Bucket: bucket }));
    // },
    headObject(key: string) {
      const { client, bucket } = getProviderForParams({ Key: key });
      return client.send(new HeadObjectCommand({ Key: key, Bucket: bucket }));
    },
    upload(key: string, body: Buffer | Uint8Array, metadata?: any) {
      const { client, bucket } = getProviderForParams({ Key: key });
      console.log((body as Buffer).length);
      const length = (body as Buffer).length || 0; //"length" in body ? body.length : 0;
      console.log("Uploading", length);
      const payload: PutObjectCommandInput = {
        Key: key,
        Body: body,
        Bucket: bucket,
        ContentLength: length,
      };
      if (metadata) {
        payload.Metadata = metadata;
      }
      return client.send(new PutObjectCommand(payload));
    },
    uploadStreaming(
      key: string,
      body: Readable | ReadableStream,
      metadata?: any
    ) {
      const { client, bucket } = getProviderForParams({ Key: key });
      const payload: PutObjectCommandInput = {
        Key: key,
        Body: body as any,
        Bucket: bucket,
      };
      if (metadata) {
        payload.Metadata = metadata;
      }

      return new Upload({
        client,
        params: payload,
        leavePartsOnError: false,
      });
    },
    headBucket(suppliedBucket?: string) {
      const params: { Bucket?: string } = {};
      if (suppliedBucket) {
        params.Bucket = suppliedBucket;
      }
      const { client, bucket } = getProviderForParams(params);
      return client.send(
        new HeadBucketCommand({ Bucket: bucket } as HeadBucketCommandInput)
      );
    },
    // createBucket(params: CreateBucketCommandInput) {
    //   const { client, bucket} = getProviderForParams(params);
    //   return client.send(new CreateBucketCommand(params));
    // },
    // listBuckets(params: ListBucketsCommandInput) {
    //   const { client, bucket} = getProviderForParams(params);
    //   return getProviderForParams(params).send(new ListBucketsCommand(params));
    // },
  };
}

export async function deleteFile(fileKey: string) {
  const s3 = openS3();
  return s3.deleteObject(fileKey);
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
      isLatLon: isLatLon,
    },
  };
}
