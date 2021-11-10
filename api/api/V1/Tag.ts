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

import { expectedTypeOf, validateFields } from "../middleware";
import { body } from "express-validator";
import models from "@models";
import recordingUtil from "./recordingUtil";
import responseUtil from "./responseUtil";
import { Application, Request, Response } from "express";
import {
  parseJSONField,
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredRecordingById,
} from "../extract-middleware";
import { idOf } from "../validation-middleware";
import { jsonSchemaOf } from "../schema-validation";
import ApiRecordingTagRequest from "@schemas/api/tag/ApiRecordingTagRequest.schema.json";

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
   * @apiparam {JSON} tag Tag data in JSON format.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} tagId ID of the tag just added.
   *
   * @apiuse V1ResponseError
   *
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      body("tag")
        .custom(jsonSchemaOf(ApiRecordingTagRequest))
        .withMessage(expectedTypeOf("ApiRecordingTagRequest")),
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
      const tagInstance = await recordingUtil.addTag(
        response.locals.requestUser,
        response.locals.recording,
        request.body.tag
      );
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Added new tag."],
        tagId: tagInstance.id,
      });
    }
  );

  /**
   * @api {delete} /api/v1/tags Delete a given recording tag
   * @apiName DeleteTag
   * @apiGroup Tag
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} tagId id of the tag to delete.
   *
   * @apiUse V1ResponseSuccess
   * @apiuse V1ResponseError
   *
   */
  app.delete(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([idOf(body("tagId"))]),
    async function (request: Request, response: Response) {
      const user = models.User.findByPk(response.locals.requestUser.id);
      const tagDeleteResult = await models.Tag.deleteFromId(
        request.body.tagId,
        user
      );
      if (tagDeleteResult) {
        return responseUtil.send(response, {
          statusCode: 200,
          messages: ["Deleted tag."],
        });
      } else {
        return responseUtil.send(response, {
          statusCode: 400,
          messages: ["Failed to delete tag."],
        });
      }
    }
  );
}
