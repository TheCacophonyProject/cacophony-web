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

import middleware, { expectedTypeOf, getDeviceById, modelTypeName, parseJSONInternal } from "../middleware";
import auth, { checkAccess, DecodedJWTToken, extractJWT, getVerifiedJWT, lookupEntity } from "../auth";
import models from "../../models";
import responseUtil from "./responseUtil";
import { body, header, param, ValidationChain, validationResult } from "express-validator";
import { Application, NextFunction, Request, Response } from "express";
import { isAlertCondition } from "../../models/Alert";
import { ClientError } from "../customErrors";
import logger from "../../logging";
import { format, types } from "util";
import { jsonSchemaOf } from "../schema-validation";
import ApiAlertConditionsSchema from "../../../types/jsonSchemas/api/alerts/ApiAlertConditions.schema.json";

const DEFAULT_FREQUENCY = 60 * 30; //30 minutes


// sequential processing, stops running validations chain if the previous one have failed.
const validateSequentially = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      logger.info("Result %s", result);
      if (!result.isEmpty()) {
        break;
      }
    }
    return next();
  };
};

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
      // TODO - always extract JWT, then see if the rest of the fields are correct
      body("name")
        .exists()
        .isString(),
      body("frequencySeconds")
        .isInt()
        .toInt()
        .optional()
        .default(DEFAULT_FREQUENCY),
      validateSequentially([
        header("Authorization").custom(extractJWT),
        body("conditions")
          .exists()
          .withMessage(expectedTypeOf("ApiAlertConditions"))
          .bail()
          .custom(jsonSchemaOf(ApiAlertConditionsSchema)),
        body("deviceId")
          .exists()
          .withMessage(expectedTypeOf("integer"))
          .bail()
          .custom((val, { req }) => {
            return new Promise((resolve, reject) => {
              models.Device.findByPk(val).then(device => {
                if (device === null) {
                  reject(format("Could not find a %s with an id of %s.", "Device", val));
                }
                req["devices"] = [device];
                resolve(true);
              });
            });
        }),
        body().custom(auth.authenticate2(['user'])),
        body().custom(auth.userCanAccessDevices2)
      ]),
    middleware.requestWrapper(async (request, response) => {
      const newAlert = await models.Alert.create({
        name: request.body.name,
        conditions: request.body.conditions,
        frequencySeconds: request.body.frequencySeconds,
        UserId: request.user.id,
        DeviceId: request.body.device.id,
      });
      return responseUtil.send(response, {
        id: newAlert.id,
        statusCode: 200,
        messages: ["Created new Alert."],
      });
    })
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
    [
      auth.authenticateUser,
      middleware.getDeviceById(param),
      auth.userCanAccessDevices,
    ],
    middleware.requestWrapper(async (request, response) => {
      const Alerts = await models.Alert.query(
        { DeviceId: request.body.device.id },
        request.user,
        null,
        null
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        Alerts,
      });
    })
  );
}
