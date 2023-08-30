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
import modelsInit from "@models/index.js";
import util from "./util.js";
import { successResponse } from "./responseUtil.js";
import config from "@config";
import jsonwebtoken from "jsonwebtoken";
import { param, query } from "express-validator";
import type { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  extractJwtAuthorizedUserOrDevice,
  fetchUnauthorizedRequiredFileById,
} from "../extract-middleware.js";
import type { File } from "@models/File.js";
import { Op } from "sequelize";
import { idOf } from "@api/validation-middleware.js";
import { AuthorizationError } from "@api/customErrors.js";
import type { ApiAudiobaitFileResponse } from "@typedefs/api/file.js";
import classification from "@/classifications/classification.json" assert { type: "json" };
import type { User } from "@models/User.js";

const models = await modelsInit();

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
   * @api {get} /api/v1/files/classifications Get classification json file
   * @apiName GetClassificationJsonFile
   * @apiGroup Files
   * @apiDescription Returns the versioned classification json.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiQuery {String} [version] The current version of the classification.
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiClassificationResponse} classification.json
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/classifications`,
    extractJwtAuthorizedUser,
    validateFields([query("version").optional().isString()]),
    async (request: Request, response: Response) => {
      const version = request.query.version as string;
      if (classification.version === version) {
        return successResponse(response, { version: classification.version });
      }
      response.setHeader("Content-Type", "application/json");

      return successResponse(
        response,
        "Retrieved classification.json",
        classification
      );
    }
  );

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
    util.multipartUpload(
      "f",
      async (
        uploader,
        uploadingDevice,
        uploadingUser,
        data,
        keys,
        uploadedFileDatas
      ): Promise<File> => {
        console.assert(
          keys.length === 1,
          "Only expected 1 file attachment for this end-point"
        );
        const dbRecord = models.File.buildSafely(data);
        dbRecord.UserId = (uploadingUser as User).id;
        dbRecord.fileKey = keys[0];
        dbRecord.fileSize = uploadedFileDatas[0].data.length;
        await dbRecord.save();
        return dbRecord;
      }
    )
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
      return successResponse(response, "Completed query.", {
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
      const user = response.locals.requestUser;
      const device = response.locals.requestDevice;
      const downloadFileData = {
        _type: "fileDownload",
        key: file.fileKey,
      };
      if (user) {
        (downloadFileData as any).userId = user.id;
      } else if (device) {
        (downloadFileData as any).deviceId = device.id;
      }

      return successResponse(response, "", {
        file: mapAudiobaitFile(file),
        fileSize:
          file.fileSize || (await util.getS3ObjectFileSize(file.fileKey)),
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
      return successResponse(response, "Deleted file.");
    }
  );
};
