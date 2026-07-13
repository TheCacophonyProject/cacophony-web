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

import { validateFields } from "../middleware.js";
import { body, query } from "express-validator";
import { successResponse } from "./responseUtil.js";
import type { Application, NextFunction, Request, Response } from "express";
import {
  allOrNoneOf,
  atMostOneOf,
  deprecatedField,
  exactlyOneOf,
  exactlyOneOfOrDefault,
  idOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware.js";
import { extractUnauthenticatedOptionalDeviceInGroup } from "../extract-middleware.js";
import type { Device } from "models/Device.js";
import { AuthenticationError, ClientError } from "../customErrors.js";
import type { DeviceId } from "@typedefs/api/common.js";
import { createEntityJWT } from "@api/auth.js";

export interface ApiAuthenticateDeviceRequestBody {
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
      exactlyOneOf(
        atMostOneOf(
          validNameOf(body("deviceName")).optional(),
          deprecatedField(validNameOf(body("devicename"))).optional(),
        ),
        allOrNoneOf(
          atMostOneOf(
            validNameOf(body("groupName")).optional(),
            deprecatedField(validNameOf(body("groupname"))).optional(),
          ),
          atMostOneOf(
            idOf(body("deviceId")).optional(),
            deprecatedField(idOf(body("deviceID"))).optional(),
          ),
        ),
      ),
      exactlyOneOfOrDefault(false)(
        query("only-active").optional().isBoolean().toBoolean(),
        deprecatedField(query("onlyActive")).optional().isBoolean().toBoolean(),
      ),
    ]),
    async (request: Request, _response: Response, next: NextFunction) => {
      const b = request.body;
      if ((b.deviceName || b.devicename) && (b.groupName || b.groupname)) {
        next();
      } else if (b.deviceId || b.deviceID) {
        next();
      } else {
        next(
          new ClientError(
            "Either a deviceName and groupName is required, or a deviceId",
          ),
        );
      }
    },
    extractUnauthenticatedOptionalDeviceInGroup(
      body(["devicename", "deviceName", "deviceId", "deviceID"]),
      body(["groupname", "groupName"]),
    ),
    (request: Request, response: Response, next: NextFunction) => {
      if (!response.locals.device) {
        if (request.body.deviceId || request.body.deviceID) {
          const suppliedId = request.body.deviceId || request.body.deviceID;
          const group = request.body.groupName || request.body.groupname;
          const deviceName =
            request.body.deviceName ||
            request.body.devicename ||
            "unknown device";
          if (group) {
            return next(
              new AuthenticationError(
                `Device not found for supplied deviceId (#${suppliedId}, '${deviceName}') in project '${group}'`,
              ),
            );
          } else {
            return next(
              new AuthenticationError(
                `Device not found for supplied deviceId (#${suppliedId}, '${deviceName}')`,
              ),
            );
          }
        } else {
          return next(
            new AuthenticationError(
              "Device not found for supplied deviceName and groupName",
            ),
          );
        }
      }
      next();
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const device = response.locals.device as Device;
      const passwordMatch = await device.comparePassword(request.body.password);
      if (passwordMatch) {
        return successResponse(response, "Successful login.", {
          id: device.id,
          token: `JWT ${createEntityJWT(device)}`,
        });
      } else {
        return next(new AuthenticationError("Wrong password or deviceName."));
      }
    },
  );
}
