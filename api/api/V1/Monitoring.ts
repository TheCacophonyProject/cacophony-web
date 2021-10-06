/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2021  The Cacophony Project

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

import middleware, {
  validateFields,
  expectedTypeOf,
  isIntArray,
} from "../middleware";
import { Application, Response, Request } from "express";
import {
  calculateMonitoringPageCriteria,
  MonitoringParams,
} from "./monitoringPage";
import { generateVisits } from "./monitoringVisit";
import responseUtil from "./responseUtil";
import { query } from "express-validator";
import { extractJwtAuthorizedUser } from "../extract-middleware";
import { User } from "models/User";
import models from "@models";

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/monitoring`;

  /**
     * @api {get} /api/v1/monitoring/page Get visits page
     * @apiName MonitoringPage
     * @apiGroup Monitoring
     * @apiDescription Get a page of monitoring visits.   Visits are returned with the most recent ones listed first.
     *
     * As part of this process recordings are sorted into visits and then the best-classification for each visit is calculated.
     * Optionally you can also a specify an ai so you can compare the best classification with that given by the ai.
     *
     * How many visits are returned is governed by the page-size parameter which is used to calculate page start and page end timestamps.
     * In some circumstances the number of visits returned may be slightly bigger or smaller than the page-size.
     *
     * @apiUse V1UserAuthorizationHeader
     * @apiParam {number|number[]} devices  A single device id, or a JSON list of device ids to include.  eg 52, or [23, 42]
     * @apiParam {number|number[]} groups  A single group id or a JSON list of group ids to include.  eg 20, or [23, 42]
     * @apiParam {timestamp} from  Retrieve visits after this time
     * @apiParam {timestamp} until Retrieve visits starting on or before this time
     * @apiParam {number} page  Page number to retrieve
     * @apiParam {number} page-size Maximum numbers of visits to show on each page.  Note: Number of visits is approximate per page.  In some situations number maybe slightly bigger or smaller than this.
     * @apiParam {string} ai   Name of the AI to be used to compute the 'classificationAI' result.  Note: This will not affect the
     * 'classification' result, which always uses a predefined AI/human choice.
     * @apiParam {string} viewmode   View mode for super user.
     *
     * @apiSuccess {JSON} params The parameters used to retrieve these results.  Most of these fields are from the request.
     * Calculated fields are listed in the 'Params Details' section below.
     * @apiSuccess {JSON} visits The returned visits.   More information in the 'Visits Details' section below.
     * @apiSuccess {boolean} success True
     * @apiSuccess {string} messages Any message from the server
     * @apiSuccess (Params Details) {number} pagesEstimate Estimated number of pages in this query,
     * @apiSuccess (Params Details) {timestamp} pageFrom Visits on this page start after this time,
     * @apiSuccess (Params Details) {timestamp} pageUntil Visits on this page start before or at this time,
     * @apiSuccess (Visit Details){string} device Name of device.
     * @apiSuccess (Visit Details){number} deviceId Id of device.
     * @apiSuccess (Visit Details){JSON} recordings More information on recordings and tracks that make up the visit
     * @apiSuccess (Visit Details){number} tracks Number of tracks that are included in this visit
     * @apiSuccess (Visit Details){string} station Name of station where recordings took place (if defined)
     * @apiSuccess (Visit Details){number} stationId Id of station where recordings took place (if defined else 0)
     * @apiSuccess (Visit Details){timestamp} timeStart Time visit starts
     * @apiSuccess (Visit Details){timestamp} timeEnd Time visit ends
     * @apiSuccess (Visit Details){string} timeEnd Time visit ends
     * @apiSuccess (Visit Details){boolean} timeEnd Time visit ends
     * @apiSuccess (Visit Details){string} classification Cacophony classification.   (This is the best classification we have for this visit)
     * @apiSuccess (Visit Details){string} classificationAi Best classification from AI specified in request params, otherwise best classification from AI Master.
     * @apiSuccess (Visit Details){boolean} classFromUserTag True if the Cacophony classification was made by a user.   False if it was an AI classification
     * @apiSuccess (Visit Details){boolean} incomplete Visits are incomplete if there maybe more recordings that belong to this visit.  This can only
     * occur at the start or end of the time period.   If it occurs at the start of the time period then for counting purposes it doesn't really belong
     * in this time period.

     * @apiSuccessExample {json} Success-Response:
     * HTTP/1.1 200 OK
     *     {
     *       "messages": [
     *           "Completed query."
     *       ],
     *       "params": {
     *           "page": "1",
     *           "pagesEstimate": 1,
     *           "searchFrom": "2017-01-31T11:00:00.000Z",
     *           "searchUntil": "2021-05-17T22:39:46.393Z",
     *           "compareAi": "Master",
     *           "pageFrom": "2017-01-31T11:00:00.000Z",
     *           "pageUntil": "2021-05-17T22:39:46.393Z"
     *       },
     *       "visits": [
     *           {
     *               "device": "cy_only_master_3fb41ee1",
     *               "deviceId": 1,
     *               "recordings": [
     *                   {
     *                       "recId": 1,
     *                       "start": "2021-05-09T10:01:00.000Z",
     *                       "tracks": [
     *                           {
     *                               "tag": null,
     *                               "isAITagged": false,
     *                               "aiTag": null,
     *                               "start": 2,
     *                               "end": 8
     *                           }
     *                       ]
     *                   }
     *               ],
     *               "tracks": 1,
     *               "station": "",
     *               "stationId": 0,
     *               "timeStart": "2021-05-09T10:01:00.000Z",
     *               "timeEnd": "2021-05-09T10:01:12.000Z",
     *               "classification": "none",
     *               "classFromUserTag": false,
     *               "classificationAi": "none",
     *               "incomplete": false
     *           }
     *       ],
     *       "success": true
     *   }
     * @apiSuccess {JSON} visits Calculated visits with classifications.
     *
     * @apiUse V1ResponseError
     */
  app.get(
    `${apiUrl}/page`,
    // Validate session
    extractJwtAuthorizedUser,
    validateFields([
      query("page-size")
        .exists()
        .withMessage(expectedTypeOf("integer"))
        .bail()
        .isInt({ min: 1, max: 100 })
        .toInt()
        .withMessage(`Parameter 'page-size' must be an integer from 1 to 100`), //${range.min} and ${range.max}
      query("page")
        .exists()
        .withMessage(expectedTypeOf("integer"))
        .bail()
        .isInt({ min: 1, max: 10000 })
        .toInt()
        .withMessage(`Parameter 'page' must be an integer from 1 to 10000`), //${range.min} and ${range.max}
      query("devices")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, '32' or '[32, 33, 34]'"
        ),
      query("groups")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, '32' or '[32, 33, 34]'"
        ),
      query("ai")
        .optional()
        .isLength({ min: 3 })
        .matches(/(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/)
        .withMessage(
          (val, { location, path }) =>
            `'${location}.${path}' must only contain letters, numbers, dash, underscore and space.  It must contain at least one letter`
        ),
      query("from").optional().isISO8601().toDate(),
      query("until").optional().isISO8601().toDate(),
      query("view-mode").optional(),
    ]),
    // Extract resources
    // FIXME: Extract resources and check permissions for devices and groups, here rather than in the main business logic
    //  Also don't require pulling out the user
    async (request: Request, response: Response) => {
      const requestUser: User = await models.User.findByPk(
        response.locals.requestUser.id
      );
      const params: MonitoringParams = {
        user: requestUser,
        devices: request.query.devices as unknown[] as number[],
        groups: request.query.groups as unknown[] as number[],
        page: request.query.page as unknown as number,
        pageSize: request.query["page-size"] as unknown as number,
      };
      if (request.query.from) {
        params.from = request.query.from as unknown as Date;
      }
      if (request.query.until) {
        params.until = request.query.until as unknown as Date;
      }

      const viewAsSuperAdmin = response.locals.viewAsSuperAdmin;
      const searchDetails = await calculateMonitoringPageCriteria(
        params,
        viewAsSuperAdmin
      );
      searchDetails.compareAi = (request.query["ai"] as string) || "Master";

      const visits = await generateVisits(
        requestUser.id,
        searchDetails,
        viewAsSuperAdmin
      );

      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        params: searchDetails,
        visits,
      });
    }
  );
}
