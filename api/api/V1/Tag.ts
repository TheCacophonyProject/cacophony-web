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

import { expectedTypeOf, validateFields } from "../middleware.js";
import { body } from "express-validator";
import modelsInit from "@models/index.js";
import { successResponse } from "./responseUtil.js";
import type { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredRecordingById,
  parseJSONField,
} from "../extract-middleware.js";
import { idOf } from "../validation-middleware.js";
import { jsonSchemaOf } from "../schema-validation.js";
import ApiRecordingTagRequest from "@schemas/api/tag/ApiRecordingTagRequest.schema.json" assert { type: "json" };
import { ClientError } from "@api/customErrors.js";
import { addTag } from "@api/V1/recordingUtil.js";

const models = await modelsInit();
export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/tags`;

  /**
   * @api {post} /api/v1/tags Adds a new tag
   * @apiName AddTag
   * @apiGroup Tag
   * @apiDeprecated Functionality moved to "POST /api/v1/recordings/:recordingId/tags"
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number} recordingId ID of the recording that you want to tag.
   * @apiParam {JSON} tag Tag data in JSON format.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} tagId ID of the tag just added.
   *
   * @apiUse V1ResponseError
   *
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      body("tag")
        .exists()
        .withMessage(expectedTypeOf("ApiRecordingTagRequest"))
        .bail()
        .custom(jsonSchemaOf(ApiRecordingTagRequest)),

      idOf(body("recordingId")),
    ]),
    parseJSONField(body("tag")),
    // We want a recording that this user has permissions for, and has permissions to tag.
    fetchAuthorizedRequiredRecordingById(body("recordingId")),

    // FIXME - may want to revisit these tagging rules
    // The rules for who can tag a recording are:
    // Anyone with direct access via a group or device
    // Anyone with superuser write access

    // Not anyone with only superuser read access
    // Not anyone with only public access
    async function (request: Request, response: Response) {
      const tagInstance = await addTag(
        models,
        response.locals.requestUser,
        response.locals.recording,
        request.body.tag
      );
      return successResponse(response, "Added new tag.", {
        tagId: tagInstance.id,
      });
    }
  );

  /**
   * @api {delete} /api/v1/tags Delete a given recording tag
   * @apiName DeleteTag
   * @apiDeprecated Functionality moved to "DELETE /api/v1/recordings/:recordingId/tags/:tagId"
   * @apiGroup Tag
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} tagId id of the tag to delete.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   *
   */
  app.delete(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([idOf(body("tagId"))]),
    async (request: Request, response: Response, next: NextFunction) => {
      const tag = await models.Tag.findByPk(request.body.tagId);
      if (tag) {
        response.locals.tag = tag;
        // FIXME(ManageStations): This breaks undeleting tags in power-tagger.
        //  Need to check with tagger JWT. - Actually, there seems to already be a dedicated API that uses tagJWT for this.
        //  Is the front-end just using the wrong api here?  Oh wait, this is for *recording* tags, not track tags.
        await fetchAuthorizedRequiredRecordingById(tag.recordingId)(
          request,
          response,
          next
        );
      } else {
        next(new ClientError("Failed to delete tag."));
      }
    },
    async function (request: Request, response: Response) {
      // There is a matching tag, and the user has access to the corresponding recording.
      await response.locals.tag.destroy();
      return successResponse(response, "Deleted tag.");
    }
  );
}
