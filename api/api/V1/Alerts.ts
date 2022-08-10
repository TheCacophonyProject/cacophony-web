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
import responseUtil, { successResponse } from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application } from "express";
import { arrayOf, jsonSchemaOf } from "../schema-validation";
import ApiAlertConditionSchema from "@schemas/api/alerts/ApiAlertCondition.schema.json";
import {
  extractJwtAuthorizedUser,
  fetchAdminAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredDeviceById,
  parseJSONField,
} from "../extract-middleware";
import {
  idOf,
  integerOfWithDefault,
  validNameOf,
} from "../validation-middleware";
import { DeviceId, Seconds } from "@typedefs/api/common";
import { ApiAlertCondition, ApiAlertResponse } from "@typedefs/api/alerts";
import { HttpStatusCode } from "@typedefs/api/consts";

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
   * @api {post} /api/v1/alerts Create a new alert
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
    // For authenticated requests, always extract a valid JWT first,
    // so that we don't leak data in subsequent error messages for an
    // unauthenticated request.
    extractJwtAuthorizedUser,
    // Validation: Make sure the request payload is well-formed,
    // without regard for whether the described entities exist.
    validateFields([
      body("conditions")
        .exists()
        .withMessage(expectedTypeOf("ApiAlertConditions"))
        .bail()
        .custom(jsonSchemaOf(arrayOf(ApiAlertConditionSchema))),
      validNameOf(body("name")),
      integerOfWithDefault(body("frequencySeconds"), DEFAULT_FREQUENCY),
      idOf(body("deviceId")),
    ]),
    // Now extract the items we need from the database.
    fetchAdminAuthorizedRequiredDeviceById(body("deviceId")),
    parseJSONField(body("conditions")),
    async (request, response) => {
      const { id } = await models.Alert.create({
        name: request.body.name,
        conditions: response.locals.conditions,
        frequencySeconds: request.body.frequencySeconds,
        UserId: response.locals.requestUser.id,
        DeviceId: response.locals.device.id,
      });
      return successResponse(response, "Created new Alert.", { id });
    }
  );

  /**
   * @api {get} /api/v1/alerts/device/:deviceId Get Alerts
   * @apiName GetAlerts
   * @apiGroup Alert
   *
   * @apiDescription Returns all alerts for a device along with details of the associated user and
   * device for each alert
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
   * "User":{},
   * "Device":{}
   * }]
   * @apiSuccessExample {JSON} User:
   * {
   *  "id":456,
   *  "userName":"user name",
   *  "email":"email@server.org.nz"
   * }
   * @apiSuccessExample {JSON} Device:
   * {
   *   "id":1234,
   *   "deviceName":"device name"
   * }
   */
  app.get(
    `${apiUrl}/device/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("view-mode").optional().equals("user"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request, response) => {
      // FIXME - should require device admin, since it lets users see other users
      //  email addresses.  Otherwise, should just show alerts for requesting user.

      const alerts = await models.Alert.queryUserDevice(
        response.locals.device.id,
        response.locals.requestUser.id,
        null,
        response.locals.viewAsSuperUser
      );
      // FIXME validate schema of returned payload,
      //  Reformat the response to conform to deviceName style etc.
      return successResponse(response, { Alerts: alerts });
    }
  );
}
