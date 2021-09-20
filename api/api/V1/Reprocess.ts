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

import middleware, { validateFields } from "../middleware";
import auth from "../auth";
import { body, param } from "express-validator";

import { reprocessRecording, StatusCode } from "./recordingUtil";
import { Application, Response, Request } from "express";
import { extractValidJWT } from "../extract-middleware";
import { idOf } from "../validation-middleware";
import responseUtil from "./responseUtil";

export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/reprocess`;

  /**
   * @api {get} /api/v1/reprocess/:id
   * @apiName Reprocess
   * @apiGroup Recordings
   * @apiParam {Number} id of recording to reprocess
   * @apiDescription Marks a recording for reprocessing and archives existing tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId - recording_id reprocessed
   */
  app.get(
    `${apiUrl}/:id`,
    extractValidJWT,
    validateFields([idOf(param("id"))]),
    auth.authenticateAndExtractUser,
    // FIXME - recording permissions checking should happen here?

    // FIXME - Any user can ask for all their recordings to be reprocessed at once
    //  This is a good way for us to get DDOS'd
    async (request: Request, response: Response) => {
      const responseInfo = await reprocessRecording(
        response.locals.requestUser,
        request.params.id
      );
      responseUtil.send(response, responseInfo);
    }
  );

  /**
   * @api {post} /api/v1/reprocess Mark recordings for reprocessing
   * @apiName ReprocessMultiple
   * @apiGroup Recordings
   * @apiParam {JSON} recordings an array of recording ids to reprocess
   *
   * @apiDescription Mark one or more recordings for reprocessing,
   * archiving any tracks and recording tags that are associated with
   * them.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1RecordingReprocessResponse
   */
  app.post(
    apiUrl,
    extractValidJWT,
    // FIXME - Should this be a JSON schema of something?
    validateFields([middleware.parseJSON("recordings", body)]),
    auth.authenticateAndExtractUser,
    async (request: Request, response: Response) => {
      // FIXME Simplify
      const recordings = request.body.recordings;
      const responseMessage = {
        statusCode: 200,
        messages: [],
        reprocessed: [],
        fail: [],
      };

      let status = 0;
      for (let i = 0; i < recordings.length; i++) {
        // FIXME - Pull out user privileges check
        const resp = await reprocessRecording(
          response.locals.requestUser,
          recordings[i]
        );
        if (resp.statusCode !== 200) {
          status = status | StatusCode.Fail;
          responseMessage.messages.push(resp.messages[0]);
          responseMessage.statusCode = resp.statusCode;
          responseMessage.fail.push(resp.recordingId);
        } else {
          responseMessage.reprocessed.push(resp.recordingId);
          status = status | StatusCode.Success;
        }
      }

      function getReprocessMessage(status) {
        switch (status) {
          case StatusCode.Success:
            return "All recordings scheduled for reprocessing";
          case StatusCode.Fail:
            return "Recordings could not be scheduled for reprocessing";
          case StatusCode.Both:
            return "Some recordings could not be scheduled for reprocessing";
          default:
            return "";
        }
      }
      responseMessage.messages.splice(0, 0, getReprocessMessage(status));
      responseUtil.send(response, responseMessage);
    }
  );
};
