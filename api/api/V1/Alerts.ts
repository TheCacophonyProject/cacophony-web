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
import models from "../../models";
import responseUtil from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application } from "express";
import { arrayOf, jsonSchemaOf } from "../schema-validation";
import ApiAlertConditionSchema from "../../../types/jsonSchemas/api/alerts/ApiAlertCondition.schema.json";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredDeviceById,
} from "../extract-middleware";

const DEFAULT_FREQUENCY = 60 * 30; //30 minutes

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
   * @apiParam {JSON} alert Alert
   *
   * @apiParamExample {JSON} alert:
   * {
   * "name":"alert name",
   * "conditions":[{
   *   "tag":"possum",
   *   "automatic":true
   * }],
   * "deviceId":1234,
   * "frequencySeconds":120
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
      body("name").exists().isString(),
      body("frequencySeconds")
        .isInt()
        .toInt()
        .optional()
        .default(DEFAULT_FREQUENCY),
      body("deviceId").isInt().toInt().withMessage(expectedTypeOf("integer")),
    ]),
    // Now extract the items we need from the database.
    fetchAuthorizedRequiredDeviceById(body("deviceId")),
    async (request, response) => {
      const newAlert = await models.Alert.create({
        name: request.body.name,
        conditions: request.body.conditions,
        frequencySeconds: request.body.frequencySeconds,
        UserId: response.locals.requestUser.id,
        DeviceId: response.locals.device.id,
      });
      return responseUtil.send(response, {
        id: newAlert.id,
        statusCode: 200,
        messages: ["Created new Alert."],
      });
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
   * @apiSuccess {Alerts[]} Alerts Array of Alerts
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
   *  "username":"user name",
   *  "email":"email@server.org.nz"
   * }
   * @apiSuccessExample {JSON} Device:
   * {
   *   "id":1234,
   *   "devicename":"device name"
   * }
   */
  app.get(
    `${apiUrl}/device/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      param("deviceId").isInt().toInt(),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request, response) => {
      const alerts = await models.Alert.queryUserDevice(
        response.locals.device.id,
        response.locals.requestUser.id,
        null,
        response.locals.viewAsSuperUser
      );
      // FIXME validate schema of returned payload.
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        Alerts: alerts,
      });
    }
  );
}
