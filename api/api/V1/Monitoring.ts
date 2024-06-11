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

import { expectedTypeOf, isIntArray, validateFields } from "../middleware.js";
import type { Application, NextFunction, Request, Response } from "express";
import type { MonitoringParams } from "./monitoringPage.js";
import { calculateMonitoringPageCriteria } from "./monitoringPage.js";
import { generateVisits } from "./monitoringVisit.js";
import { successResponse } from "./responseUtil.js";
import { param, query } from "express-validator";
import { format as sqlFormat } from "sql-formatter";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredGroupById,
  fetchUnauthorizedOptionalGroupByNameOrId,
  fetchUnauthorizedRequiredGroupById,
} from "../extract-middleware.js";
import modelsInit from "@models/index.js";
import { ClientError } from "@api/customErrors.js";
import type { GroupId, StationId } from "@typedefs/api/common.js";
import { RecordingType } from "@typedefs/api/consts.js";
import { format } from "util";
import { idOf } from "@api/validation-middleware.js";
import logger from "@log";
import { asyncLocalStorage } from "@/Globals.js";
import { sqlDebugOutput } from "@api/V1/recordingsBulkQueryUtil.js";
import { Recording } from "@models/Recording.js";
import { mapDeviceResponse } from "@api/V1/Device.js";
import { mapRecordingResponse } from "@api/V1/Recording.js";
import type { MonitoringPageCriteria2 } from "@api/V1/monitoringUtil.js";
import { generateVisits2 } from "@api/V1/monitoringUtil.js";

const models = await modelsInit();

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/monitoring`;

  /**
     * @api {get} /api/v1/monitoring/page Get visits page
     * @apiName MonitoringPage
     * @apiGroup Monitoring
     * @apiDescription Get a page of monitoring visits.   Visits are returned with the most recent ones listed first.
     *
     * As part of this process recordings are sorted into visits and then the best-classification for each visit is calculated.
     * Optionally you can also specify an ai so you can compare the best classification with that given by the ai.
     *
     * How many visits are returned is governed by the page-size parameter which is used to calculate page start and page end timestamps.
     * In some circumstances the number of visits returned may be slightly bigger or smaller than the page-size.
     *
     * @apiUse V1UserAuthorizationHeader
     * @apiQuery {number|number[]} [devices]  A single device id, or a JSON list of device ids to include.  eg 52, or [23, 42]
     * @apiQuery {number|number[]} [groups]  A single group id or a JSON list of group ids to include.  eg 20, or [23, 42]
     * @apiQuery {timestamp} [from]  Retrieve visits after this time
     * @apiQuery {timestamp} [until] Retrieve visits starting on or before this time
     * @apiQuery {number{1..10000}} page  Page number to retrieve
     * @apiQuery {number{1..100}} page-size Maximum numbers of visits to show on each page.  Note: Number of visits is approximate per page.  In some situations number maybe slightly bigger or smaller than this.
     * @apiQuery {string} [ai]   Name of the AI to be used to compute the 'classificationAI' result.  Note: This will not affect the
     * 'classification' result, which always uses a predefined AI/human choice.
     * @apiQuery {string="user"} [view-mode]   View mode for super user.
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
      query("stations")
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
      query("ai").optional().isLength({ min: 3 }),
      query("from").optional().isISO8601().toDate(),
      query("until").optional().isISO8601().toDate(),
      query("types").optional(),
      query("view-mode").optional(),
    ]),
    async (request: Request, response: Response, next: NextFunction) => {
      const requestUser = await models.User.findByPk(
        response.locals.requestUser.id
      );
      const types = (((request.query.types as string) &&
        (request.query.types as string).split(",")) as (
        | RecordingType.TrailCamImage
        | RecordingType.ThermalRaw
        | RecordingType.TrailCamVideo
      )[]) || [RecordingType.ThermalRaw];
      // TODO: Default to thermalRaw for existing api calls, and new api calls can pass through the recording types they want visits
      //  calculated over.

      const stationIds: StationId[] =
        ((request.query.stations as string[]) || []).map(Number) || [];
      const groupIds: GroupId[] =
        ((request.query.groups as string[]) || []).map(Number) || [];

      // TODO: Check permissions, reject if we don't have permissions to view any of these devices/groups.
      //  Easier to do this cleanly once we get rid of the concept of users belonging to devices.

      const params: MonitoringParams = {
        stations: stationIds,
        groups: groupIds,
        page: request.query.page as unknown as number,
        pageSize: request.query["page-size"] as unknown as number,
        types,
      };
      if (request.query.from) {
        params.from = request.query.from as unknown as Date;
      }
      if (request.query.until) {
        params.until = request.query.until as unknown as Date;
      }
      const viewAsSuperAdmin = response.locals.viewAsSuperUser;
      const searchDetails = await calculateMonitoringPageCriteria(
        requestUser,
        params,
        viewAsSuperAdmin
      );
      searchDetails.compareAi = (request.query["ai"] as string) || "Master";
      searchDetails.types = params.types;

      const visits = await generateVisits(
        requestUser.id,
        searchDetails,
        viewAsSuperAdmin
      );
      if (visits instanceof ClientError) {
        return next(visits);
      }

      return successResponse(response, "Completed query.", {
        params: searchDetails,
        visits,
      });
    }
  );

  app.get(
    `${apiUrl}/for-project/:projectId`,
    // Validate session
    //extractJwtAuthorizedUser,
    validateFields([
      query("debug").optional(),
      idOf(param("projectId")),
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
      query("locations")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, '32' or '[32, 33, 34]'"
        ),
      query("from").optional().isISO8601().toDate(), // TODO: Defaults
      query("until").optional().isISO8601().toDate(),
      query("types")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom((value: any[]) => {
          const allowedTypes = [
            RecordingType.ThermalRaw,
            RecordingType.TrailCamImage,
            RecordingType.TrailCamVideo,
            "thermal",
          ];
          const invalidTypes = value.filter(
            (type) => !allowedTypes.includes(type)
          );
          if (invalidTypes.length) {
            throw new Error(
              format(
                "Invalid recording type(s) '%s'.",
                invalidTypes.join("', '")
              )
            );
          }
          return true;
        }),
      query("view-mode").optional(),
    ]),
    //fetchAuthorizedRequiredGroupById(param("projectId")),
    fetchUnauthorizedRequiredGroupById(param("projectId")),
    async (request: Request, response: Response, next: NextFunction) => {
      const query = request.query;
      // const requestUser = await models.User.findByPk(
      //   (response.locals.requestUser && response.locals.requestUser.id) || 200
      // );
      const types = (
        (query["types"] as string[]) || [RecordingType.ThermalRaw]
      ).map((x) => {
        if (x === "thermal") {
          return "thermalRaw";
        }
        return x;
      }) as (
        | RecordingType.ThermalRaw
        | RecordingType.TrailCamImage
        | RecordingType.TrailCamVideo
      )[];

      const stationIds: StationId[] =
        ((request.query.stations as string[]) || []).map(Number) || [];
      const groupId = response.locals.group.id;

      const sqlPasses: string[] = [];
      const sqlTimings: number[] = [];
      const now = performance.now();

      const loggingFn =
        (sqlPasses: string[], sqlTimings: number[]) =>
        (message: string, time: number) => {
          const store = asyncLocalStorage.getStore() as Map<string, number>;
          const dbQueryCount = store?.get("queryCount") as number;
          const dbQueryTime = store?.get("queryTime") as number;
          store?.set("queryCount", dbQueryCount + 1);
          store?.set("queryTime", dbQueryTime + time);
          if (query.debug) {
            sqlPasses.push(
              sqlFormat(message.replace("Executed (default): ", ""), {
                language: "postgresql",
              })
            );
            sqlTimings.push(time);
          }
        };
      const logging = loggingFn(sqlPasses, sqlTimings);
      const searchDetails: MonitoringPageCriteria2 = {
        group: groupId,
        searchFrom: (request.query.from as unknown as Date) || new Date(0),
        searchUntil: (request.query.until as unknown as Date) || new Date(),
        stations: stationIds,
        types,
      };

      // Get recordings in timespan up to a limit.
      // Recordings can be still processing, and we mark the visits they're part of accordingly in the UI.
      // Cluster those recordings by station in time windows.
      // For each cluster, calculate one or more canonical tags.  If more than one
      // differing human tag for a cluster, split into separate clusters with the ambiguous tags
      // copied to each cluster. (are the clusters still coherent as visits at this point? – take timespan
      // into account when splitting).
      // Truncate any probable incomplete clusters at the end – the start of the next request will
      // be calculated as an offset from the earliest cluster of this one.

      const visits = await generateVisits2(searchDetails, logging);
      //const actualRecordings = visits.map((r: Recording[][]) => r.length);
      console.log(visits);
      const sequelizeTime = performance.now() - now;
      if (!query.debug) {
        return successResponse(response, "Completed query.", {
          params: searchDetails,
          visits,
        });
      } else {
        return response.status(200).send(
          sqlDebugOutput(
            query,
            (Array.isArray(visits) && visits.length) || 0,
            0,
            sqlTimings,
            sqlPasses,
            sequelizeTime
            //visits
          )
        );
      }
    }
  );
}
