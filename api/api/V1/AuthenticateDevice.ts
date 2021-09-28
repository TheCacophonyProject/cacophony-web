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

import { validateFields } from "../middleware";
import { body } from "express-validator";
import auth from "../auth";
import responseUtil from "./responseUtil";
import { Application, Response, Request, NextFunction } from "express";
import { anyOf, validNameOf, validPasswordOf } from "../validation-middleware";
import { extractUnauthenticatedOptionalDeviceInGroup } from "../extract-middleware";
import { Device } from "models/Device";
import { ClientError } from "../customErrors";

export default function (app: Application) {
  /**
   * @api {post} /authenticate_device/ Authenticate a device
   * @apiName AuthenticateDevice
   * @apiGroup Authentication
   * @apiDescription Checks the devicename and groupname combination corresponds to an existing device
   * account and the password matches the account. Returns a JWT authentication token to use for
   * further API requests
   *
   * @apiParam {String} devicename The name identifying a valid device account
   * @apiParam {String} groupname The name identifying the group to which the device account belongs
   * @apiParam {String} password Password for the device account
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {int} id id of device authenticated
   */
  app.post(
    "/authenticate_device",
    validateFields([
      validPasswordOf(body("password")),
      anyOf(validNameOf(body("devicename")), validNameOf(body("deviceName"))),
      anyOf(validNameOf(body("groupname")), validNameOf(body("groupName"))),
    ]),
    extractUnauthenticatedOptionalDeviceInGroup(
      body(["devicename", "deviceName"]),
      body(["groupname", "groupName"])
    ),
    (request: Request, response: Response, next: NextFunction) => {
      if (!response.locals.device) {
        return next(
          new ClientError(
            "Device not found for supplied deviceName and groupName",
            401
          )
        );
      }
      next();
    },
    async (request: Request, response: Response) => {
      const passwordMatch = await (
        response.locals.device as Device
      ).comparePassword(request.body.password);
      if (passwordMatch) {
        return responseUtil.send(response, {
          statusCode: 200,
          messages: ["Successful login."],
          id: response.locals.device.id,
          token: `JWT ${auth.createEntityJWT(response.locals.device)}`,
        });
      } else {
        return responseUtil.send(response, {
          statusCode: 401,
          messages: ["Wrong password or devicename."],
        });
      }
    }
  );
}
