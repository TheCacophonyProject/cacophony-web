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

import { expectedTypeOf, validateFields } from "../middleware.js";
import modelsInit from "@models/index.js";
import { successResponse } from "./responseUtil.js";
import { body, param, query } from "express-validator";
import type { Application, NextFunction } from "express";
import { arrayOf, jsonSchemaOf } from "../schema-validation.js";
import ApiAlertConditionSchema from "@schemas/api/alerts/ApiAlertCondition.schema.json" assert { type: "json" };
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredAlertById,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredGroupById,
  fetchAuthorizedRequiredStationById,
  parseJSONField,
} from "../extract-middleware.js";
import { anyOf, idOf, integerOfWithDefault } from "../validation-middleware.js";
import type {
  DeviceId,
  GroupId,
  Seconds,
  StationId,
} from "@typedefs/api/common.js";
import type {
  ApiAlertCondition,
  ApiAlertResponse,
} from "@typedefs/api/alerts.js";
import type { Alert } from "@models/Alert.js";
import type { Request, Response } from "express";
import { AuthorizationError } from "@api/customErrors.js";
import logger from "@log";

const models = await modelsInit();

const DEFAULT_FREQUENCY = 60 * 30; //30 minutes

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiPostAlertRequestBody {
  name: string;
  deviceId?: DeviceId;
  stationId?: StationId;
  projectId?: GroupId;
  conditions: ApiAlertCondition[];
  frequencySeconds?: Seconds; // Defaults to 30 minutes
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiGetAlertsResponse {
  Alerts: ApiAlertResponse[];
}

const mapAlertResponse = (alert: Alert): ApiAlertResponse => {
  const alertScope = alert.DeviceId
    ? "device"
    : alert.StationId
    ? "location"
    : "project";
  return {
    conditions: alert.conditions,
    frequencySeconds: alert.frequencySeconds,
    id: alert.id,
    lastAlert: (alert.lastAlert && alert.lastAlert.toISOString()) || "never",
    name: alert.name,
    scope: alertScope,
    scopeId: alert.DeviceId || alert.StationId || alert.GroupId,
  };
};

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
      anyOf(
        idOf(body("deviceId")),
        idOf(body("stationId")),
        idOf(body("projectId")),
      ),
    ]),
    async (request: Request, response: Response, next: NextFunction) => {
      if (request.body.deviceId) {
        await fetchAuthorizedRequiredDeviceById(body("deviceId"))(
          request,
          response,
          next,
        );
      } else if (request.body.stationId) {
        await fetchAuthorizedRequiredStationById(body("stationId"))(
          request,
          response,
          next,
        );
      } else if (request.body.projectId) {
        await fetchAuthorizedRequiredGroupById(body("projectId"))(
          request,
          response,
          next,
        );
      }
    },
    parseJSONField(body("conditions")),
    async (request: Request, response: Response, next: NextFunction) => {
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
      } else if (response.locals.group) {
        (alert as any).GroupId = response.locals.group.id;
      } else {
        return next(new AuthorizationError("Invalid alert scope"));
      }
      logger.warning("Alert %s", JSON.stringify(alert, null, "\t"));
      const { id } = await models.Alert.create(alert);
      return successResponse(response, "Created new Alert.", { id });
    },
  );

  /**
   * @api {get} /api/v1/alerts/device/:deviceId Get Alerts
   * @apiName GetAlerts
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for the requesting user for a device for requesting user
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} deviceId deviceId of the device to get alerts for
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGetAlertsResponse} Alerts Array of Alerts
   *
   * @apiUse V1ResponseError
   * */
  app.get(
    `${apiUrl}/device/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (_request: Request, response: Response) => {
      const alerts = (
        await models.Alert.queryUserDevice(
          response.locals.device.id,
          response.locals.requestUser.id,
          null,
          response.locals.viewAsSuperUser,
        )
      ).map(mapAlertResponse);
      return successResponse(response, { alerts });
    },
  );

  /**
   * @api {get} /api/v1/alerts/station/:locationId Get Alerts for a location
   * @apiName GetAlertsForLocation
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for a location for requesting user
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} locationId locationId of the location to get alerts for
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGetAlertsResponse} Alerts Array of Alerts
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/station/:stationId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredStationById(param("stationId")),
    async (_request: Request, response: Response) => {
      const alerts = (
        await models.Alert.queryUserStation(
          response.locals.station.id,
          response.locals.requestUser.id,
          null,
          response.locals.viewAsSuperUser,
        )
      ).map(mapAlertResponse);
      return successResponse(response, { alerts });
    },
  );

  /**
   * @api {get} /api/v1/alerts/project/:projectId Get Alerts for a project for requesting user
   * @apiName GetAlertsForProject
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for a project
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} projectId projectId of the project to get alerts for
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGetAlertsResponse} Alerts Array of Alerts
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/project/:projectId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("projectId")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredGroupById(param("projectId")),
    async (_request: Request, response: Response) => {
      const alerts = (
        await models.Alert.queryUserProject(
          response.locals.group.id,
          response.locals.requestUser.id,
          null,
          response.locals.viewAsSuperUser,
        )
      ).map(mapAlertResponse);
      return successResponse(response, { alerts });
    },
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
   */
  app.get(
    `${apiUrl}`,
    extractJwtAuthorizedUser,
    validateFields([query("view-mode").optional().equals("user")]),
    async (_request: Request, response: Response) => {
      let alerts: ApiAlertResponse[];
      if (!response.locals.viewAsSuperUser) {
        alerts = (
          await models.Alert.findAll({
            where: { UserId: response.locals.requestUser.id },
          })
        ).map(mapAlertResponse);
      } else {
        alerts = (await models.Alert.findAll()).map(mapAlertResponse);
      }
      return successResponse(response, { alerts });
    },
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
    async (_request: Request, response: Response) => {
      await response.locals.alert.destroy();
      return successResponse(response, "Deleted alert");
    },
  );
}
