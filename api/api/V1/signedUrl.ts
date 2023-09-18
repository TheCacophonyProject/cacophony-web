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

import middleware from "../middleware.js";
import { ClientError } from "../customErrors.js";
import type { Application, Request, Response } from "express";
import type { GroupId, UserId } from "@typedefs/api/common.js";
import modelsInit from "@models/index.js";
import { SuperUsers } from "@/Globals.js";
import { Op } from "sequelize";
import { openS3 } from "@models/util/util.js";
import { signedUrl } from "@api/auth.js";
import type { ReadableStream } from "stream/web";
import { serverErrorResponse } from "@api/V1/responseUtil.js";

const models = await modelsInit();

export const streamS3Object = async (
  request: Request,
  response: Response,
  key: string,
  fileName: string,
  mimeType: string,
  userId?: UserId,
  groupId?: GroupId,
  fileSize?: number
) => {
  // NOTE: The internal NodeJS writable stream that is in an express object
  //  doesn't allow you to set a lower highwaterMark to allow a bit of back-pressure
  //  on slower connections, and therefore restrict how much data we're pulling from
  //  our S3 providers in the case that the request is canceled for instance.
  //  So in terms of recording bytes transferred for billing purposes, we basically
  //  may have to attribute more bytes to the download than were actually used by the
  //  end-user browser request.
  response.setHeader("Content-disposition", "attachment; filename=" + fileName);
  response.setHeader("Transfer-Encoding", "chunked");
  response.setHeader("Content-type", mimeType);
  if (fileSize) {
    response.setHeader("Content-Length", fileSize);
  }

  const s3 = openS3();

  try {
    const s3Request = await s3.getObject(key);
    const webStream = s3Request.Body as unknown as ReadableStream;
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
        `bytes ${start}-${end}/${totalLength}`
      );
      response.setHeader("Accept-Ranges", "bytes");
    }
    for await (const chunk of webStream) {
      dataStreamed += chunk.length;
      response.write(chunk);
    }
    if (userId && groupId) {
      // Log out to the DB how much we streamed for this user.
      const groupUser = await models.GroupUsers.findOne({
        where: {
          UserId: userId,
          GroupId: groupId,
          removedAt: { [Op.eq]: null },
        },
      });
      if (!groupUser && SuperUsers.has(userId)) {
        // NOTE: If the user is a super-user, just attribute it to their user.
        const user = await models.User.getFromId(userId);
        if (user) {
          await user.increment({
            transferredBytes: dataStreamed,
            transferredItems: 1,
          });
        }
      } else {
        await groupUser.increment({
          transferredBytes: dataStreamed,
          transferredItems: 1,
        });
      }
    }
    response.end();
  } catch (err) {
    return serverErrorResponse(request, response, err);
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
    [signedUrl],
    middleware.requestWrapper(async (request, response) => {
      // TODO: If this signed url has a user, then we can attribute downloads + bandwidth
      //  to that user for billing purposes.
      const mimeType = request.jwtDecoded.mimeType || "";
      const fileName = request.jwtDecoded.filename || "file";
      const userId = request.jwtDecoded.userId;
      const groupId = request.jwtDecoded.groupId;

      const key = request.jwtDecoded.key;
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
        groupId
      );
    })
  );
}
