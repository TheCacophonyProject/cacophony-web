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

import { asArray, expectedTypeOf, validateFields } from "../middleware";
import auth from "../auth";
import models from "../../models";
import responseUtil from "./responseUtil";
import { body, param, query } from "express-validator";
import Sequelize from "sequelize";
import { Application, Response, Request, NextFunction } from "express";
import { ClientError } from "../customErrors";
import logger from "../../logging";
import {
  extractDevice,
  extractDeviceByName,
  extractGroupByName, extractGroupByNameOrId,
  parseJSONField,
  extractUserByNameOrId,
  extractValidJWT, extractViewMode
} from "../extract-middleware";
import {
  booleanOf,
  checkDeviceNameIsUniqueInGroup,
  eitherOf,
  idOf,
  nameOf,
  nameOrIdOf, validNameOf, validPasswordOf
} from "../validation-middleware";
import { TestDeviceAndGroup } from "@typedefs/api/device";
import TestDeviceAndGroupSchema from "../../../types/jsonSchemas/api/device/TestDeviceAndGroup.schema.json";
import { arrayOf, jsonSchemaOf } from "../schema-validation";
import { User } from "models/User";
import { Device } from "models/Device";

const Op = Sequelize.Op;


export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/devices`;

  /**
   * @api {post} /api/v1/devices Register a new device
   * @apiName RegisterDevice
   * @apiGroup Device
   *
   * @apiParam {String} devicename Unique (within group) device name.
   * @apiParam {String} password Password for the device.
   * @apiParam {String} group Name of group to assign the device to.
   * @apiParam {Integer} [saltId] Salt ID of device. Will be set as device id if not given.
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
      validNameOf(body("devicename")),
      validPasswordOf(body("password")),
      idOf(body("saltId")).optional(),
    ]),
    extractGroupByName("body", "group"),
    checkDeviceNameIsUniqueInGroup("body", "devicename"),
    async (request: Request, response: Response) => {
      logger.info("Create Device for group %s", response.locals.group.id);
      const device = await models.Device.create({
        devicename: request.body.devicename,
        password: request.body.password,
        GroupId: response.locals.group.id,
      });
      if (request.body.saltId) {
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
   * @apiParam {Boolean} [onlyActive] Only return active devices, defaults to `true`
   * If we want to return *all* devices this must be present and set to `false`
   * @apiParam {string} [view-mode] `"user"` show only devices assigned to current user where
   * JWT Authorization supplied is for a superuser (default for superuser is to show all devices)
   *
   * @apiDescription Returns all devices the user can access
   * through both group membership and direct assignment.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {JSON} devices Devices details
   * @apiSuccessExample {JSON} devices:
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
    extractValidJWT,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("onlyActive").default(true).isBoolean().toBoolean(),
    ]),
    auth.authenticateAndExtractUser,
    extractViewMode,
    async (request: Request, response: Response) => {
      const onlyActiveDevices = request.query.onlyActive && Boolean(request.query.onlyActive) !== false;
      const devices = await models.Device.allForUser(
        response.locals.requestUser,
        onlyActiveDevices,
        response.locals.viewAsSuperAdmin
      );
      return responseUtil.send(response, {
        devices: devices,
        statusCode: 200,
        messages: ["Completed get devices query."],
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
    extractValidJWT,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      nameOf(param("deviceName")),
    ]),
    auth.authenticateAndExtractUser,
    extractGroupByNameOrId("params", "groupIdOrName", "groupIdOrName"),
    extractDeviceByName("params", "deviceName"),
    auth.userHasAccessToDevice,
    async (request: Request, response: Response) => {
      const user: User = response.locals.requestUser;
      const device: Device = response.locals.device;
      const userIsDeviceAdmin = await user.canDirectlyOrIndirectlyAdministrateDevice(device);
      const deviceReturn: any = {
        id: device.id,
        deviceName: device.devicename,
        groupName: response.locals.group.groupname,
        userIsAdmin: userIsDeviceAdmin,
      };
      if (userIsDeviceAdmin) {
        // FIXME - Should we just let all users see other user states?
        const deviceUsers = await device.users(user, ["id", "username"]);
        deviceReturn.users = deviceUsers.map((user) => ({
          userName: user.username,
          id: user.id,
          admin: ((user as any).DeviceUsers || (user as any).GroupUsers).admin,
          relation: (user as any).DeviceUsers ? "device" : "group"
        }));
      }

      return responseUtil.send(response, {
        statusCode: 200,
        device: deviceReturn,
        user: {
          userName: user.username,
          id: user.id
        },
        messages: ["Request successful"],
      });
  });

  // FIXME - It's unclear if we ever use this API - deprecate?
  // Should be basically an alias for /api/v1/devices/:deviceName/in-group/:groupIdOrName anyway
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
    extractValidJWT,
    validateFields([
      idOf(query("deviceId"))
    ]),
    auth.authenticateAndExtractUser,
    extractDevice("query", "deviceId"),
    auth.userHasAdminAccessToDevice,
    async (request: Request, response: Response) => {
      const users = (
        await response.locals.device.users(
          response.locals.requestUser,
          ["id", "username"]
        )
      ).map((user) => ({
        userName: user.username,
        id: user.id,
        admin: ((user as any).DeviceUsers || (user as any).GroupUsers).admin,
        relation: (user as any).DeviceUsers ? "device" : "group"
      }));

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["OK."],
        rows: users,
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
    extractValidJWT,
    validateFields([
      eitherOf(
        nameOf(body("username")),
        idOf(body("userId"))
      ),
      idOf(body("deviceId")),
      booleanOf(body("admin"))
    ]),
    auth.authenticateAndExtractUser,
    extractUserByNameOrId("body", "username", "userId"),
    extractDevice("body", "deviceId"),
    auth.userHasAdminAccessToDevice,
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
   * @apiParam {String} username name of the user to delete from the device.
   * @apiParam {Number} deviceId ID of the device.
   *
   * @apiUse V1ResponseSuccess

   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/users`,
    extractValidJWT,
    validateFields([
      idOf(body("deviceId")),
      eitherOf(
        nameOf(body("username")),
        idOf(body("userId"))
      )
    ]),
    auth.authenticateAndExtractUser,
    extractDevice("body", "deviceId"),
    auth.userHasAdminAccessToDevice,
    extractUserByNameOrId("body", "username", "userId"),
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
    extractValidJWT,
    validateFields([
      nameOf(body("newGroup")),
      validNameOf(body("newName")),
      validPasswordOf(body("newPassword"))
    ]),
    auth.authenticateAndExtractDevice,
    extractGroupByName("body", "newGroup"),
    async function (request: Request, response: Response, next: NextFunction) {
      logger.warning("Request device %s", response.locals.requestDevice);
      const device = await (response.locals.requestDevice as Device).reRegister(
        request.body.newName,
        response.locals.group,
        request.body.newPassword
      );
      if (device === false) {
        return next(new ClientError(
          `already a device in group '${response.locals.groupname}' with the name '${request.body.newName}'`
        ));
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
   * @api {get} /api/v1/devices/query Query devices by groups or devices.
   * @apiName query
   * @apiGroup Device
   * @apiDescription This call is to query all devices by groupname and/or groupname & devicename.
   * Both active and inactive devices are returned.
   *
   * @apiUse V1DeviceAuthorizationHeader // FIXME - is this correct?
   *
   * @apiParam {JSON} [devices] array of Devices. Either groups or devices (or both) must be supplied.
   * @apiParamExample {JSON} devices:
   * [{
   *   "devicename":"newdevice",
   *   "groupname":"newgroup"
   * }]
   * @apiParam {String[]} [groups] array of group names. Either groups or devices (or both) must be supplied.
   * @apiParam {String} [operator] to use when user supplies both groups and devices. Default is `"or"`.
   * Accepted values are `"and"` or `"or"`.
   * @apiSuccess {JSON} devices Array of devices which match fully (group or group and devicename)
   * @apiSuccessExample {JSON} devices:
   * [{
   *  "groupname":"group name",
   *  "devicename":"device name",
   *  "id":2008,
   *  "saltId":1007,
   *  "Group.groupname":"group name"
   * }]
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/query`,
    extractValidJWT,
    validateFields([
      // Does this only work for users with global read access?
      query("devices")
        .exists()
        .optional()
        .withMessage(expectedTypeOf("TestDeviceAndGroupSchema[]"))
        .bail()
        .custom(jsonSchemaOf(arrayOf(TestDeviceAndGroupSchema))),
      query("groups")
        .exists()
        .optional()
        .bail()
        .custom(asArray({ min: 1 }))
        .withMessage(expectedTypeOf("string[]")),
      query("operator")
        .isIn(["or", "and", "OR", "AND"])
        .optional(),
    ]),
    auth.authenticateAndExtractUserWithAccess({ devices: "r" }), // FIXME What about checking access to devices?
    parseJSONField("query", "devices"),
    parseJSONField("query", "groups"),
    async function (request: Request, response: Response, next: NextFunction) {
      if (!response.locals.devices && !response.locals.groups) {
        return next(new ClientError("At least one of 'devices' or 'groups' must be specified", 422));
      }
      let operator = Op.or;
      if (
        request.query.operator && (request.query.operator as string).toLowerCase() == "and"
      ) {
        operator = Op.and;
      }
      const devices = await models.Device.queryDevices(
        response.locals.requestUser,
        (response.locals.devices || []) as TestDeviceAndGroup[],
        (response.locals.groups || []) as string[],
        operator
      );
      return responseUtil.send(response, {
        statusCode: 200,
        devices: devices.devices,
        nameMatches: devices.nameMatches,
        messages: ["Completed get devices query."],
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
    extractValidJWT,
    validateFields([
      idOf(param("deviceId")),
      query("from")
        .isISO8601()
        .toDate()
        .default(new Date()),
      query("window-size")
        .isInt()
        .toInt()
        .default(2160), // Default to a three month rolling window
    ]),
    auth.authenticateAndExtractUser,
    extractDevice("params", "deviceId"),
    // Make sure the user can see the device:
    auth.userHasAccessToGroup,
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
    extractValidJWT,
    validateFields([
      idOf(param("deviceId")),
      query("from")
        .isISO8601()
        .toDate()
        .default(new Date()),
      query("window-size")
        .isInt()
        .toInt()
        .default(2160), // Default to a three month rolling window
    ]),
    auth.authenticateAndExtractUser,
    extractDevice("params", "deviceId"),
    auth.userHasAccessToDevice,
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
