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

import { validateFields } from "../middleware";
import models from "@models";
import util from "./util";
import responseUtil from "./responseUtil";
import config from "@config";
import jsonwebtoken from "jsonwebtoken";
import { param, query } from "express-validator";
import { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  extractJwtAuthorizedUserOrDevice,
  fetchUnauthorizedRequiredFileById,
} from "../extract-middleware";
import { File } from "@models/File";
import { Op } from "sequelize";
import { idOf } from "@api/validation-middleware";
import { AuthorizationError } from "@api/customErrors";
import { ApiAudiobaitFileResponse } from "@typedefs/api/file";

const mapAudiobaitFile = (file: File): ApiAudiobaitFileResponse => {
  return {
    id: file.id,
    details: file.details,
    userId: file.UserId,
  };
};

const mapAudiobaitFiles = (files: File[]): ApiAudiobaitFileResponse[] => {
  return files.map(mapAudiobaitFile);
};

export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/files`;

  /**
   * @api {post} /api/v1/files Adds a new file.
   * @apiName PostUserFile
   * @apiGroup Files
   * @apiDescription This call is used for upload a file, eg an audio bait file.
   * is required:
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {JSON} data Metadata about the recording in JSON format.  It must include the field 'type' (eg. audioBait).
   * @apiBody {File} file File of the recording.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} fileKey S3 object storage key of the uploaded file.
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    util.multipartUpload("f", async (uploader, data, key): Promise<File> => {
      const dbRecord = models.File.buildSafely(data);
      dbRecord.UserId = uploader.id;
      dbRecord.fileKey = key;
      dbRecord.fileSize = data.fileSize;
      await dbRecord.save();
      return dbRecord;
    })
  );

  /**
   * @api {get} /api/v1/files List all current audioBait files
   * @apiName QueryFiles
   * @apiGroup Files
   * @apiHeader {String} Authorization Signed JSON web token for a user or device.
   * @apiQuery {String="audioBait"} type Currently the only type of file you can query is "audioBait"
   *
   * @apiUse V1ResponseSuccessQuery
   */
  app.get(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([query("type").equals("audioBait")]),
    async (request: Request, response: Response) => {
      const result = await models.File.query(
        {
          type: { [Op.eq]: request.query.type },
        },
        0,
        1000
      );

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        count: result.count,
        files: mapAudiobaitFiles(result.rows),
      });
    }
  );

  /**
   * @api {get} /api/v1/files/:id Get a file by its unique id
   * @apiName GetFile
   * @apiGroup Files
   * @apiUse MetaDataAndJWT
   * @apiParam {Integer} id id of the file to get
   *
   * @apiHeader {String} Authorization Signed JSON web token for either a user or a device.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} fileSize the number of bytes in the file.
   * @apiSuccess {String} jwt JSON Web Token to use to download the
   * recording file.
   * @apiSuccess {JSON} file Metadata for the file.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUserOrDevice,
    validateFields([idOf(param("id"))]),
    fetchUnauthorizedRequiredFileById(param("id")),
    async (request: Request, response: Response) => {
      const file = response.locals.file;
      const downloadFileData = {
        _type: "fileDownload",
        key: file.fileKey,
      };

      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        file: mapAudiobaitFile(file),
        fileSize: await util.getS3ObjectFileSize(file.fileKey),
        jwt: jsonwebtoken.sign(downloadFileData, config.server.passportSecret, {
          expiresIn: 60 * 10,
        }),
      });
    }
  );

  /**
   * @api {delete} /api/v1/files/:id Delete an existing file
   * @apiName DeleteFile
   * @apiGroup Files
   * @apiParam {Integer} id id of the file to delete
   * @apiDescription This call deletes a file.  The user making the
   * call must have uploaded the file or be an administrator.
   *
   * [/api/v1/signedUrl API](#api-SignedUrl-GetFile).
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchUnauthorizedRequiredFileById(param("id")),
    async (request, response, next: NextFunction) => {
      const user = response.locals.requestUser;
      const file = response.locals.file;
      if (user.hasGlobalWrite() || user.id === file.UserId) {
        await file.destroy();
      } else {
        return next(
          new AuthorizationError(
            "The user does not own that file and is not a global admin!"
          )
        );
      }

      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Deleted file."],
      });
    }
  );
};
