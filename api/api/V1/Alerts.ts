/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2020  The Cacophony Project

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
import models from "@models";
import { successResponse } from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application, NextFunction } from "express";
import { arrayOf, jsonSchemaOf } from "../schema-validation";
import ApiAlertConditionSchema from "@schemas/api/alerts/ApiAlertCondition.schema.json";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredAlertById,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredStationById,
  parseJSONField,
} from "../extract-middleware";
import {
  anyOf,
  idOf,
  integerOfWithDefault,
  validNameOf,
} from "../validation-middleware";
import { DeviceId, Seconds } from "@typedefs/api/common";
import { ApiAlertCondition, ApiAlertResponse } from "@typedefs/api/alerts";
import { Alert } from "@models/Alert";
import { Request, Response } from "express";

const DEFAULT_FREQUENCY = 60 * 30; //30 minutes

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiPostAlertRequestBody {
  name: string;
  deviceId: DeviceId;
  conditions: ApiAlertCondition[];
  frequencySeconds?: Seconds; // Defaults to 30 minutes
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiGetAlertsResponse {
  Alerts: ApiAlertResponse[];
}

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/alerts`;

  /**
   * @api {post} /api/v1/alerts Create a new alert for a device or station
   * @apiName PostAlert
   * @apiGroup Alert
   *
   * @apiDescription Creates a new alert with the user associated with the supplied JWT authentication
   * token as the admin.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiBody::ApiPostAlertRequestBody}
   *
   * @apiParamExample {JSON} example alert body:
   * {
   * "name": "alert name",
   * "conditions": [{
   *   "tag": "possum",
   *   "automatic": true
   * }],
   * "deviceId": 1234,
   * "frequencySeconds": 120
   * }
   * @apiUse V1ResponseSuccess
   * @apiSuccess {number} id Unique id of the newly created alert.

   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      body("conditions")
        .exists()
        .withMessage(expectedTypeOf("ApiAlertConditions"))
        .bail()
        .custom(jsonSchemaOf(arrayOf(ApiAlertConditionSchema))),
      body("name").exists(),
      integerOfWithDefault(body("frequencySeconds"), DEFAULT_FREQUENCY),
      anyOf(idOf(body("deviceId")), idOf(body("stationId"))),
    ]),
    async (request: Request, response: Response, next: NextFunction) => {
      if (request.body.deviceId) {
        await fetchAuthorizedRequiredDeviceById(body("deviceId"))(
          request,
          response,
          next
        );
      } else if (request.body.stationId) {
        await fetchAuthorizedRequiredStationById(body("stationId"))(
          request,
          response,
          next
        );
      }
    },
    parseJSONField(body("conditions")),
    async (request: Request, response: Response) => {
      const alert = {
        name: request.body.name,
        conditions: response.locals.conditions,
        frequencySeconds: request.body.frequencySeconds,
        UserId: response.locals.requestUser.id,
      };
      if (response.locals.device) {
        (alert as any).DeviceId = response.locals.device.id;
      } else if (response.locals.station) {
        (alert as any).StationId = response.locals.station.id;
      }
      const { id } = await models.Alert.create(alert);
      return successResponse(response, "Created new Alert.", { id });
    }
  );

  /**
   * @api {get} /api/v1/alerts/device/:deviceId Get Alerts
   * @apiName GetAlerts
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for the requesting user for a device
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} deviceId deviceId of the device to get alerts for
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGetAlertsResponse} Alerts Array of Alerts
   *
   * @apiUse V1ResponseError
   *
   * @apiSuccessExample {JSON} Alerts:
   * [{
   * "id":123,
   * "name":"alert name",
   * "frequencySeconds":120,
   * "conditions":[{"tag":"cat", "automatic":true}],
   * "lastAlert":"2021-07-21T02:01:05.118Z",
   * }]
   * */
  app.get(
    `${apiUrl}/device/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("view-mode").optional().equals("user"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request: Request, response: Response) => {
      const alerts = await models.Alert.queryUserDevice(
        response.locals.device.id,
        response.locals.requestUser.id,
        null,
        response.locals.viewAsSuperUser
      );
      return successResponse(response, { alerts });
    }
  );

  /**
   * @api {get} /api/v1/alerts/station/:stationId Get Alerts for a station
   * @apiName GetAlertsForStation
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for a station
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} stationId stationId of the station to get alerts for
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGetAlertsResponse} Alerts Array of Alerts
   *
   * @apiUse V1ResponseError
   *
   * @apiSuccessExample {JSON} Alerts:
   * [{
   * "id":123,
   * "name":"alert name",
   * "frequencySeconds":120,
   * "conditions":[{"tag":"cat", "automatic":true}],
   * "lastAlert":"2021-07-21T02:01:05.118Z",
   * }]
   */
  app.get(
    `${apiUrl}/station/:stationId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("view-mode").optional().equals("user"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredStationById(param("stationId")),
    async (request: Request, response: Response) => {
      const alerts = await models.Alert.queryUserStation(
        response.locals.station.id,
        response.locals.requestUser.id,
        null,
        response.locals.viewAsSuperUser
      );
      return successResponse(response, { alerts });
    }
  );

  /**
   * @api {get} /api/v1/alerts Get all Alerts for current user
   * @apiName GetAlertsForStation
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for the requesting user
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGetAlertsResponse} Alerts Array of Alerts
   *
   * @apiUse V1ResponseError
   *
   * @apiSuccessExample {JSON} Alerts:
   * [{
   * "id":123,
   * "name":"alert name",
   * "frequencySeconds":120,
   * "conditions":[{"tag":"cat", "automatic":true}],
   * "lastAlert":"2021-07-21T02:01:05.118Z",
   * }]
   */
  app.get(
    `${apiUrl}`,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    async (request: Request, response: Response) => {
      let alerts: Alert[];
      if (!response.locals.viewAsSuperUser) {
        alerts = await models.Alert.findAll({
          where: { UserId: response.locals.requestUser.id },
        });
      } else {
        alerts = await models.Alert.findAll();
      }
      return successResponse(response, { alerts });
    }
  );

  /**
   * @api {delete} /api/v1/alerts Delete an alert by id
   * @apiName DeleteAlert
   * @apiGroup Alert
   *
   * @apiDescription Delete a single alert by alert id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} alertId alertId of the Alert to delete
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchAuthorizedRequiredAlertById(param("id")),
    async (request: Request, response: Response) => {
      await response.locals.alert.destroy();
      return successResponse(response, "Deleted alert");
    }
  );
}
