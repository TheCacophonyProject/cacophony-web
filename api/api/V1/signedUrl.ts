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

import { validateFields } from "../middleware.js";
import config from "@config";
import { ClientError } from "../customErrors.js";
import type { Application, NextFunction, Request, Response } from "express";
import type { GroupId, UserId } from "@typedefs/api/common.js";
import { SuperUsers } from "@/Globals.js";
import { Op } from "sequelize";
import { openS3 } from "@models/util/util.js";
import type { ReadableStream } from "stream/web";
import { serverErrorResponse } from "@api/V1/responseUtil.js";
import fs from "fs/promises";
import { GroupUsers } from "@models/GroupUsers.js";
import { User } from "@models/User.js";
import jwt, { JwtPayload } from "jsonwebtoken";
import { once } from "events";
import { query } from "express-validator";
import { HttpStatusCode } from "@typedefs/api/consts.js";
import logging from "@log";

export const streamS3Object = async (
  request: Request,
  response: Response,
  key: string,
  fileName: string,
  mimeType: string,
  userId?: UserId,
  groupId?: GroupId,
  fileSize?: number,
) => {
  const requestIsCptv = mimeType === "application/x-cptv";
  const recordingIsSecret = async () => {
    const recordingIsPartOfSecretGroup =
      groupId && config.groupIdsWithRedactedThermalRecordings.includes(groupId);
    const requestUserIsSuperUser =
      userId &&
      SuperUsers.has(userId) &&
      !config.processingUserIds.includes(userId);
    if (requestUserIsSuperUser && recordingIsPartOfSecretGroup) {
      const superUserIsPartOfSecretGroup = await GroupUsers.findOne({
        where: { UserId: userId, GroupId: groupId, removedAt: null },
      });
      if (superUserIsPartOfSecretGroup) {
        return false;
      }
    }
    return recordingIsPartOfSecretGroup && requestUserIsSuperUser;
  };
  const isCiRequest =
    "user-agent" in request.headers &&
    request.headers["user-agent"].includes("Cypress");
  if (
    requestIsCptv &&
    ((config.server.isLocalDev && !isCiRequest) || (await recordingIsSecret()))
  ) {
    const file = await fs.readFile("./debug-files/2-second-status.cptv");
    response.setHeader(
      "Content-disposition",
      `attachment; filename=${fileName}`,
    );
    response.setHeader("Content-Type", mimeType);
    response.setHeader("Content-Length", file.length);
    response.write(file, "binary");
    return response.end(null, "binary");
  }

  // NOTE: The internal NodeJS writable stream that is in an express object
  //  doesn't allow you to set a lower highwaterMark to allow a bit of back-pressure
  //  on slower connections, and therefore restrict how much data we're pulling from
  //  our S3 providers in the case that the request is canceled for instance.
  //  So in terms of recording bytes transferred for billing purposes, we basically
  //  may have to attribute more bytes to the download than were actually used by the
  //  end-user browser request.
  response.setHeader("Content-disposition", `attachment; filename=${fileName}`);
  // Set a custom header, so we can still know the total length of the streaming file
  // and show a progress bar where we're streaming the whole file up front.
  if (fileSize) {
    response.setHeader("X-Fallback-Content-Length", fileSize);
  }
  if (!request.headers.range) {
    // seems like this removes content-length header and breaks chrome for mp4
    response.setHeader("Transfer-Encoding", "chunked");
  }
  response.setHeader("Content-type", mimeType);
  const s3 = openS3();

  let canceled = false;
  let webStream: ReadableStream | null = null;
  let nodeStream: {
    destroy: (error?: Error) => void;
  } | null = null;

  const cancelStreaming = (error: Error) => {
    if (canceled) {
      return;
    }
    canceled = true;

    try {
      if (webStream && typeof webStream.cancel === "function") {
        void webStream.cancel(error).catch(() => {
          return;
        });
      }
    } catch {
      // ignore cleanup errors
    }

    try {
      if (nodeStream && typeof nodeStream.destroy === "function") {
        nodeStream.destroy(error);
      }
    } catch {
      // ignore cleanup errors
    }
  };

  const onRequestAborted = () => {
    cancelStreaming(
      new Error("Client aborted request while streaming S3 object"),
    );
  };
  const onRequestClosed = () => {
    if (!response.writableEnded) {
      cancelStreaming(new Error("Request closed before S3 stream completed"));
    }
  };
  const onResponseClosed = () => {
    if (!response.writableEnded) {
      cancelStreaming(new Error("Response closed before S3 stream completed"));
    }
  };
  const onResponseError = (err: Error) => {
    cancelStreaming(err);
  };

  request.once("aborted", onRequestAborted);
  request.once("close", onRequestClosed);
  response.once("close", onResponseClosed);
  response.once("error", onResponseError);

  try {
    const s3Request = await s3.getObject(key);
    webStream = s3Request.Body as unknown as ReadableStream;
    nodeStream = s3Request.Body as unknown as {
      destroy: (error: Error) => void;
    };
    let dataStreamed = 0;
    if (request.headers.range) {
      // without this seeking mp4s in chrome does not work
      const totalLength = await s3
        .headObject(key)
        .then((res) => res.ContentLength);
      const range = request.headers.range;
      const positions = range.replace(/bytes=/, "").split("-");
      const start = parseInt(positions[0], 10);
      const end = positions[1] ? parseInt(positions[1], 10) : totalLength - 1;
      response.setHeader("Content-Length", totalLength);
      response.setHeader(
        "Content-Range",
        `bytes ${start}-${end}/${totalLength}`,
      );
      response.setHeader("Accept-Ranges", "bytes");
    }
    for await (const chunk of webStream) {
      if (canceled) {
        break;
      }
      dataStreamed += chunk.length;
      if (!response.write(chunk)) {
        await Promise.race([
          once(response, "drain"),
          once(response, "close"),
          once(response, "error"),
        ]);

        if (canceled || response.destroyed || response.writableEnded) {
          break;
        }
      }
    }
    if (userId && groupId && !config.processingUserIds.includes(userId)) {
      // Log out to the DB how much we streamed for this user.
      const [_rows, affectedCount] = await GroupUsers.increment(
        {
          transferredBytes: dataStreamed,
          transferredItems: canceled ? 0 : 1,
        },
        {
          where: {
            UserId: userId,
            GroupId: groupId,
            removedAt: { [Op.eq]: null },
          },
        },
      );
      if (affectedCount === 0 && SuperUsers.has(userId)) {
        // NOTE: If the user is a super-user, just attribute it to their user.
        await User.increment(
          {
            transferredBytes: dataStreamed,
            transferredItems: canceled ? 0 : 1,
          },
          {
            where: {
              id: userId,
            },
          },
        );
      }
    }
    if (!canceled && !response.writableEnded) {
      response.end();
    }
  } catch (err: unknown) {
    logging.warning(
      `Failed to stream file from object storage with key ${key}`,
    );
    if (!canceled) {
      return serverErrorResponse(request, response, err as Error);
    }
  } finally {
    request.off("aborted", onRequestAborted);
    request.off("close", onRequestClosed);
    response.off("close", onResponseClosed);
    response.off("error", onResponseError);
  }
  // TODO: We may want to support HTTP range requests, and if we do, we should be able to
  //  pass that through to our s3 providers.  It may not be supported for minio though,
  //  so we may still need to use the following hack.
  // s3.getObject(params, function (err, data) {
  //   if (err) {
  //     return serverErrorResponse(request, response, err);
  //   }
  //
  //   // NOTE: This may be a hack to get around our version of minio not supporting http range requests.
  //   if (!request.headers.range) {
  //     response.setHeader(
  //       "Content-disposition",
  //       `attachment; filename=${fileName}`
  //     );
  //     response.setHeader("Content-type", mimeType);
  //     response.setHeader("Content-Length", data.ContentLength);
  //     response.write(stream, "binary");
  //     return response.end(null, "binary");
  //   }
  //
  //   // Seems like we should be requesting the range from s3, rather than grabbing the whole
  //   // thing and then slicing it?
  //   const range = request.headers.range;
  //   const positions = range.replace(/bytes=/, "").split("-");
  //   const start = parseInt(positions[0], 10);
  //   const total = (data.Body as Buffer).length;
  //   const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
  //   const chunksize = end - start + 1;
  //
  //   const headers = {
  //     "Content-Range": "bytes " + start + "-" + end + "/" + total,
  //     "Content-Length": chunksize,
  //     "Accept-Ranges": "bytes",
  //     "Content-type": mimeType,
  //   };
  //
  //   response.writeHead(206, headers);
  //   const bufStream = new stream.PassThrough();
  //   const b2 = (data.Body as Buffer).slice(start, end + 1);
  //   bufStream.end(b2);
  //   bufStream.pipe(response);
  // });
};

export default function (app: Application, baseUrl: string) {
  /**
   * @api {get} /api/v1/signedUrl Get a file using a JWT
   * @apiName GetFile
   * @apiGroup SignedUrl
   *
   * @apiDescription Gets a file. The JWT for authentication may be
   * passed using a URL parameter or using the Authorization header
   * (as for other API endpoints).
   *
   * @apiParam {String} [jwt] the value of the downloadFileJWT field
   * from a successful [GetRecording](#api-Recordings-GetRecording)
   * request. Authentication using the Authorization header is also
   * supported.
   *
   * @apiSuccess {file} file Raw data stream of the file.
   *
   * @apiUse V1ResponseError
   */

  app.get(
    `${baseUrl}/signedUrl`,
    validateFields([query("jwt").exists().isString()]),
    async (request: Request, response: Response, next: NextFunction) => {
      // Validate the signed url JWT
      const jwtParam: string = request.query["jwt"] as string;
      let jwtDecoded: JwtPayload;
      try {
        jwtDecoded = jwt.verify(
          jwtParam,
          config.server.passportSecret,
        ) as JwtPayload;
      } catch (_e) {
        return response
          .status(HttpStatusCode.Forbidden)
          .json({ messages: ["Failed to verify JWT."] });
      }

      if (jwtDecoded._type !== "fileDownload") {
        return response
          .status(HttpStatusCode.Forbidden)
          .json({ messages: ["Incorrect JWT type."] });
      }
      response.locals.jwtDecoded = jwtDecoded;
      next();
    },
    async (request: Request, response: Response) => {
      // TODO: If this signed url has a user, then we can attribute downloads + bandwidth
      //  to that user for billing purposes.
      const jwtDecoded: JwtPayload = response.locals.jwtDecoded;
      const mimeType = jwtDecoded.mimeType || "";
      const fileName = jwtDecoded.filename || "file";
      const userId = jwtDecoded.userId;
      const groupId = jwtDecoded.groupId;

      const key = jwtDecoded.key;
      if (!key) {
        throw new ClientError("No key provided.");
      }
      await streamS3Object(
        request,
        response,
        key,
        fileName,
        mimeType,
        userId,
        groupId,
      );
    },
  );
}
