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
import { someResponse, successResponse } from "./responseUtil.js";
import { body, param, query } from "express-validator";
import type { Application, NextFunction, Request, Response } from "express";
import {
  ClientError,
  FatalError,
  UnprocessableError,
} from "../customErrors.js";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  extractJwtAuthorizedUserFromBody,
  extractJwtAuthorizedUserOrDevice,
  fetchAdminAuthorizedRequiredDeviceById,
  fetchAdminAuthorizedRequiredGroupByNameOrId,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredDeviceInGroup,
  fetchAuthorizedRequiredDevices,
  fetchAuthorizedRequiredGroupById,
  fetchAuthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredScheduleById,
} from "../extract-middleware.js";
import {
  atLeastOneOf,
  atMostOneOf,
  booleanOf,
  checkDeviceNameIsUniqueInGroup,
  deprecatedField,
  exactlyOneOf,
  exactlyOneOfOrDefault,
  idOf,
  integerOfWithDefault,
  nameOf,
  nameOrIdOf,
  optionalDateOf,
  stringOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware.js";
import { Device } from "@models/Device.js";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  ImageMimeTypes,
  MaskRegion,
} from "@typedefs/api/device.js";
import ApiDeviceHistorySettingsSchema from "@schemas/api/device/ApiDeviceHistorySettings.schema.json" with { type: "json" };
import MaskRegionsSchema from "@schemas/api/device/MaskRegions.schema.json" with { type: "json" };
import logging from "@log";
import type { ApiGroupUserResponse } from "@typedefs/api/group.js";
import { jsonSchemaOf } from "@api/schema-validation.js";
import Sequelize, { Op } from "sequelize";
import { DeviceHistory } from "@models/DeviceHistory.js";
import { Station, TimeInterval } from "@models/Station.js";
import { Group } from "@models/Group.js";
import {
  DeviceActionStatus,
  DeviceType,
  HttpStatusCode,
  RecordingType,
} from "@typedefs/api/consts.js";
import { Recording } from "@models/Recording.js";
import { Track } from "@models/Track.js";
import config from "@config";
import { streamS3Object } from "@api/V1/signedUrl.js";
import { uploadFileStream } from "@api/V1/util.js";
import type { ApiStationResponse } from "@typedefs/api/station.js";
import { mapStation } from "@api/V1/Station.js";
import { mapTrack } from "@api/V1/Recording.js";
import { createEntityJWT } from "@api/auth.js";
import {
  locationsAreEqual,
  removeLocationSpecificSettings,
  tryToMatchLocationToStationInGroup,
} from "@/models/util/locationUtils.js";
import { deleteFile } from "@/models/util/util.js";
import { TrackTag } from "@models/TrackTag.js";
import { User } from "@models/User.js";
import { DeviceId, LocationId, SaltId } from "@typedefs/api/common.js";
import {
  deleteUpload,
  greaterDate,
} from "@api/fileUploaders/uploadGenericRecording.js";
import { postgresLocationExactlyMatches } from "@api/V1/deviceHistoryUpdates.js";

const mapDeviceKind = (device: Device): DeviceType => {
  if (device.lastThermalRecordingTime && device.lastAudioRecordingTime) {
    return DeviceType.Hybrid;
  } else if (device.lastThermalRecordingTime) {
    return DeviceType.Thermal;
  } else if (device.lastAudioRecordingTime) {
    return DeviceType.Audio;
  }
  return DeviceType.Thermal;
};

export const mapDeviceResponse = (
  device: Device,
  viewAsSuperUser: boolean,
): ApiDeviceResponse => {
  try {
    const mapped: ApiDeviceResponse = {
      deviceName: device.deviceName,
      id: device.id,
      type: mapDeviceKind(device),
      groupName: device.Group?.groupName,
      groupId: device.GroupId,
      active: device.active,
      saltId: device.saltId,
      admin:
        viewAsSuperUser || device.Group?.Users[0]?.GroupUsers?.admin || false,
    };
    if (device.lastConnectionTime) {
      mapped.lastConnectionTime = device.lastConnectionTime.toISOString();
    }
    if (device.lastThermalRecordingTime) {
      mapped.lastThermalRecordingTime =
        device.lastThermalRecordingTime.toISOString();
    }
    if (device.lastAudioRecordingTime) {
      mapped.lastAudioRecordingTime =
        device.lastAudioRecordingTime.toISOString();
    }
    if (device.earliestAudioRecordingTime) {
      mapped.earliestAudioRecordingTime =
        device.earliestAudioRecordingTime.toISOString();
    }
    if (device.earliestThermalRecordingTime) {
      mapped.earliestThermalRecordingTime =
        device.earliestThermalRecordingTime.toISOString();
    }
    if (device.active) {
      const twentyFiveHoursAgo = new Date();
      twentyFiveHoursAgo.setHours(twentyFiveHoursAgo.getHours() - 25);
      mapped.isHealthy =
        (device.lastConnectionTime &&
          device.lastConnectionTime.getTime() > twentyFiveHoursAgo.getTime()) ||
        false;
    }

    if (device.location) {
      mapped.location = device.location;
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
  viewAsSuperUser: boolean,
): ApiDeviceResponse[] =>
  devices.map((device) => mapDeviceResponse(device, viewAsSuperUser));

export interface ApiRegisterDeviceRequestBody {
  group: string; // Name of group to assign the device to.
  deviceName: string; // Unique (within group) device name.
  password: string; // password Password for the device.
  saltId?: number; // Salt ID of device. Will be set as device id if not given.
}

export interface ApiCreateProxyDeviceRequestBody {
  group: string; // Name of group to assign the device to.
  deviceName: string; // Unique (within group) device name.
  type: DeviceType;
}

export interface MaskRegionsDataBody {
  maskRegions: Record<string, MaskRegion[]>;
}

export interface ApiDevicesResponseSuccess {
  devices: ApiDeviceResponse[];
}

export interface ApiDeviceResponseSuccess {
  device: ApiDeviceResponse;
}

export interface ApiStationResponseSuccess {
  station: ApiStationResponse;
}

export interface ApiStationsResponseSuccess {
  stations: ApiStationResponse[];
}

export interface ApiLocationResponseSuccess {
  location: ApiStationResponse;
}

export interface ApiLocationsResponseSuccess {
  locations: { fromDateTime: Date; location: ApiStationResponse }[];
}

export interface ApiDeviceSettingsResponseSuccess {
  settings: ApiDeviceHistorySettings;
}

export interface ApiDeviceTypeResponseSuccess {
  type: DeviceType;
}

export interface ApiDeviceUsersResponseSuccess {
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
      exactlyOneOf(
        validNameOf(body("devicename")),
        validNameOf(body("deviceName")),
      ),
      validPasswordOf(body("password")),
      idOf(body("saltId")).optional(),

      // NOTE: Primarily used in testing, allows us to backdate the creation of a device
      optionalDateOf(body("fromDateTime")),
    ]),
    fetchUnauthorizedRequiredGroupByNameOrId(body("group")),
    checkDeviceNameIsUniqueInGroup(body(["devicename", "deviceName"])),
    async (request: Request, response: Response) => {
      const fromDateTime = request.body.fromDateTime as Date;
      if (request.body.devicename) {
        request.body.deviceName = request.body.devicename;
        delete request.body.devicename;
      }
      const device: Device = await Device.create({
        deviceName: request.body.deviceName,
        password: request.body.password,
        GroupId: response.locals.group.id,
      });
      let saltId: SaltId;
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
        saltId = request.body.saltId;
      } else {
        saltId = device.id;
      }
      await Promise.all([
        device.update({ saltId, uuid: device.id }),
        // Create the initial entry in the device history table.
        DeviceHistory.create({
          saltId,
          setBy: "register",
          GroupId: device.GroupId,
          DeviceId: device.id,
          fromDateTime,
          deviceName: device.deviceName,
          uuid: device.id,
        }),
      ]);
      return successResponse(response, "Created new device.", {
        id: device.id,
        saltId: device.saltId,
        token: `JWT ${createEntityJWT(device)}`,
      });
    },
  );

  /**
   * @api {post} /api/v1/devices/reregister-authorized Authorized reregister the device.
   * @apiName Reregister
   * @apiGroup Device
   * @apiDescription This call is to reregister authorized a device to change the name and/or group
   *
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiBody {String} deviceId id of the device.
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
    `${apiUrl}/reregister-authorized`,
    extractJwtAuthorisedDevice,
    extractJwtAuthorizedUserFromBody("authorizedToken"),
    validateFields([
      atLeastOneOf(nameOrIdOf(body("newGroup")), validNameOf(body("newName"))),
      validPasswordOf(body("newPassword")),
      body("authorizedToken").exists(),

      // NOTE: Primarily used in testing, allows us to backdate the creation of a device
      optionalDateOf(body("fromDateTime")),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(body("newGroup")),
    async (request: Request, response: Response, next: NextFunction) => {
      // The user should be the admin of both groups
      const requestDevice: Device = await Device.findByPk(
        response.locals.requestDevice.id,
      );
      if (!requestDevice) {
        return next(
          new ClientError(
            `device not found: ${response.locals.requestDevice.id}`,
          ),
        );
      }
      response.locals.requestDevice = requestDevice;
      response.locals.destGroup = response.locals.group;
      if (response.locals.group.id !== response.locals.requestDevice.GroupId) {
        await fetchAdminAuthorizedRequiredGroupByNameOrId(
          requestDevice.GroupId,
        )(request, response, next);
      } else {
        return next();
      }
    },
    async function (request: Request, response: Response, next: NextFunction) {
      const newDevice = await response.locals.requestDevice.reRegister(
        request.body.newName ||
          (response.locals.requestDevice as Device).deviceName,
        response.locals.destGroup,
        request.body.newPassword,
        true,
        request.body.fromDateTime,
      );
      if (newDevice === false) {
        return next(
          new ClientError(
            `already a device in group '${response.locals.destGroup.groupName}' with the name '${request.body.newName}'`,
          ),
        );
      }
      const token = `JWT ${createEntityJWT(newDevice)}`;
      return successResponse(response, "Registered the device again.", {
        id: newDevice.id,
        token,
      });
    },
  );

  // FIXME: Is this still used?
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
    // NOTE: Re-register only works on currently active devices
    validateFields([
      nameOrIdOf(body("newGroup")),
      validNameOf(body("newName")),
      validPasswordOf(body("newPassword")),
      // NOTE: Primarily used in testing, allows us to backdate the creation of a device
      optionalDateOf(body("fromDateTime")),
    ]),
    // FIXME: Should you really be allowed to move a device into a group you aren't an admin of?
    //  At least you need physical access to the device to do this.
    fetchUnauthorizedRequiredGroupByNameOrId(body("newGroup")),
    async function (request: Request, response: Response, next: NextFunction) {
      const requestDevice: Device = await Device.findByPk(
        response.locals.requestDevice.id,
      );

      const device = await requestDevice.reRegister(
        request.body.newName,
        response.locals.group,
        request.body.newPassword,
      );
      if (device === false) {
        return next(
          new ClientError(
            `already a device in group '${response.locals.group.groupName}' with the name '${request.body.newName}'`,
          ),
        );
      }
      return successResponse(response, "Registered the device again.", {
        id: device.id,
        token: `JWT ${createEntityJWT(device)}`,
      });
    },
  );

  /**
   * @api {delete} /api/v1/devices/:deviceId Delete a device
   * @apiName DeleteDevice
   * @apiGroup Device
   *
   * @apiDescription Permanently deletes a device if it has no recordings, or sets the active state
   * to `false` if it does have recordings.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      nameOrIdOf(body("group")),
      booleanOf(body("only-active"), false),
    ]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(body("group")),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (_request: Request, response: Response, _next: NextFunction) => {
      // NOTE: We don't actually delete the device - doing that proved problematic,
      // since there can still be un-uploaded recordings and events for the device
      // on a re-registered device that is the same underlying hardware unit.

      // Sanity check that device belongs to supplied project.
      if (response.locals.device.GroupId !== response.locals.group.id) {
        throw new Error("Device doesn't belong to supplied group");
      }
      const deviceId = response.locals.device.id;
      logging.info("Setting device %s with recordings inactive", deviceId);
      await response.locals.device.update({
        active: false,
      });
      return successResponse(response, "Set device inactive", {
        id: deviceId,
      });
    },
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/reactivate Reactivate a device
   * @apiName ReactivateDevice
   * @apiGroup Device
   *
   * @apiDescription If a device was previously set inactive, calling this end-point will reactivate it.
   * If the device is already active this is a no-op
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:deviceId/reactivate`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      nameOrIdOf(body("group")),
      exactlyOneOfOrDefault(false)(
        query("only-active").optional().isBoolean().toBoolean(),
        deprecatedField(query("onlyActive")).optional().isBoolean().toBoolean(),
      ),
    ]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(body("group")),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (_request: Request, response: Response, _next: NextFunction) => {
      const deviceId = response.locals.device.id;
      await response.locals.device.update({
        active: true,
      });
      return successResponse(response, "Set device active", {
        id: deviceId,
      });
    },
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
      atMostOneOf(
        deprecatedField(query("onlyActive").optional().isBoolean().toBoolean()),
        query("only-active").optional().isBoolean().toBoolean(),
      ),
    ]),
    fetchAuthorizedRequiredDevices,
    async (request: Request, response: Response) => {
      if (request.headers["user-agent"].includes("okhttp")) {
        return successResponse(response, "Completed get devices query.", {
          devices: {
            rows: mapLegacyDevicesResponse(
              mapDevicesResponse(
                response.locals.devices,
                response.locals.viewAsSuperUser,
              ),
            ),
          },
        });
      }
      return successResponse(response, "Completed get devices query.", {
        devices: mapDevicesResponse(
          response.locals.devices,
          response.locals.viewAsSuperUser,
        ),
      });
    },
  );

  app.get(
    `${apiUrl}/latest-software-versions`,
    extractJwtAuthorizedUser,
    async function (_request: Request, response: Response) {
      try {
        const result = await (
          await fetch(
            "https://raw.githubusercontent.com/TheCacophonyProject/salt-version-info/main/salt-version-info.json",
          )
        ).json();
        return successResponse(response, "Got latest software versions.", {
          versions: result,
        });
      } catch (_error) {
        return someResponse(
          response,
          HttpStatusCode.ServerError,
          "Version info not available",
        );
      }
    },
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
   * @apiInterface {apiSuccess::ApiDeviceResponseSuccess} device Device details
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
   *  "lastThermalRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "lastAudioRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "earliestThermalRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "earliestAudioRecordingTime": "2021-11-07T01:38:48.400Z",
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
      exactlyOneOfOrDefault(false)(
        query("only-active").optional().isBoolean().toBoolean(),
        deprecatedField(query("onlyActive")).optional().isBoolean().toBoolean(),
      ),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (_request: Request, response: Response) => {
      return successResponse(response, "Completed get device query.", {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser,
        ),
      });
    },
  );

  // Alias of /api/v1/devices/:deviceId for consistency reasons
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      deprecatedField(query("where")), // Sidekick
      exactlyOneOfOrDefault(false)(
        query("only-active").optional().isBoolean().toBoolean(),
        deprecatedField(query("onlyActive")).optional().isBoolean().toBoolean(),
      ),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (_request: Request, response: Response) => {
      return successResponse(response, "Completed get device query.", {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser,
        ),
      });
    },
  );
  /**
   * @api {get} /api/v1/devices/:deviceId/location Get the location for a device at a given time
   * @apiName GetDeviceLocationAtTime
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiQuery {String} [at-time] ISO8601 formatted date string for when the reference image should be current.
   *
   * @apiDescription Returns the location (station) for a device at a given point in time, or now,
   * if no date time is specified
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiLocationResponseSuccess} station Device location details
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/location`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      query("at-time").isISO8601().toDate().optional(),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const atTime =
        (request.query["at-time"] &&
          (request.query["at-time"] as unknown as Date)) ||
        new Date();
      const device = response.locals.device as Device;
      const deviceHistoryEntry = await DeviceHistory.findOne({
        where: {
          DeviceId: device.id,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
          fromDateTime: { [Op.lte]: atTime },
        },
        include: [
          {
            model: Station,
            include: [
              {
                model: Group,
                attributes: ["groupName"],
              },
            ],
          },
        ],
        order: [
          ["fromDateTime", "DESC"],
          ["id", "DESC"],
        ],
      });
      if (deviceHistoryEntry && deviceHistoryEntry.Station) {
        return successResponse(response, "Got location for device at time", {
          location: mapStation(deviceHistoryEntry.Station),
        });
      }
      return next(
        new UnprocessableError("No location recorded for device at time"),
      );
    },
  );

  app.get(
    `${apiUrl}/:id/tracks-with-tag/:tag`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      param("tag").isString(),
      query("view-mode").optional().equals("user"),
      query("from-time").isISO8601().toDate().optional(),
      query("until-time").isISO8601().toDate().optional(),
      query("type")
        .default(RecordingType.ThermalRaw)
        .isIn(Object.values(RecordingType)),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const device = response.locals.device as Device;
      const type = request.query.type as RecordingType;
      const tag = request.params.tag;
      const fromTime = device.minTimeForRecordingType(
        type,
        request.query["from-time"] &&
          (request.query["from-time"] as unknown as Date),
      );
      const untilTime = device.maxTimeForRecordingType(
        type,
        request.query["until-time"] &&
          (request.query["until-time"] as unknown as Date),
      );
      const timeWindow: Sequelize.WhereOptions = {};
      if (fromTime) {
        timeWindow.recordingDateTime = {
          [Op.and]: [{ [Op.gte]: fromTime }, { [Op.lte]: untilTime }],
        };
      }

      const tracks = await Track.findAll({
        where: {
          archivedAt: { [Op.eq]: null },
        },
        include: [
          {
            model: TrackTag,
            required: true,
            where: {
              used: true,
              what: tag,
              archivedAt: { [Op.eq]: null },
            },
            attributes: ["automatic", "what"],
          },
          {
            model: Recording,
            required: true,
            where: {
              DeviceId: response.locals.device.id,
              GroupId: response.locals.device.GroupId,
              type,
              deletedAt: { [Op.eq]: null },
              ...timeWindow,
            },
            attributes: [],
          },
        ],
        attributes: ["id", "startSeconds", "endSeconds"],
      });
      const tracksById = new Map();
      for (const userTrack of tracks.filter(
        (track) => !track.TrackTags[0].automatic,
      )) {
        tracksById.set(userTrack.id, userTrack);
      }
      for (const autoTrack of tracks.filter(
        (track) => track.TrackTags[0].automatic,
      )) {
        if (!tracksById.has(autoTrack.id)) {
          tracksById.set(autoTrack.id, autoTrack);
        }
      }
      const filteredTracks = Array.from(tracksById.values());
      const trackDatas = [];
      for (const track of filteredTracks) {
        trackDatas.push(Track.getTrackData(track.id));
      }
      const resolvedTrackDatas = await Promise.all(trackDatas);
      for (let i = 0; i < filteredTracks.length; i++) {
        filteredTracks[i].data = resolvedTrackDatas[i];
      }
      return successResponse(response, "Got tracks with tag", {
        tracks: filteredTracks.map((x) => mapTrack(x)),
      });
    },
  );

  // Use this with device location history to work out what animals a device has seen in a given time window, and/or at a given station.
  app.get(
    `${apiUrl}/:id/unique-track-tags`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      query("from-time").isISO8601().toDate().optional(),
      query("until-time").isISO8601().toDate().optional(),
      query("type")
        .default(RecordingType.ThermalRaw)
        .isIn(Object.values(RecordingType)),
      idOf(query("stationId")).optional(),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const device = response.locals.device;
      const type = request.query.type as RecordingType;
      const fromTime = device.minTimeForRecordingType(
        type,
        request.query["from-time"] &&
          (request.query["from-time"] as unknown as Date),
      );
      const untilTime = device.maxTimeForRecordingType(
        type,
        request.query["until-time"] &&
          (request.query["until-time"] as unknown as Date),
      );

      // We only want to get tracks that are not falsified by a human.
      const timeWindow: Sequelize.WhereOptions = {};
      if (fromTime) {
        timeWindow.recordingDateTime = {
          [Op.and]: [{ [Op.gte]: fromTime }, { [Op.lte]: untilTime }],
        };
      }
      const tracks = await Track.findAll({
        where: {
          archivedAt: { [Op.eq]: null },
        },
        include: [
          {
            model: TrackTag,
            required: true,
            where: {
              used: true,
            },
            attributes: ["automatic", "what", "path"],
          },
          {
            model: Recording,
            required: true,
            where: {
              DeviceId: response.locals.device.id,
              GroupId: response.locals.device.GroupId,
              type,
              ...timeWindow,
            },
            attributes: [],
          },
        ],
      });

      const tracksById = new Map();
      for (const userTrack of tracks.filter(
        (track) => !track.TrackTags[0].automatic,
      )) {
        tracksById.set(userTrack.id, userTrack);
      }
      for (const autoTrack of tracks.filter(
        (track) => track.TrackTags[0].automatic,
      )) {
        if (
          !(
            tracksById.has(autoTrack.id) &&
            tracksById.get(autoTrack.id).TrackTags[0].what !==
              autoTrack.TrackTags[0].what
          )
        ) {
          tracksById.set(autoTrack.id, autoTrack);
        }
      }
      const uniqueTags: Record<
        string,
        { what: string; path: string; count: number }
      > = {};
      for (const track of tracksById.values()) {
        const what = track.TrackTags[0].what;
        if (!uniqueTags[what]) {
          uniqueTags[what] = { what, path: track.TrackTags[0].path, count: 1 };
        } else {
          uniqueTags[what].count += 1;
        }
      }
      return successResponse(response, "Got used track-tags", {
        trackTags: Object.values(uniqueTags),
      });
    },
  );

  /**
   * @api {get} /api/v1/devices/:deviceId/location-history Get the location history for a device
   * @apiName GetDeviceStations
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   *
   * @apiDescription Returns the all stations that a device has been part of, in reverse chronological order
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiLocationsResponseSuccess} stations Device station details
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/location-history`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (_request: Request, response: Response, _next: NextFunction) => {
      const device = response.locals.device;
      const deviceLocations = await DeviceHistory.findAll({
        where: {
          DeviceId: device.id,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
        },
        include: [
          {
            model: Station,
            include: [
              {
                model: Group,
                attributes: ["groupName"],
              },
            ],
            required: true,
          },
        ],
        order: [
          ["fromDateTime", "DESC"],
          ["id", "DESC"],
        ],
      });

      const locations = Object.values(
        deviceLocations
          .map(({ Station, fromDateTime }) => ({
            fromDateTime,
            location: mapStation(Station),
          }))
          .reduce(
            (acc, item) => {
              acc[item.location.id] = item;
              return acc;
            },
            {} as Record<
              LocationId,
              { fromDateTime: Date; location: ApiStationResponse }
            >,
          ),
      ).sort((a, b) => {
        return (
          new Date(b.fromDateTime).getTime() -
          new Date(a.fromDateTime).getTime()
        );
      });
      return successResponse(response, "Got locations for device", {
        locations,
      });
    },
  );
  const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ] as const;
  const MIME_TO_EXTENSION: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  // Helper to get file extension from MIME type
  const getExtension = (mimeType: string) =>
    MIME_TO_EXTENSION[mimeType] || "webp";
  /**
   * @api {get} /api/v1/devices/:deviceId/reference-image Get the reference image (if any) for a device
   * @apiName GetDeviceReferenceImageAtTime
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiParam {String} exists If set to 'exists' returns whether the device has a reference image at the given time.
   * @apiQuery {String} [at-time] ISO8601 formatted date string for when the reference image should be current.
   * @apiQuery {String} [type] Can be 'pov' for point-of-view reference image or 'in-situ' for a reference image showing device placement in the environment.
   *
   * @apiDescription Returns a reference image for a device (if any has been set) at a given point in time, or now,
   * if no date time is specified
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess binary data of reference image
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/reference-image{/:exists}`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      param("exists").optional().equals("exists"),
      query("view-mode").optional().equals("user"),
      query("at-time").isISO8601().toDate().optional(),
      query("type").optional().isIn(["pov", "in-situ"]),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const checkIfExists = request.params.exists === "exists";
      const atTime =
        (request.query["at-time"] &&
          (request.query["at-time"] as unknown as Date)) ||
        new Date();
      const device = response.locals.device as Device;
      const kind = (request.query.type as string) || "pov";
      const deviceHistoryEntry =
        await DeviceHistory.latestWithAnyLocationAtTime(
          device.id,
          device.GroupId,
          atTime,
        );
      if (!deviceHistoryEntry) {
        return next(
          new UnprocessableError(
            "No reference image available for device at time",
          ),
        );
      }

      let referenceImage: string;
      let referenceImageFileSize: number;

      if (kind === "pov") {
        referenceImage = deviceHistoryEntry.settings?.referenceImagePOV;
        referenceImageFileSize =
          deviceHistoryEntry.settings?.referenceImagePOVFileSize;
      } else {
        referenceImage = deviceHistoryEntry.settings?.referenceImageInSitu;
        referenceImageFileSize =
          deviceHistoryEntry.settings?.referenceImageInSituFileSize;
      }

      const fromTime = deviceHistoryEntry.fromDateTime;
      if (referenceImage && fromTime && referenceImageFileSize) {
        if (checkIfExists) {
          // Build a payload showing fromDateTime & untilDateTime
          const laterDeviceHistoryEntry = await DeviceHistory.findOne({
            where: {
              DeviceId: device.id,
              GroupId: device.GroupId,
              fromDateTime: { [Op.gt]: fromTime },
            },
            order: [
              ["fromDateTime", "ASC"],
              ["id", "ASC"],
            ],
          });
          const payload: { fromDateTime: Date; untilDateTime?: Date } = {
            fromDateTime: fromTime,
          };
          if (laterDeviceHistoryEntry) {
            payload.untilDateTime = laterDeviceHistoryEntry.fromDateTime;
          }
          return successResponse(
            response,
            "Reference image exists at supplied time",
            payload,
          );
        } else {
          // Actually return the image
          const timeString = fromTime
            .toISOString()
            .replace(/:/g, "_")
            .replace(".", "_");
          const mimeType =
            kind === "pov"
              ? deviceHistoryEntry.settings?.referenceImagePOVMimeType
              : deviceHistoryEntry.settings?.referenceImageInSituMimeType;

          // Validate the mimeType or default
          const validatedMimeType = ALLOWED_MIME_TYPES.includes(mimeType)
            ? mimeType
            : "image/webp";
          const filename = `device-${
            device.id
          }-reference-image@${timeString}.${getExtension(validatedMimeType)}`;
          return streamS3Object(
            request,
            response,
            referenceImage,
            filename,
            validatedMimeType,
            response.locals.requestUser.id,
            device.GroupId,
            referenceImageFileSize,
          );
        }
      }

      return next(
        new UnprocessableError(
          "No reference image available for device at time",
        ),
      );
    },
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/reference-image Set the reference image for a device
   * @apiName SetDeviceReferenceImageAtTime
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiQuery {String} [at-time] ISO8601 formatted date string for when the reference image should be current.
   * @apiQuery {String} [type] Can be 'pov' for point-of-view reference image or 'in-situ' for a reference image showing device placement in the environment.
   * @apiBody {Binary} Binary image file for reference image.
   *
   * @apiDescription Sets a reference image for a device at a given point in time, or now,
   * if no date time is specified.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess binary data of reference image
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/reference-image`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      query("at-time").optional().isISO8601().toDate(),
      query("type").optional().isIn(["pov", "in-situ"]),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      let contentType =
        request.get("Content-Type") || request.get("Content-Disposition");
      if (
        !ALLOWED_MIME_TYPES.includes(contentType as unknown as ImageMimeTypes)
      ) {
        contentType = "image/webp";
      }
      if (!contentType) {
        return next(
          new FatalError(
            `Unsupported image type. Allowed types: ${ALLOWED_MIME_TYPES.join(
              ", ",
            )}`,
          ),
        );
      }
      // Set the reference image.
      // If the location hasn't changed, we need to carry this forward whenever we create
      // another device history entry?
      const referenceType = request.query.type || "pov";
      const atTime =
        (request.query["at-time"] as unknown as Date) ?? new Date();
      const device = response.locals.device as Device;
      const previousDeviceHistoryEntry =
        await DeviceHistory.latestWithAnyLocationAtTime(
          device.id,
          device.GroupId,
          atTime,
        );
      if (!previousDeviceHistoryEntry) {
        // We can't add an image, because we don't have a device location.
        return next(
          new UnprocessableError(
            "No location for device to tag with reference",
          ),
        );
      }

      // If there was a previous reference image for this location entry, delete it.
      const previousSettings: ApiDeviceHistorySettings =
        previousDeviceHistoryEntry.settings || {};
      // If the previous entry didn't have a station, that means no recordings have been added against this reference
      // image yet, so we'll collapse previous reference images down.
      const hadPreviousReferenceImage =
        !!previousSettings.referenceImagePOV ||
        !!previousSettings.referenceImageInSitu;
      const hadPreviousReferenceImageButNoStation =
        hadPreviousReferenceImage &&
        previousDeviceHistoryEntry.stationId === null;

      const referenceImagesToDelete: string[] = [];
      if (hadPreviousReferenceImageButNoStation) {
        if (previousSettings.referenceImagePOV) {
          referenceImagesToDelete.push(previousSettings.referenceImagePOV);
        }
        if (previousSettings.referenceImageInSitu) {
          referenceImagesToDelete.push(previousSettings.referenceImageInSitu);
        }
      }

      // Upload with validated content type
      const { key, size } = await uploadFileStream(request, "ref");

      // Store MIME type in settings
      const newSettings =
        referenceType === "pov"
          ? {
              referenceImagePOV: key,
              referenceImagePOVFileSize: size,
              referenceImagePOVMimeType: contentType as ImageMimeTypes,
            }
          : {
              referenceImageInSitu: key,
              referenceImageInSituFileSize: size,
              referenceImageInSituMimeType: contentType as ImageMimeTypes,
            };

      if (!hadPreviousReferenceImage) {
        // Get all the previous history entries with the exact same location prior to the previous one:
        const earlierEntries = await DeviceHistory.findAll({
          where: {
            DeviceId: device.id,
            GroupId: device.GroupId,
            fromDateTime: { [Op.lt]: previousDeviceHistoryEntry.fromDateTime },
            [Op.and]: postgresLocationExactlyMatches(
              previousDeviceHistoryEntry.location,
            ),
          },
          order: [
            ["fromDateTime", "DESC"],
            ["id", "DESC"],
          ],
        });
        const allEntriesAtLocation = [
          previousDeviceHistoryEntry,
          ...earlierEntries,
        ];
        const entriesWithoutReferenceImages = [];
        for (const entry of allEntriesAtLocation) {
          const entrySettings: ApiDeviceHistorySettings = entry.settings || {};
          const entryHasReferenceImage =
            !!entrySettings.referenceImagePOV ||
            !!entrySettings.referenceImageInSitu;
          if (!entryHasReferenceImage) {
            entriesWithoutReferenceImages.push(entry);
          } else {
            break;
          }
        }
        for (const entry of entriesWithoutReferenceImages) {
          const entrySettings: ApiDeviceHistorySettings = entry.settings || {};
          // Backdate the reference image to all the previous settings at this location
          // that didn't have one.
          await entry.update({
            settings: {
              ...entrySettings,
              ...newSettings,
            },
          });
        }
      }

      if (hadPreviousReferenceImageButNoStation || !hadPreviousReferenceImage) {
        await previousDeviceHistoryEntry.update({
          settings: {
            ...previousSettings,
            ...newSettings,
          },
        });
      } else {
        // Create a new entry at `at-time` for the new reference image, leaving the old
        // reference image intact in the previous device history entry.

        // FIXME: Might be getting to this branch when we shouldn't?

        const prevHistoryEntry = structuredClone(
          previousDeviceHistoryEntry.get({ plain: true }),
        );
        delete prevHistoryEntry.id;
        await DeviceHistory.create({
          ...prevHistoryEntry,
          fromDateTime: atTime,
          settings: {
            ...previousSettings,
            ...newSettings,
          },
        });
      }
      if (referenceImagesToDelete.length !== 0) {
        for (const key of referenceImagesToDelete) {
          await deleteUpload(key);
        }
      }
      return successResponse(response, { key, size });
    },
  );

  /**
   * @api {delete} /api/v1/devices/:deviceId/reference-image Delete reference image
   * @apiName DeleteDeviceReferenceImage
   * @apiGroup Device
   * @apiParam {Integer} deviceId ID of the device
   * @apiQuery {String} [at-time] ISO8601 date for which reference image should be deleted
   * @apiQuery {String} [type] Image type ('pov' or 'in-situ')
   *
   * @apiDescription Deletes the reference image for a device at a specific time.
   * If no time specified, deletes the current reference image.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id/reference-image`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("at-time").optional().isISO8601().toDate(),
      query("type").optional().isIn(["pov", "in-situ"]),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const atTime =
          (request.query["at-time"] as unknown as Date) ?? new Date();
        const referenceType = request.query.type ?? "pov";
        const device = response.locals.device as Device;

        // Find relevant device history entry
        const deviceHistoryEntries = await DeviceHistory.findAll({
          where: {
            DeviceId: device.id,
            GroupId: device.GroupId,
            fromDateTime: { [Op.lte]: atTime },
            location: { [Op.ne]: null },
            settings: { [Op.ne]: null },
          },
          order: [
            ["fromDateTime", "DESC"],
            ["id", "DESC"],
          ],
        });

        if (!deviceHistoryEntries) {
          return successResponse(response, "No reference to delete");
        }

        // Find entry that has referenceImage based on the type
        const deviceHistoryEntry = deviceHistoryEntries.find((dh) => {
          if (referenceType === "pov") {
            return !!dh.settings?.referenceImagePOV;
          } else {
            return !!dh.settings?.referenceImageInSitu;
          }
        });

        const settings =
          (deviceHistoryEntry && deviceHistoryEntry.settings) || {};
        const imageKey =
          referenceType === "pov"
            ? settings.referenceImagePOV
            : settings.referenceImageInSitu;

        if (!imageKey) {
          return successResponse(response, "No reference image to delete");
        }

        // Delete from S3
        await deleteFile(imageKey);
        let someChanged = false;
        for (const entry of deviceHistoryEntries) {
          // Delete from all entries that contain a reference to this reference image.
          let updatedSettings = { ...(entry.settings || {}) };
          let changed = false;
          if (referenceType === "pov") {
            if (updatedSettings.referenceImagePOV === imageKey) {
              delete updatedSettings.referenceImagePOV;
              delete updatedSettings.referenceImagePOVFileSize;
              delete updatedSettings.referenceImagePOVMimeType;
              changed = true;
            }
          } else {
            if (updatedSettings.referenceImageInSitu === imageKey) {
              delete updatedSettings.referenceImageInSitu;
              delete updatedSettings.referenceImageInSituFileSize;
              delete updatedSettings.referenceImageInSituMimeType;
              changed = true;
            }
          }
          if (Object.keys(updatedSettings).length === 0) {
            updatedSettings = null;
          }
          if (changed) {
            await entry.update({ settings: updatedSettings });
            someChanged = true;
          }
        }
        if (someChanged) {
          // If we removed a reference image, we want to see if there was a *previous* reference image that should
          // be applied forwards to all entries at the exact same location.  Maybe?
        }

        return successResponse(
          response,
          "Reference image deleted successfully",
        );
      } catch (_e) {
        next(new FatalError(`Failed to delete reference image`));
      }
    },
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/mask-regions Set mask regions for a device
   * @apiName SetDeviceMaskRegions
   * @apiGroup Device
   * @apiInterface {apiBody::MaskRegionsDataBody} device Mask region data.
   * @apiDescription Sets mask regions for a device in the DeviceHistory table.
   * These mask regions will be stored in the settings column as JSON.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} message Success message
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/mask-regions`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("maskRegions").custom(jsonSchemaOf(MaskRegionsSchema)),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const maskRegions: Record<string, MaskRegion> = request.body.maskRegions;
      const device = response.locals.device as Device;
      try {
        const deviceHistoryEntry: DeviceHistory =
          await DeviceHistory.latestWithAnyLocationAtTime(
            device.id,
            device.GroupId,
          );

        if (!deviceHistoryEntry) {
          return next(
            new ClientError(
              "No device history settings entry found to add mask regions",
            ),
          );
        }
        const newSettings: ApiDeviceHistorySettings = {
          ...deviceHistoryEntry.settings,
        };
        const hadMaskRegion =
          !!newSettings.maskRegions &&
          Object.keys(newSettings.maskRegions).length !== 0;
        if (Object.keys(maskRegions).length) {
          newSettings.maskRegions = maskRegions;
        } else {
          delete newSettings.maskRegions;
        }
        if (hadMaskRegion) {
          // Create a new copy of the current DeviceHistory entry, so that previous mask regions at this location
          // are preserved.
          const prevEntry = structuredClone(
            deviceHistoryEntry.get({ plain: true }),
          );
          delete prevEntry.id;
          await DeviceHistory.create({
            ...prevEntry,
            fromDateTime: new Date(),
            settings: newSettings,
          });
        } else {
          // Update the existing DeviceHistory entry without mask regions in place.  The mask region will apply from
          // when this location was created.
          await deviceHistoryEntry.update({
            settings: newSettings,
          });
        }
        return successResponse(response, "Mask regions added successfully");
      } catch (_e) {
        return next(
          new UnprocessableError(
            "An error occurred while processing the request",
          ),
        );
      }
    },
  );

  /**
   * @api {get} /api/v1/devices/:deviceId/mask-regions Get device mask-regions
   * @apiName GetDeviceMaskRegions
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiQuery {String} [at-time] ISO8601 formatted date string for when the reference image should be current.
   * @apiDescription Retrieves mask regions for a device from the DeviceHistory table.
   *
   * @apiSuccessExample {JSON} device:
   * {
   *   "maskRegions": {
   *     "trap": {
   *        "regionData": [
   *          { "x": 0.99, "y": 0.66 },
   *          { "x": 0.80, "y": 0.83 },
   *          { "x": 0.58, "y": 0.18 }
   *      ]},
   *      "sky": {
   *        "regionData": [
   *          { "x": 0.3, "y": 0.1 },
   *          { "x": 0.5, "y": 0.7 },
   *          { "x": 0.8, "y": 0.4 }
   *       ]}
   *     }
   * }
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::MaskRegionsDataBody}
   * @apiUse V1ResponseError
   */

  app.get(
    `${apiUrl}/:id/mask-regions`,
    extractJwtAuthorizedUserOrDevice,
    validateFields([
      idOf(param("id")),
      optionalDateOf(query("at-time")),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const atTime =
        (request.query["at-time"] as unknown as Date) ?? new Date();
      const device = response.locals.device as Device;
      const deviceSettings: DeviceHistory | null =
        await DeviceHistory.latestWithAnyLocationAtTime(
          device.id,
          device.GroupId,
          atTime,
        );
      if (
        deviceSettings &&
        deviceSettings.settings &&
        deviceSettings.settings.maskRegions
      ) {
        return successResponse(
          response,
          "Device mask-regions retrieved successfully",
          { maskRegions: deviceSettings.settings.maskRegions },
        );
      } else {
        return next(new UnprocessableError("No device mask-regions found"));
      }
    },
  );

  /**
   * @api {get} /api/v1/devices/:deviceId/settings Get device settings
   * @apiName GetDeviceSettings
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   *
   * @apiDescription Retrieves settings from the DeviceHistory table for a specified device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiDeviceSettingsResponseSuccess}
   * @apiUse V1ResponseError
   */

  app.get(
    `${apiUrl}/:id/settings`,
    extractJwtAuthorizedUserOrDevice,
    validateFields([
      idOf(param("id")),
      optionalDateOf(query("at-time")),
      booleanOf(query("only-active"), false),
      booleanOf(query("latest-synced"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const atTime = request.query["at-time"] as unknown as Date;
        // // Always ask for one second from now, as sometimes during testing we get a later timestamp in the DB for the
        // // entry that's *just* been inserted.
        // atTime.setSeconds(atTime.getSeconds() + 1);
        // atTime.setMilliseconds(0);
        const device = response.locals.device as Device;
        let deviceSettings: DeviceHistory | null;
        if (request.query["latest-synced"]) {
          deviceSettings =
            await DeviceHistory.latestWithOrWithoutLocationAtTime(
              device.id,
              device.GroupId,
              atTime,
              {
                "settings.synced": true,
              },
            );
        } else {
          deviceSettings =
            await DeviceHistory.latestWithOrWithoutLocationAtTime(
              device.id,
              device.GroupId,
              atTime,
            );
        }
        if (deviceSettings) {
          return successResponse(
            response,
            "Device settings retrieved successfully",
            {
              settings: deviceSettings.settings,
              location: deviceSettings.location,
            },
          );
        } else {
          return next(new UnprocessableError("Could not get settings"));
        }
      } catch (e: unknown) {
        return next(
          new FatalError((e as Error).message ?? "Could not get settings"),
        );
      }
    },
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/settings Update device settings
   * @apiName UpdateDeviceSettings
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   *
   * @apiDescription Updates settings, location, and device type in the DeviceHistory and Device tables for a specified device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiDeviceSettingsResponseSuccess}
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/settings`,
    extractJwtAuthorizedUserOrDevice,
    validateFields([
      idOf(param("id")),
      body("settings")
        .optional()
        .custom(jsonSchemaOf(ApiDeviceHistorySettingsSchema)),
      body("location")
        .optional()
        .isObject()
        .withMessage("Location must be an object with lat and lng"),
      body("location.lat")
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage("Latitude must be a valid number"),
      body("location.lng")
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage("Longitude must be a valid number"),
      body("type") // TODO: Remove this when sidekick no longer calls this
        .optional()
        .isIn(Object.values(DeviceType))
        .withMessage("Invalid device type"),
      optionalDateOf(body("fromDateTime")),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const device = response.locals.device as Device;
        const fromDateTime = (request.body.fromDateTime as Date) || new Date();
        const newSettings: ApiDeviceHistorySettings | undefined =
          request.body.settings;
        const newLocation = request.body.location;
        const setBy = response.locals.requestUser?.id ? "user" : "automatic";
        if (response.locals.requestDevice) {
          // The device is connecting directly, so update the last connected time.
          await device.update({
            lastConnectionTime: greaterDate(fromDateTime, "lastConnectionTime"),
          });
        }
        const latestDeviceHistoryEntry =
          await DeviceHistory.latestWithOrWithoutLocationAtTime(
            device.id,
            device.GroupId,
            fromDateTime,
          );
        // Update device location and create DeviceHistory entry if new location is provided and different
        if (newLocation) {
          if (
            !device.location ||
            !locationsAreEqual(device.location, newLocation)
          ) {
            // FIXME: NOT sure we should actually do this, since this can be called with stale historical
            // data from sidekick currently.
            device.location = newLocation;
            await device.save();
          }

          const station = await tryToMatchLocationToStationInGroup(
            newLocation,
            device.GroupId,
            fromDateTime,
          );

          if (
            !latestDeviceHistoryEntry ||
            !latestDeviceHistoryEntry.location ||
            (!latestDeviceHistoryEntry.stationId && station) ||
            (latestDeviceHistoryEntry &&
              latestDeviceHistoryEntry.location &&
              !locationsAreEqual(
                latestDeviceHistoryEntry.location,
                newLocation,
              ))
          ) {
            await DeviceHistory.create({
              DeviceId: device.id,
              GroupId: device.GroupId,
              location: newLocation,
              fromDateTime,
              setBy,
              deviceName: device.deviceName,
              saltId: device.saltId,
              uuid: device.uuid,
              stationId: station?.id,
              settings: removeLocationSpecificSettings(
                latestDeviceHistoryEntry?.settings,
              ),
            });
          }
        }

        // Update device settings if provided
        let updatedEntry: ApiDeviceHistorySettings;
        if (newSettings) {
          updatedEntry = await DeviceHistory.updateDeviceSettings(
            device.id,
            device.GroupId,
            newSettings,
            setBy,
            fromDateTime,
          );
        } else {
          // Fetch the latest settings entry if no new settings are provided
          updatedEntry = (
            await DeviceHistory.latestWithOrWithoutLocationAtTime(
              device.id,
              device.GroupId,
              fromDateTime,
            )
          ).settings;
        }

        return successResponse(response, "Device updated successfully", {
          settings: updatedEntry,
          ...(newLocation && { location: newLocation }),
        });
      } catch (e: unknown) {
        return next(
          new FatalError(`Failed to update device1: ${(e as Error).message}`),
        );
      }
    },
  );

  /**
   * @api {get} /api/v1/devices/:deviceId/type Get device type
   * @apiName GetDeviceType
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   *
   * @apiDescription Get the type of device
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiDeviceTypeResponseSuccess}
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/type`,
    extractJwtAuthorizedUserOrDevice,
    validateFields([idOf(param("id"))]),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const deviceId = request.params.id as unknown as DeviceId;
        const device = await Device.findByPk(deviceId);
        if (!device) {
          return next(new UnprocessableError("Device not found"));
        }

        // Add logic to detect device type from device properties
        const detectedType = mapDeviceKind(device);

        return successResponse(response, "Device type retrieved", {
          type: detectedType,
        });
      } catch (_e) {
        return;
      }
    },
  );

  /**
   * @api {get} /api/v1/devices/:deviceName/in-group/:groupIdOrName Get a single device
   * @apiName GetDeviceInGroup
   * @apiGroup Device
   * @apiParam {string} deviceName Name of the device
   * @apiParam {stringOrInt} groupIdOrName Identifier of group device belongs to
   * @apiQuery {Boolean} [only-active=true] Only return active devices
   *
   * @apiDescription Returns details of the device if the user can access it through
   * group membership.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiDeviceResponseSuccess} device Device details
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
   *  "lastThermalRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "lastAudioRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "earliestThermalRecordingTime": "2021-11-07T01:38:48.400Z",
   *  "earliestAudioRecordingTime": "2021-11-07T01:38:48.400Z",
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
      booleanOf(query("only-active"), false),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceInGroup(
      param("deviceName"),
      param("groupIdOrName"),
    ),
    async (_request: Request, response: Response) => {
      return successResponse(response, "Request successful", {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser,
        ),
      });
    },
  );

  const getUsersFns = [
    async (request: Request, response: Response, next: NextFunction) => {
      await fetchAuthorizedRequiredGroupById(response.locals.device.GroupId)(
        request,
        response,
        next,
      );
    },
    async (_request: Request, response: Response) => {
      const users = (
        await response.locals.group.getUsers({
          attributes: ["id", "userName"],
          through: {
            where: { removedAt: { [Op.eq]: null, pending: { [Op.eq]: null } } },
          },
        })
      ).map((user: User) => ({
        userName: user.userName,
        id: user.id,
        admin: user.GroupUsers.admin,
        owner: user.GroupUsers.admin,
      }));
      return successResponse(response, "OK.", { users });
    },
  ];

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
      booleanOf(query("only-active"), false),
      query("view-mode").optional().equals("user"),
    ]),
    // Should this require admin access to the device?
    fetchAdminAuthorizedRequiredDeviceById(query("deviceId")),
    ...getUsersFns,
  );

  // Alias of /api/v1/devices/users for consistency reasons
  app.get(
    `${apiUrl}/:deviceId/users`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      booleanOf(query("only-active"), false),
      query("view-mode").optional().equals("user"),
    ]),
    // Should this require admin access to the device?
    fetchAdminAuthorizedRequiredDeviceById(param("deviceId")),
    ...getUsersFns,
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/assign-schedule Assign a schedule to a device.
   * @apiName AssignScheduleToDevice
   * @apiGroup Schedules
   * @apiDescription This call assigns a schedule to a device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number} deviceId ID of the device.
   * @apiBody {Number} scheduleId ID of the schedule to assign to the device.
   * @apiBody {Boolean} admin If true, the user should have administrator access to the device.
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:deviceId/assign-schedule`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(body("scheduleId")),
      idOf(param("deviceId")),
      // Allow adding a schedule to an inactive device by default
      booleanOf(query("only-active"), false),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    fetchUnauthorizedRequiredScheduleById(body("scheduleId")),
    (_request, response, next) => {
      if (
        response.locals.schedule.UserId == response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        next();
      } else {
        return next(
          new ClientError(
            "Schedule doesn't belong to user",
            HttpStatusCode.Forbidden,
          ),
        );
      }
    },
    async (_request, response) => {
      await response.locals.device.update({
        ScheduleId: response.locals.schedule.id,
      });
      return successResponse(response, "schedule assigned");
    },
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/remove-schedule Remove a schedule from a device.
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
    `${apiUrl}/:deviceId/remove-schedule`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(body("scheduleId")),
      idOf(param("deviceId")),
      // Allow removing a schedule from an inactive device by default
      booleanOf(query("only-active"), false),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    fetchUnauthorizedRequiredScheduleById(body("scheduleId")),
    (_request, response, next) => {
      if (
        response.locals.schedule.UserId == response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        next();
      } else {
        return next(
          new ClientError(
            "Schedule doesn't belong to user",
            HttpStatusCode.Forbidden,
          ),
        );
      }
    },
    async (_request, response) => {
      await response.locals.device.update({
        ScheduleId: null,
      });
      return successResponse(response, "schedule removed");
    },
  );

  /**
   * @api {get} /api/v1/devices/:deviceId/cacophony-index Get the cacophony index for a device
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
      optionalDateOf(query("from")),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const cacophonyIndex = await Device.getCacophonyIndex(
        response.locals.device,
        request.query.from as unknown as Date, // Get the current cacophony index
        request.query["window-size"] as unknown as number,
      );
      return successResponse(response, { cacophonyIndex });
    },
  );

  /**
   * @api {get} /api/v1/devices/{:deviceId}/species-count Get the species breakdown for a device
   * @apiName species-count
   * @apiGroup Device
   * @apiDescription Get a species count
   * for a given device, showing the count of recordings that are of each species.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} deviceId ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [window-size=2160] length of window in hours going backwards in time from the `from` param.  Default is 2160 (90 days)
   * @apiQuery {Boolean} [type=audio] Type of recording to count
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Object} #TODO
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId/species-count`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      optionalDateOf(query("from")),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
      stringOf(query("type"))
        .isIn(Object.values(RecordingType))
        .default(RecordingType.Audio),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const speciesCount = await Device.getSpeciesCount(
        response.locals.device.id,
        request.query.from as unknown as Date,
        request.query["window-size"] as unknown as number,
        request.query.type as unknown as RecordingType,
      );
      return successResponse(response, { speciesCount });
    },
  );

  /**
   * @api {get} /api/v1/devices/{:deviceId}/species-count-bulk Get the species breakdown for a device across a given range of time frames
   * @apiName species-count-bulk
   * @apiGroup Device
   * @apiDescription Get a species count
   * for a given device, showing the count of recordings that are of each species across a give range of time frames
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} deviceId ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [steps=7] Number of time frames to return [default=7]
   * @apiQuery {String} [interval=days] description of each time frame size
   * @apiQuery {Boolean} [type=audio] Type of recording to count
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Object} #TODO
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId/species-count-bulk`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      optionalDateOf(query("from")),
      integerOfWithDefault(query("steps"), 7), // Default to 7 day window
      stringOf(query("interval"))
        .isIn(Object.values(TimeInterval))
        .default(TimeInterval.Days),
      stringOf(query("type"))
        .isIn(Object.values(RecordingType))
        .default(RecordingType.Audio),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const speciesCountBulk = await Device.getSpeciesCountBulk(
        response.locals.device.id,
        request.query.from as unknown as Date,
        request.query.steps as unknown as number,
        request.query.interval as unknown as TimeInterval,
        request.query.type as unknown as RecordingType,
      );
      return successResponse(response, { speciesCountBulk });
    },
  );

  /**
   * @api {get} /api/v1/devices/{:deviceId}/active-days Get the number of days a device was active across a given date range
   * @apiName active-days
   * @apiGroup Device
   * @apiDescription Get the number of days a device was active across a given date range
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} deviceId ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [window-size=2160] length of window in hours going backwards in time from the `from` param.  Default is 2160 (90 days)
   * @apiSuccess {Integer} Number of active days
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId/days-active`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      optionalDateOf(query("from")),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const activeDaysCount = await Device.getDaysActive(
        response.locals.device.id,
        request.query.from as unknown as Date,
        request.query["window-size"] as unknown as number,
      );
      return successResponse(response, { activeDaysCount });
    },
  );

  /**
     * @api {post} /api/v1/devices/heartbeat Send device heartbeat
     * @apiName heartbeat
     * @apiGroup Device
     *
     * @apiUse V1DeviceAuthorizationHeader
     *
     * @apiBody {Date} nextHeartbeat time next heartbeat is expected

     * @apiUse V1ResponseSuccess
     * @apiUse V1ResponseError
     */
  app.post(
    `${apiUrl}/heartbeat`,
    extractJwtAuthorisedDevice,
    validateFields([body("nextHeartbeat").isISO8601().toDate()]),
    async function (request: Request, response: Response) {
      // NOTE: Disable heartbeats
      // const requestDevice = (await Device.findByPk(
      //   response.locals.requestDevice.id,
      // )) as Device;
      // await requestDevice.updateHeartbeat(request.body.nextHeartbeat);
      return successResponse(response, "Heartbeat updated.");
    },
  );

  if (!config.productionEnv) {
    // NOTE: This api is currently for facilitating testing only, and is
    //  not available in production builds.
    /**
     * @api {post} /api/v1/devices/:deviceId/history Get device history
     * @apiName history
     * @apiGroup Device
     *
     * @apiUse V1UserAuthorizationHeader
     *
     * @apiUse V1ResponseSuccess
     * @apiUse V1ResponseError
     */
    app.get(
      `${apiUrl}/:deviceId/history`,
      extractJwtAuthorizedUser,
      validateFields([
        idOf(param("deviceId")),
        booleanOf(query("only-active"), false),
      ]),
      fetchAuthorizedRequiredDeviceById(param("deviceId")),
      async function (_request: Request, response: Response) {
        const history = await DeviceHistory.findAll({
          where: {
            DeviceId: response.locals.device.id,
          },
          order: [
            ["fromDateTime", "ASC"],
            ["id", "ASC"],
          ],
        });
        return successResponse(response, "Got device history", { history });
      },
    );

    app.get(
      `${apiUrl}/:deviceId/actions`,
      extractJwtAuthorizedUserOrDevice,
      validateFields([idOf(param("deviceId")), optionalDateOf(query("from"))]),
      fetchAuthorizedRequiredDeviceById(param("deviceId")),
      async function (request, response, next) {
        // TODO: Optionally return only actions *after* the last time you polled.
        return successResponse(response, "Got device actions", {});
      },
    );

    app.put(
      `${apiUrl}/:deviceId/actions`,
      extractJwtAuthorizedUserOrDevice,
      validateFields([idOf(param("deviceId"))]),
      fetchAuthorizedRequiredDeviceById(param("deviceId")),
      async function (request, response, next) {
        // TODO: Do we need to define payload schemas?
        return successResponse(response, "Got device actions", {});
      },
    );

    app.patch(
      `${apiUrl}/:deviceId/actions/:actionId`,
      extractJwtAuthorizedUserOrDevice,
      validateFields([
        idOf(param("deviceId")),
        idOf(param("actionId")),
        body("status").isIn(Object.values(DeviceActionStatus)),
      ]),
      fetchAuthorizedRequiredDeviceById(param("deviceId")),
      async function (request, response, next) {
        // Update the status of an action
        return successResponse(response, "Got device actions", {});
      },
    );
  }
}
