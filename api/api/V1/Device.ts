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
import auth from "../auth";
import models from "@models";
import responseUtil from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application, Response, Request, NextFunction } from "express";
import { ClientError } from "../customErrors";
import {
  extractJwtAuthorizedUser,
  extractJwtAuthorisedDevice,
  fetchAuthorizedRequiredDeviceInGroup,
  fetchAuthorizedRequiredDeviceById,
  fetchUnauthorizedRequiredGroupByNameOrId,
  fetchAdminAuthorizedRequiredDeviceById,
  fetchUnauthorizedOptionalUserById,
  fetchUnauthorizedOptionalUserByNameOrId,
  fetchAuthorizedRequiredDevices,
} from "../extract-middleware";
import {
  booleanOf,
  checkDeviceNameIsUniqueInGroup,
  anyOf,
  idOf,
  nameOf,
  nameOrIdOf,
  validNameOf,
  validPasswordOf,
  deprecatedField,
} from "../validation-middleware";
import { Device } from "models/Device";
import { ApiDeviceResponse } from "@typedefs/api/device";
import logging from "@log";

export const mapDeviceResponse = (
  device: Device,
  viewAsSuperUser: boolean
): ApiDeviceResponse => {
  try {
    const mapped: ApiDeviceResponse = {
      deviceName: device.devicename,
      id: device.id,
      type: device.kind,
      groupName: device.Group?.groupname,
      groupId: device.GroupId,
      active: device.active,
      saltId: device.saltId,
      admin:
        viewAsSuperUser ||
        (
          (device as any).Group?.Users[0]?.GroupUsers ||
          (device as any).Users[0]?.DeviceUsers
        )?.admin ||
        false,
    };
    if (device.lastConnectionTime) {
      mapped.lastConnectionTime = device.lastConnectionTime.toISOString();
    }
    if (device.lastRecordingTime) {
      mapped.lastRecordingTime = device.lastRecordingTime.toISOString();
    }
    if (device.location) {
      const { coordinates } = device.location;
      mapped.location = {
        lat: coordinates[0],
        lng: coordinates[1],
      };
    }
    if (device.public) {
      mapped.public = true;
    }

    return mapped;
  } catch (e) {
    logging.warning("%s", e);
  }
};

export const mapLegacyDevicesResponse = (devices: ApiDeviceResponse[]) =>
  devices.map(({ deviceName, ...rest }) => ({
    devicename: deviceName,
    deviceName,
    ...rest,
  }));

export const mapDevicesResponse = (
  devices: Device[],
  viewAsSuperUser: boolean
): ApiDeviceResponse[] =>
  devices.map((device) => mapDeviceResponse(device, viewAsSuperUser));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiRegisterDeviceRequestBody {
  group: string; // Name of group to assign the device to.
  deviceName: string; // Unique (within group) device name.
  password: string; // password Password for the device.
  saltId?: number; // Salt ID of device. Will be set as device id if not given.
}

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/devices`;

  /**
   * @api {post} /api/v1/devices Register a new device
   * @apiName RegisterDevice
   * @apiGroup Device
   *
   * @apiInterface {apiBody::ApiRegisterDeviceRequestBody}
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} token JWT for authentication. Contains the device ID and type.
   * @apiSuccess {int} id id of device registered
   * @apiSuccess {int} saltId saltId of device registered
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    validateFields([
      nameOf(body("group")),
      anyOf(validNameOf(body("devicename")), validNameOf(body("deviceName"))),
      validPasswordOf(body("password")),
      idOf(body("saltId")).optional(),
    ]),
    fetchUnauthorizedRequiredGroupByNameOrId(body("group")),
    checkDeviceNameIsUniqueInGroup(body(["devicename", "deviceName"])),
    async (request: Request, response: Response, next: NextFunction) => {
      const device = await models.Device.create({
        devicename: request.body.devicename || request.body.deviceName,
        password: request.body.password,
        GroupId: response.locals.group.id,
      });
      if (request.body.saltId) {
        /*
        NOTE: We decided not to use this check, since damage caused by someone
        spamming us with in-use saltIds is minimal.
        const existingSaltId = await models.Device.findOne({
          where: {
            saltId: request.body.saltId,
            active: true
          },
        });
        if (existingSaltId !== null) {
          return next(
            new ClientError(
              `saltId ${request.body.saltId} is already in use by another active device`
            )
          );
        }
        */
        await device.update({ saltId: request.body.saltId });
      } else {
        await device.update({ saltId: device.id });
      }
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Created new device."],
        id: device.id,
        saltId: device.saltId,
        token: `JWT ${auth.createEntityJWT(device)}`,
      });
    }
  );

  /**
   * @api {get} /api/v1/devices Get list of devices
   * @apiName GetDevices
   * @apiGroup Device
   * @apiQuery {Boolean} [onlyActive] Only return active devices, defaults to `true`
   * If we want to return *all* devices this must be present and set to `false`
   * @apiQuery {string} [view-mode] `"user"` show only devices assigned to current user where
   * JWT Authorization supplied is for a superuser (default for superuser is to show all devices)
   *
   * @apiDescription Returns all devices the user can access
   * through both group membership and direct assignment.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiDeviceResponse[]} devices Devices details
   * @apiSuccessExample {JSON} devices:
   * // FIXME - update example
   * {
   * "count":1,
   * "rows":
   *  [{
   *   "devicename":"device name",
   *   "id":3836,
   *   "active":true,
   *   "Users":Array[]
   *   "Group":{}
   *  }]
   * }
   * @apiSuccessExample {JSON} Users:
   * [{
   *  "id":1564,
   *  "username":"user name",
   *  "DeviceUsers":
   *   {
   *    "admin":false,
   *    "createdAt":"2021-07-20T01:00:44.467Z",
   *    "updatedAt":"2021-07-20T01:00:44.467Z",
   *    "DeviceId":3836,
   *    "UserId":1564
   *   }
   * }]
   * @apiSuccessExample {JSON} Group:
   * {
   *  "id":1016,
   *  "groupname":"group name"
   * }
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      deprecatedField(query("where")), // Sidekick
      anyOf(
        query("onlyActive").optional().isBoolean().toBoolean(),
        query("only-active").optional().isBoolean().toBoolean()
      ),
    ]),
    fetchAuthorizedRequiredDevices,
    async (request: Request, response: Response) => {
      if (request.headers["user-agent"].includes("okhttp")) {
        return responseUtil.send(response, {
          devices: {
            rows: mapLegacyDevicesResponse(
              mapDevicesResponse(
                response.locals.devices,
                response.locals.viewAsSuperUser
              )
            ),
          },
          statusCode: 200,
          messages: ["Completed get devices query."],
        });
      }

      return responseUtil.send(response, {
        devices: mapDevicesResponse(
          response.locals.devices,
          response.locals.viewAsSuperUser
        ),
        statusCode: 200,
        messages: ["Completed get devices query."],
      });
    }
  );

  app.get(
    `${apiUrl}/device/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      deprecatedField(query("where")), // Sidekick
      anyOf(
        query("onlyActive").optional().isBoolean().toBoolean(),
        query("only-active").optional().isBoolean().toBoolean()
      ),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser
        ),
        statusCode: 200,
        messages: ["Completed get device query."],
      });
    }
  );

  /**
   * @api {get} /api/v1/devices/:deviceName/in-group/:groupIdOrName Get a single device
   * @apiName GetDeviceInGroup
   * @apiGroup Device
   * @apiParam {string} deviceName Name of the device
   * @apiParam {stringOrInt} groupIdOrName Identifier of group device belongs to
   *
   * @apiDescription Returns details of the device if the user can access it either through
   * group membership or direct assignment to the device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {JSON} device Device details
   *
   * @apiSuccessExample {JSON} device:
   * {
   * "id":2008,
   * "deviceName":"device name",
   * "groupName":"group name",
   * "userIsAdmin":true,
   * "users":Array[]
   * }
   * @apiSuccessExample {JSON} users:
   * [{
   * "userName"=>"user name",
   * "admin"=>false,
   * "id"=>123
   * }]
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceName/in-group/:groupIdOrName`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      nameOf(param("deviceName")),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceInGroup(
      param("deviceName"),
      param("groupIdOrName")
    ),
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser
        ),
        messages: ["Request successful"],
      });
    }
  );

  /**
   * @api {get} /api/v1/devices/users Get all users who can access a device.
   * @apiName GetDeviceUsers
   * @apiGroup Device
   * @apiDescription Returns all users that have access to the device
   * through both group membership and direct assignment.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number} deviceId ID of the device.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {JSON} rows Array of users who have access to the
   * device.  `relation` indicates whether the user is a `group` or `device` member.
   * @apiSuccessExample {JSON} rows:
   * [{
   * "id":1564,
   * "username":"user name",
   * "relation":"device",
   * "admin":true
   * }]
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/users`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(query("deviceId")),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    // Should this require admin access to the device?
    fetchAdminAuthorizedRequiredDeviceById(query("deviceId")),
    async (request: Request, response: Response) => {
      const users = (
        await response.locals.device.users(response.locals.requestUser, [
          "id",
          "username",
        ])
      ).map((user) => ({
        userName: user.username,
        id: user.id,
        admin: ((user as any).DeviceUsers || (user as any).GroupUsers).admin,
        relation: (user as any).DeviceUsers ? "device" : "group",
      }));

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["OK."],
        users,
      });
    }
  );

  /**
   * @api {post} /api/v1/devices/users Add a user to a device.
   * @apiName AddUserToDevice
   * @apiGroup Device
   * @apiDescription This call adds a user to a device. This allows individual
   * user accounts to monitor a device without being part of the group that the
   * device belongs to.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number} deviceId ID of the device.
   * @apiParam {String} username Name of the user to add to the device.
   * @apiParam {Boolean} admin If true, the user should have administrator access to the device..
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/users`,
    extractJwtAuthorizedUser,
    validateFields([
      anyOf(
        nameOf(body("username")),
        nameOf(body("userName")),
        idOf(body("userId"))
      ),
      idOf(body("deviceId")),
      booleanOf(body("admin")),
      // Allow adding a user to an inactive device by default
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    fetchUnauthorizedOptionalUserById(body("userId")),
    fetchUnauthorizedOptionalUserByNameOrId(body(["username", "userName"])),
    (request: Request, response: Response, next: NextFunction) => {
      // Check that we found the user through one of the methods.
      if (!response.locals.user) {
        return next(new ClientError(`User not found`));
      }
      next();
    },
    fetchAdminAuthorizedRequiredDeviceById(body("deviceId")),
    async (request, response) => {
      const added = await models.Device.addUserToDevice(
        response.locals.device,
        response.locals.user,
        request.body.admin
      );

      return responseUtil.send(response, {
        statusCode: 200,
        messages: [added],
      });
    }
  );

  /**
   * @api {delete} /api/v1/devices/users Removes a user with a direct relationship with a device from a device.
   * @apiName RemoveUserFromDevice
   * @apiGroup Device
   * @apiDescription This call can remove a user from a device. Has to be
   * authenticated by an admin user from the group that the device belongs to or an
   * admin user of the device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} userName name of the user to delete from the device.
   * @apiParam {Number} deviceId ID of the device.
   *
   * @apiUse V1ResponseSuccess

   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/users`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(body("deviceId")),
      anyOf(
        nameOf(body("username")),
        nameOf(body("userName")),
        idOf(body("userId"))
      ),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchUnauthorizedOptionalUserById(body("userId")),
    fetchUnauthorizedOptionalUserByNameOrId(body(["username", "userName"])),
    (request: Request, response: Response, next: NextFunction) => {
      // Check that we found the user through one of the methods.
      if (!response.locals.user) {
        return next(new ClientError(`User not found`));
      }
      next();
    },
    fetchAdminAuthorizedRequiredDeviceById(body("deviceId")),
    async function (request: Request, response: Response) {
      const removed = await models.Device.removeUserFromDevice(
        response.locals.device,
        response.locals.user
      );
      if (removed) {
        return responseUtil.send(response, {
          statusCode: 200,
          messages: ["Removed user from the device."],
        });
      } else {
        return responseUtil.send(response, {
          statusCode: 400,
          messages: ["Failed to remove user from the device."],
        });
      }
    }
  );

  /**
   * @api {post} /api/v1/devices/reregister Reregister the device.
   * @apiName Reregister
   * @apiGroup Device
   * @apiDescription This call is to reregister a device to change the name and/or group
   *
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiParam {String} newName new name of the device.
   * @apiParam {String} newGroup name of the group you want to move the device to.
   * @apiParam {String} newPassword password for the device
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {int} id id of device re-registered
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/reregister`,
    extractJwtAuthorisedDevice,
    validateFields([
      nameOf(body("newGroup")),
      validNameOf(body("newName")),
      validPasswordOf(body("newPassword")),
      // NOTE: Reregister only works on currently active devices
    ]),
    fetchUnauthorizedRequiredGroupByNameOrId(body("newGroup")),
    async function (request: Request, response: Response, next: NextFunction) {
      const requestDevice = await models.Device.findByPk(
        response.locals.requestDevice.id
      );
      const device = await requestDevice.reRegister(
        request.body.newName,
        response.locals.group,
        request.body.newPassword
      );
      if (device === false) {
        return next(
          new ClientError(
            `already a device in group '${response.locals.group.groupname}' with the name '${request.body.newName}'`
          )
        );
      }
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Registered the device again."],
        id: device.id,
        token: `JWT ${auth.createEntityJWT(device)}`,
      });
    }
  );

  /**
   * @api {get} /api/v1/devices/{:deviceId}/cacophony-index Get the cacophony index for a device
   * @apiName cacophony-index
   * @apiGroup Device
   * @apiDescription Get a single number Cacophony Index
   * for a given device.  This number is the average of all the Cacophony Index values from a
   * given time (defaulting to 'Now'), within a given timespan (defaulting to 3 months)
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} deviceId ID of the device.
   * @apiParam {String} [from] ISO8601 date string
   * @apiParam {String} [window-size] length of rolling window in hours.  Default is 2160 (90 days)
   * @apiSuccess {Float} cacophonyIndex A number representing the average index over the period `from` minus `window-size`
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId/cacophony-index`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("from").isISO8601().toDate().default(new Date()),
      query("window-size").isInt().toInt().default(2160), // Default to a three month rolling window
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const cacophonyIndex = await models.Device.getCacophonyIndex(
        response.locals.requestUser,
        response.locals.device,
        request.query.from as unknown as Date, // Get the current cacophony index
        request.query["window-size"] as unknown as number
      );
      return responseUtil.send(response, {
        statusCode: 200,
        cacophonyIndex,
        messages: [],
      });
    }
  );

  /**
   * @api {get} /api/v1/devices/{:deviceId}/cacophony-index-histogram Get the cacophony index 24hr histogram for a device
   * @apiName cacophony-index-histogram
   * @apiGroup Device
   * @apiDescription Get a histogram of the Cacophony Index
   * for a given device, bucketed by hour of the day.  These buckets are the average of all the Cacophony Index values
   * for each hour of the day, taken from a given time (defaulting to 'Now'), within a given timespan (defaulting to 3 months)
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} deviceId ID of the device.
   * @apiParam {String} [from] ISO8601 date string
   * @apiParam {Integer} [window-size] length of window in hours going backwards in time from the `from` param.  Default is 2160 (90 days)
   * @apiSuccess {Object} cacophonyIndex in the format `[{hour: number, index: number}, ...]`
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId/cacophony-index-histogram`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("from").isISO8601().toDate().default(new Date()),
      query("window-size").isInt().toInt().default(2160), // Default to a three month rolling window
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const cacophonyIndex = await models.Device.getCacophonyIndexHistogram(
        response.locals.requestUser,
        response.locals.device.id,
        request.query.from as unknown as Date, // Get the current cacophony index
        request.query["window-size"] as unknown as number
      );
      return responseUtil.send(response, {
        statusCode: 200,
        cacophonyIndex,
        messages: [],
      });
    }
  );
}
