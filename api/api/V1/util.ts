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
import log from "@log";
import crypto from "crypto";
import type { Request } from "express";
import { Readable } from "stream";
import { openS3 } from "@models/util/util.js";
import {
  ReadableStream as WebReadableStream,
  TransformStream,
} from "stream/web";

export const uploadFileStream = async (
  request: Request,
  keyPrefix?: string,
  fullKey?: string,
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

  let dataLength = 0;
  let hasLength = false;
  if (request.body && request.body.length) {
    dataLength = request.body.length;
    hasLength = true;
  }
  const body = request.body
    ? Readable.from(request.body)
    : Readable.from(request);
  const stream: WebReadableStream = Readable.toWeb(body);
  const transform = new TransformStream({
    transform(chunk, controller) {
      if (!hasLength) {
        dataLength += chunk.length;
      }
      hash.update(chunk, "binary");
      controller.enqueue(chunk);
    },
  });
  const transformedStream = stream.pipeThrough(transform);
  const upload = openS3().uploadStreaming(fullKey, transformedStream);
  await upload.done().catch((err) => {
    log.error(`upload error: ${err}`);
    return err;
  });
  const digest = hash.digest("hex");
  return {
    hash: digest,
    key: fullKey,
    size: dataLength,
  };
};

function getS3Object(fileKey: string) {
  const s3 = openS3();
  return s3.headObject(fileKey);
}

async function getS3ObjectFileSize(fileKey: string) {
  try {
    const s3Ojb = await getS3Object(fileKey);
    return s3Ojb.ContentLength;
  } catch (err: unknown) {
    let message = "unknown error";
    if (err instanceof Error) {
      message = err.message;
    }
    log.warning(
      `Error retrieving S3 Object for with fileKey: ${fileKey}. Error was: ${message}`,
    );
  }
}

async function deleteS3Object(fileKey: string) {
  const s3 = openS3();
  return s3.deleteObject(fileKey);
}

export default {
  deleteS3Object,
  getS3ObjectFileSize,
};
