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
  ListObjectsCommandInput,
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
  ListObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import config from "@config";
import type { LatLng } from "@typedefs/api/common.js";
import { DataTypes, Model } from "sequelize";
import { canonicalLatLng } from "@models/util/locationUtils.js";
import { isLatLng } from "@models/util/validation.js";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import * as https from "node:https";

const providers: Record<string, S3Client | null> = {
  s3Local: null,
  s3Archive: null,
};

export function openS3() {
  // This is a shim around the s3 compatible object store provider.
  // Based on the bucket passed in the params if there is no object key provided,
  // pick the correct s3 provider.  If there is a key provided, pick the provider
  // based on the prefix of the key `a_` prefix for backblaze, otherwise use the
  // local minio storage.

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
      "s3Archive" in config &&
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
          requestHandler: new NodeHttpHandler({
            httpsAgent: new https.Agent({
              keepAlive: true,
              maxSockets: 100,
              maxFreeSockets: 10,
              timeout: 60000,
            }),
            connectionTimeout: 5000,
            requestTimeout: 60000,
          }),
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
          requestHandler: new NodeHttpHandler({
            httpsAgent: new https.Agent({
              keepAlive: true,
              maxSockets: 100,
              maxFreeSockets: 10,
              timeout: 60000,
            }),
            connectionTimeout: 5000,
            requestTimeout: 60000,
          }),
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
    listObjects(params: ListObjectsCommandInput) {
      const { client, bucket } = getProviderForParams(params);
      return client.send(new ListObjectsCommand({ ...params, Bucket: bucket }));
    },
    headObject(key: string) {
      const { client, bucket } = getProviderForParams({ Key: key });
      return client.send(new HeadObjectCommand({ Key: key, Bucket: bucket }));
    },
    upload(
      key: string,
      body: Buffer | Uint8Array,
      metadata?: Record<string, string>,
    ) {
      const { client, bucket } = getProviderForParams({ Key: key });
      const length = (body as Buffer).length || 0; //"length" in body ? body.length : 0;
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
      body: ReadableStream,
      metadata?: Record<string, string>,
    ) {
      const { client, bucket } = getProviderForParams({ Key: key });
      const payload: PutObjectCommandInput = {
        Key: key,
        Body: body,
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
        new HeadBucketCommand({ Bucket: bucket } as HeadBucketCommandInput),
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

type PossibleLocationInput =
  | { coordinates: [number, number] }
  | [number, number]
  | LatLng
  | string
  | undefined
  | null;

export const geometrySetter = (
  val: PossibleLocationInput,
): { type: "Point"; coordinates: [number, number] } | null | string => {
  if (val === undefined || val === null || typeof val === "string") {
    if (typeof val === "string" && val.includes("case")) {
      console.log(`Geometry setter received string with 'case': ${val}`);
      return val;
    }
    return null;
  }
  const location = canonicalLatLng(val);
  // Flip coordinates to X,Y, expected by PostGIS (Longitude, Latitude)
  return {
    type: "Point",
    coordinates: [location.lng, location.lat],
  };
};

export function locationField(fieldName = "location") {
  return {
    type: DataTypes.GEOMETRY,
    set(value: PossibleLocationInput) {
      (this as unknown as Model).setDataValue(fieldName, geometrySetter(value));
    },
    get(): LatLng | null {
      const location = (this as unknown as Model).getDataValue(fieldName);
      if (location) {
        return canonicalLatLng(location);
      }
      return null;
    },
    validate: {
      isLatLon: isLatLng,
    },
  };
}
