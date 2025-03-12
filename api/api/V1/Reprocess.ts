/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2019  The Cacophony Project

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

import { expectedTypeOf, validateFields } from "../middleware.js";
import { body, param } from "express-validator";

import type { Application, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredFlatRecordingById,
  fetchAuthorizedRequiredFlatRecordingsByIds,
  fetchAuthorizedRequiredLimitedRecordingById,
  fetchAuthorizedRequiredLimitedRecordingsByIds,
} from "../extract-middleware.js";
import { idOf } from "../validation-middleware.js";
import { successResponse } from "./responseUtil.js";
import type { NextFunction } from "express-serve-static-core";
import { ClientError, BadRequestError } from "../customErrors.js";
import { arrayOf, jsonSchemaOf } from "../schema-validation.js";
import lodash from "lodash";
import RecordingIdSchema from "@schemas/api/common/RecordingId.schema.json" assert { type: "json" };
import { HttpStatusCode } from "@typedefs/api/consts.js";

const { uniq: dedupe } = lodash;
export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/reprocess`;

  /**
   * @api {get} /api/v1/reprocess/retry-failed/:id Retry processing a single recording which is in a failed state
   * @apiName Reprocess
   * @apiGroup Recordings
   * @apiParam {Integer} id of recording to retry
   * @apiDescription Retries processing a recording thats in a failed state
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/retry-failed/:id`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (_request: Request, response: Response, next) => {
      if (!response.locals.recording.isFailed()) {
        return next(
          new BadRequestError(
            `Recording is not in a failed state '${response.locals.recording.processingState}'`
          )
        );
      }
      if (await response.locals.recording.retryFailed()) {
        return successResponse(response, "Recording reprocessed");
      } else {
        return next(
          new BadRequestError(
            `Could not retry processing of recordings ${response.locals.recording.id}`
          )
        );
      }
    }
  );

  /**
   * @api {get} /api/v1/reprocess/:id Reprocess a single recording
   * @apiName Reprocess
   * @apiGroup Recordings
   * @apiParam {Integer} id of recording to reprocess
   * @apiDescription Marks a recording for reprocessing (tracking), and archives existing tracks.
   * Used if tracking algorithms have changed
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (_request: Request, response: Response) => {
      await response.locals.recording.reprocess();
      return successResponse(response, "Recording reprocessed");
    }
  );

  /**
   * @api {post} /api/v1/reprocess Mark recordings for reprocessing
   * @apiName ReprocessMultiple
   * @apiGroup Recordings
   * @apiParam {Integer[]} recordings an array of recording ids to reprocess
   *
   * @apiDescription Mark one or more recordings for reprocessing,
   * archiving any tracks and recording tags that are associated with
   * them.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      body("recordings")
        .exists()
        .withMessage(expectedTypeOf("RecordingId[]"))
        .bail()
        .toArray()
        .custom(jsonSchemaOf(arrayOf(RecordingIdSchema))),
    ]),
    fetchAuthorizedRequiredFlatRecordingsByIds(body("recordings")),
    async (request: Request, response: Response, next: NextFunction) => {
      // FIXME: Anyone who can see a recording can ask for it to be reprocessed
      //  currently, but should be with the exception of users with globalRead permissions?
      const recordings = response.locals.recordings;
      // NOTE: Dedupe array when length checking in case the user specified the same recordingId more than once.
      if (recordings.length !== dedupe(request.body.recordings).length) {
        return next(
          new ClientError(
            "Could not find all recordingIds for user that were supplied to be reprocessed. No recordings where reprocessed",
            HttpStatusCode.Forbidden
          )
        );
      }
      for (const recording of recordings) {
        await recording.reprocess();
      }
      return successResponse(response, "Recordings scheduled for reprocessing");
    }
  );
};
