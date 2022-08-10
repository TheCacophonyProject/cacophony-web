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
import { successResponse } from "./responseUtil";
import { Application, NextFunction, Request, Response } from "express";
import {
  anyOf,
  deprecatedField,
  idOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware";
import { extractUnauthenticatedOptionalDeviceInGroup } from "../extract-middleware";
import { Device } from "models/Device";
import {
  AuthenticationError,
  AuthorizationError,
  ClientError,
} from "../customErrors";
import { DeviceId } from "@typedefs/api/common";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiAuthenticateDeviceRequestBody {
  password: string; // Password for the device account
  deviceName?: string; // The name identifying a valid device account.  Must be paired with groupName
  groupName?: string; // The name identifying the group to which the device account belongs
  deviceId?: DeviceId; // Unique id of the device - used instead of deviceName/groupName combo
}

export default function (app: Application) {
  /**
   * @api {post} /authenticate_device/ Authenticate a device
   * @apiName AuthenticateDevice
   * @apiGroup Authentication
   * @apiDescription Checks the deviceName and groupName combination corresponds to an existing device
   * account and the password matches the account.
   * Optionally, a deviceId can be used instead of the deviceName/groupName combination.
   * Returns a JWT authentication token to use for further API requests
   *
   * @apiInterface {apiBody::ApiAuthenticateDeviceRequestBody}
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {Integer} id id of device authenticated
   */
  app.post(
    "/authenticate_device",
    validateFields([
      validPasswordOf(body("password")),
      // FIXME - Make nested anyOf work properly with error messages etc.
      //anyOf(
      //  [
      anyOf(
        deprecatedField(validNameOf(body("devicename"))).optional(),
        validNameOf(body("deviceName")).optional()
      ),
      anyOf(
        deprecatedField(validNameOf(body("groupname"))).optional(),
        validNameOf(body("groupName")).optional()
      ),
      //  ],
      anyOf(
        idOf(body("deviceId")).optional(),
        deprecatedField(idOf(body("deviceID"))).optional()
      ),
      // ),
    ]),
    async (request: Request, response: Response, next: NextFunction) => {
      const b = request.body;
      if ((b.deviceName || b.devicename) && (b.groupName || b.groupname)) {
        next();
      } else if (b.deviceId || b.deviceID) {
        next();
      } else {
        next(
          new ClientError(
            "Either a deviceName and groupName is required, or a deviceId"
          )
        );
      }
    },
    extractUnauthenticatedOptionalDeviceInGroup(
      body(["devicename", "deviceName", "deviceId", "deviceID"]),
      body(["groupname", "groupName"])
    ),
    (request: Request, response: Response, next: NextFunction) => {
      if (!response.locals.device) {
        if (request.body.deviceId || request.body.deviceID) {
          return next(
            new AuthenticationError("Device not found for supplied deviceId")
          );
        } else {
          return next(
            new AuthenticationError(
              "Device not found for supplied deviceName and groupName"
            )
          );
        }
      }
      next();
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const passwordMatch = await (
        response.locals.device as Device
      ).comparePassword(request.body.password);
      if (passwordMatch) {
        return successResponse(response, "Successful login.", {
          id: response.locals.device.id,
          token: `JWT ${auth.createEntityJWT(response.locals.device)}`,
        });
      } else {
        return next(new AuthenticationError("Wrong password or deviceName."));
      }
    }
  );
}
