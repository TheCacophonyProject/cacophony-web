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
  fetchUnauthorizedRequiredScheduleById,
  fetchAuthorizedRequiredGroupById,
  fetchAdminAuthorizedRequiredGroupById,
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
  integerOfWithDefault,
} from "../validation-middleware";
import { Device } from "models/Device";
import { ApiDeviceResponse } from "@typedefs/api/device";
import logging from "@log";
import { ApiGroupUserResponse } from "@typedefs/api/group";

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
        (device as any).Group?.Users[0]?.GroupUsers?.admin ||
        false,
    };
    if (device.lastConnectionTime) {
      mapped.lastConnectionTime = device.lastConnectionTime.toISOString();
    }
    if (device.lastRecordingTime) {
      mapped.lastRecordingTime = device.lastRecordingTime.toISOString();
    }
    if (device.heartbeat && device.nextHeartbeat) {
      mapped.isHealthy = device.nextHeartbeat.getTime() > Date.now();
    }
    if (device.location) {
      const { coordinates } = device.location;
      mapped.location = {
        lat: coordinates[1],
        lng: coordinates[0],
      };
    }
    if (device.public) {
      mapped.public = true;
    }
    if (device.ScheduleId) {
      mapped.scheduleId = device.ScheduleId;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiDevicesResponseSuccess {
  devices: ApiDeviceResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiDeviceResponseSuccess {
  device: ApiDeviceResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiDeviceUsersResponseSuccess {
  users: ApiGroupUserResponse[];
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
    async (request: Request, response: Response) => {
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
   * @apiInterface {apiSuccess::ApiDevicesResponseSuccess} devices Devices details
   * @apiUse DevicesList
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

  /**
   * @api {get} /api/v1/devices/:deviceId Get a single device by its unique id
   * @apiName GetDeviceById
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiQuery {Boolean} [only-active=true] Only return active devices
   *
   * @apiDescription Returns details of the device if the user can access it either through
   * group membership or direct assignment to the device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {apiSuccess::ApiDeviceResponseSuccess} device Device details
   *
   * @apiSuccessExample {JSON} device:
   * {
   * "deviceName": "device name",
   *  "groupName": "group name",
   *  "groupId": 1,
   *  "deviceId: 2,
   *  "saltId": 2,
   *  "active": true,
   *  "admin": false,
   *  "type": "thermal",
   *  "public": "false",
   *  "lastConnectionTime": "2021-11-09T01:38:22.079Z",
   *  "lastRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "location": {
   *   "lat": -43.5338812,
   *    "lng": 172.6451473
   *  },
   *  "users": [{
   *    "userName": "bob",
   *    "userId": 10,
   *    "admin": false,
   *  }]
   * }
   * @apiUse V1ResponseError
   */
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
   * @apiQuery {Boolean} [only-active=true] Only return active devices
   *
   * @apiDescription Returns details of the device if the user can access it either through
   * group membership or direct assignment to the device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {apiSuccess::ApiDeviceResponseSuccess} device Device details
   *
   * @apiSuccessExample {JSON} device:
   * {
   * "deviceName": "device name",
   *  "groupName": "group name",
   *  "groupId": 1,
   *  "deviceId: 2,
   *  "saltId": 2,
   *  "active": true,
   *  "admin": false,
   *  "type": "thermal",
   *  "public": "false",
   *  "lastConnectionTime": "2021-11-09T01:38:22.079Z",
   *  "lastRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "location": {
   *   "lat": -43.5338812,
   *    "lng": 172.6451473
   *  },
   *  "users": [{
   *    "userName": "bob",
   *    "userId": 10,
   *    "admin": false,
   *  }]
   * }
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceName/in-group/:groupIdOrName`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      nameOf(param("deviceName")),
      query("only-active").optional().isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
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
   * through group membership.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiQuery {Integer} deviceId ID of the device.
   * @apiQuery {Boolean} [only-active=true] Only return active devices
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiDeviceUsersResponseSuccess} users Array of users who have access to the
   * device via the devices group.
   * @apiSuccessExample {JSON} users:
   * [{
   *  "id": 1564,
   *  "userName": "user name",
   *  "admin": true
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
      query("view-mode").optional().equals("user"),
    ]),
    // Should this require admin access to the device?
    fetchAdminAuthorizedRequiredDeviceById(query("deviceId")),
    async (request, response, next) => {
      await fetchAuthorizedRequiredGroupById(response.locals.device.GroupId)(
        request,
        response,
        next
      );
    },
    async (request: Request, response: Response) => {
      const users = (
        await response.locals.group.getUsers({ attributes: ["id", "username"] })
      ).map((user) => ({
        userName: user.username,
        id: user.id,
        admin: (user as any).GroupUsers.admin,
      }));

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["OK."],
        users,
      });
    }
  );

  /**
   * @api {post} /api/v1/devices/assign-schedule Assign a schedule to a device.
   * @apiName AssignScheduleToDevice
   * @apiGroup Schedules
   * @apiDescription This call assigns a schedule to a device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {Number} deviceId ID of the device.
   * @apiBody {Number} scheduleId ID of the schedule to assign to the device.
   * @apiBody {Boolean} admin If true, the user should have administrator access to the device.
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/assign-schedule`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(body("scheduleId")),
      idOf(body("deviceId")),
      // Allow adding a schedule to an inactive device by default
      query("only-active").default(false).isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(body("deviceId")),
    fetchUnauthorizedRequiredScheduleById(body("scheduleId")),
    (request, response, next) => {
      if (
        response.locals.schedule.UserId == response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        next();
      } else {
        return next(new ClientError("Schedule doesn't belong to user", 403));
      }
    },
    async (request, response) => {
      await response.locals.device.update({
        ScheduleId: response.locals.schedule.id,
      });
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["schedule assigned"],
      });
    }
  );

  /**
   * @api {post} /api/v1/devices/remove-schedule Remove a schedule from a device.
   * @apiName RemoveScheduleFromDevice
   * @apiGroup Schedules
   * @apiDescription This call removes a schedule from a device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {Number} deviceId ID of the device.
   * @apiBody {Number} scheduleId ID of the schedule to remove from the device.
   * @apiBody {Boolean} admin If true, the user should have administrator access to the device.
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/remove-schedule`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(body("scheduleId")),
      idOf(body("deviceId")),
      // Allow adding a schedule to an inactive device by default
      query("only-active").default(false).isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(body("deviceId")),
    fetchUnauthorizedRequiredScheduleById(body("scheduleId")),
    (request, response, next) => {
      if (
        response.locals.schedule.UserId == response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        next();
      } else {
        return next(new ClientError("Schedule doesn't belong to user", 403));
      }
    },
    async (request, response) => {
      await response.locals.device.update({
        ScheduleId: null,
      });
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["schedule removed"],
      });
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
   * @apiBody {String} newName new name of the device.
   * @apiBody {String} newGroup name of the group you want to move the device to.
   * @apiBody {String} newPassword password for the device
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
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [window-size=2160] length of rolling window in hours.  Default is 2160 (90 days)
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
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
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
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
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [window-size=2160] length of window in hours going backwards in time from the `from` param.  Default is 2160 (90 days)
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
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
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
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

  /**
     * @api {post} /api/v1/devices/heartbeat send device heartbeat
     * @apiName heartbeat
     * @apiGroup Device
     *
     * @apiUse V1DeviceAuthorizationHeader
     *
     * @apiBody {Date} nextHeartbeat time next heart beat is expected

     * @apiUse V1ResponseSuccess
     * @apiUse V1ResponseError
     */
  app.post(
    `${apiUrl}/heartbeat`,
    extractJwtAuthorisedDevice,
    validateFields([body("nextHeartbeat").isISO8601().toDate()]),
    async function (request: Request, response: Response) {
      const requestDevice = (await models.Device.findByPk(
        response.locals.requestDevice.id
      )) as Device;
      await requestDevice.updateHeartbeat(request.body.nextHeartbeat);

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Heartbeat updated."],
      });
    }
  );
}
