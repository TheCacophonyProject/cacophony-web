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
import modelsInit from "@models/index.js";
import { successResponse } from "./responseUtil.js";
import { body, param, query } from "express-validator";
import type { Application, NextFunction, Request, Response } from "express";
import { ClientError, UnprocessableError } from "../customErrors.js";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAdminAuthorizedRequiredDeviceById,
  fetchAdminAuthorizedRequiredGroupByNameOrId,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredDeviceInGroup,
  fetchAuthorizedRequiredDevices,
  fetchAuthorizedRequiredGroupById,
  fetchAuthorizedRequiredGroupByNameOrId,
  fetchAuthorizedRequiredStationById,
  fetchUnauthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredScheduleById,
  parseJSONField,
} from "../extract-middleware.js";
import {
  anyOf,
  checkDeviceNameIsUniqueInGroup,
  deprecatedField,
  idOf,
  integerOfWithDefault,
  nameOf,
  nameOrIdOf,
  stringOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware.js";
import type { Device } from "models/Device.js";
import type {
  ApiDeviceLocationFixup,
  ApiDeviceResponse,
} from "@typedefs/api/device.js";
import ApiDeviceLocationFixupSchema from "@schemas/api/device/ApiDeviceLocationFixup.schema.json" assert { type: "json" };
import logging from "@log";
import type { ApiGroupUserResponse } from "@typedefs/api/group.js";
import { jsonSchemaOf } from "@api/schema-validation.js";
import Sequelize, { Op } from "sequelize";
import type {
  DeviceHistory,
  DeviceHistorySettings,
} from "@models/DeviceHistory.js";
import {
  DeviceType,
  HttpStatusCode,
  RecordingType,
} from "@typedefs/api/consts.js";
import type { Recording } from "@models/Recording.js";
import config from "@config";
import { streamS3Object } from "@api/V1/signedUrl.js";
import { deleteFile } from "@models/util/util.js";
import { uploadFileStream } from "@api/V1/util.js";
import type { ApiStationResponse } from "@typedefs/api/station.js";
import { mapStation } from "@api/V1/Station.js";
import { mapTrack } from "@api/V1/Recording.js";
import { createEntityJWT } from "@api/auth.js";

const models = await modelsInit();

export const mapDeviceResponse = (
  device: Device,
  viewAsSuperUser: boolean
): ApiDeviceResponse => {
  try {
    const mapped: ApiDeviceResponse = {
      deviceName: device.deviceName,
      id: device.id,
      type: device.kind,
      groupName: device.Group?.groupName,
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
    if (device.heartbeat && device.nextHeartbeat && device.active) {
      // NOTE: If the device is inactive, we don't get a health indicator for it.
      mapped.isHealthy = device.nextHeartbeat.getTime() > Date.now();
    } else if (device.active && device.kind === "audio") {
      // TODO: Can we update battery levels for bird monitors to the device, and show some health stats?
      const twelveHoursAgo = new Date();
      twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);
      mapped.isHealthy =
        (device.lastConnectionTime &&
          device.lastConnectionTime.getTime() > twelveHoursAgo.getTime()) ||
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
interface ApiCreateProxyDeviceRequestBody {
  group: string; // Name of group to assign the device to.
  deviceName: string; // Unique (within group) device name.
  type: DeviceType;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiDeviceLocationFixupBody {
  setStationAtTime: ApiDeviceLocationFixup;
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
interface ApiStationResponseSuccess {
  station: ApiStationResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiStationsResponseSuccess {
  stations: ApiStationResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiLocationResponseSuccess {
  location: ApiStationResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiLocationsResponseSuccess {
  locations: { fromDateTime: Date; location: ApiStationResponse }[];
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
      if (request.body.devicename) {
        request.body.deviceName = request.body.devicename;
        delete request.body.devicename;
      }
      const device: Device = await models.Device.create({
        deviceName: request.body.deviceName,
        password: request.body.password,
        GroupId: response.locals.group.id,
      });
      let saltId;
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
        models.DeviceHistory.create({
          saltId,
          setBy: "register",
          GroupId: device.GroupId,
          DeviceId: device.id,
          fromDateTime: new Date(),
          deviceName: device.deviceName,
          uuid: device.id,
        }),
      ]);
      return successResponse(response, "Created new device.", {
        id: device.id,
        saltId: device.saltId,
        token: `JWT ${createEntityJWT(device)}`,
      });
    }
  );

  /**
   * @api {post} /api/v1/devices/create-proxy-device Create a new (proxy) device
   * @apiName CreateProxyDevice
   * @apiGroup Device
   *
   * @apiInterface {apiBody::ApiCreateProxyDeviceRequestBody}
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} id id of device registered
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/create-proxy-device`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOf(body("group")),
      validNameOf(body("deviceName")),
      body("type")
        .default("trailcam")
        .optional()
        .isIn(Object.values(DeviceType)),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(body("group")),
    checkDeviceNameIsUniqueInGroup(body("deviceName")),
    async (request: Request, response: Response) => {
      try {
        const device: Device = await models.Device.create({
          deviceName: request.body.deviceName,
          GroupId: response.locals.group.id,
          kind: request.body.type,
          password: "no-password",
        });
        await Promise.all([
          device.update({ uuid: device.id, saltId: device.id }),
          // Create the initial entry in the device history table.
          models.DeviceHistory.create({
            saltId: device.id,
            setBy: "register",
            GroupId: device.GroupId,
            DeviceId: device.id,
            fromDateTime: new Date(),
            deviceName: device.deviceName,
            uuid: device.id,
          }),
        ]);
        return successResponse(response, "Created new device.", {
          id: device.id,
        });
      } catch (e) {
        console.log(e);
      }
    }
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
    validateFields([idOf(param("deviceId")), nameOrIdOf(body("group"))]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(body("group")),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request: Request, response: Response, _next: NextFunction) => {
      // Get the recording count for the device.
      const deviceId = response.locals.device.id;
      const hasRecording = await models.Recording.findOne({
        where: {
          DeviceId: deviceId,
          GroupId: response.locals.group.id,
        },
      });
      if (hasRecording) {
        await response.locals.device.update({
          active: false,
        });
        return successResponse(response, "Set device inactive", {
          id: deviceId,
        });
      } else {
        await models.DeviceHistory.destroy({
          where: {
            uuid: response.locals.device.uuid,
          },
        });
        await response.locals.device.destroy();
        return successResponse(response, "Removed device", {
          id: deviceId,
        });
      }
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
        return successResponse(response, "Completed get devices query.", {
          devices: {
            rows: mapLegacyDevicesResponse(
              mapDevicesResponse(
                response.locals.devices,
                response.locals.viewAsSuperUser
              )
            ),
          },
        });
      }
      return successResponse(response, "Completed get devices query.", {
        devices: mapDevicesResponse(
          response.locals.devices,
          response.locals.viewAsSuperUser
        ),
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
      return successResponse(response, "Completed get device query.", {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser
        ),
      });
    }
  );

  // Alias of /api/v1/devices/:deviceId for consistency reasons
  app.get(
    `${apiUrl}/:id`,
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
      return successResponse(response, "Completed get device query.", {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser
        ),
      });
    }
  );

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
    `${apiUrl}/:id/reference-image/:exists?`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      param("exists").optional(),
      query("view-mode").optional().equals("user"),
      query("at-time").isISO8601().toDate().optional(),
      query("type").optional().isIn(["pov", "in-situ"]),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const checkIfExists = request.params.exists === "exists";
      const atTime =
        (request.query["at-time"] &&
          (request.query["at-time"] as unknown as Date)) ||
        new Date();
      const device = response.locals.device;
      const deviceHistoryEntry: DeviceHistory =
        await models.DeviceHistory.findOne({
          where: {
            uuid: device.uuid,
            GroupId: device.GroupId,
            location: { [Op.ne]: null },
            fromDateTime: { [Op.lte]: atTime },
          },
          order: [["fromDateTime", "DESC"]],
        });

      const kind = request.query.type || "pov";
      let referenceImage;
      let referenceImageFileSize;
      if (kind === "pov") {
        referenceImage = deviceHistoryEntry?.settings?.referenceImagePOV;
        referenceImageFileSize =
          deviceHistoryEntry?.settings?.referenceImagePOVFileSize;
      } else {
        referenceImage = deviceHistoryEntry?.settings?.referenceImageInSitu;
        referenceImageFileSize =
          deviceHistoryEntry?.settings?.referenceImageInSituFileSize;
      }
      const fromTime = deviceHistoryEntry?.fromDateTime;
      if (referenceImage && fromTime && referenceImageFileSize) {
        if (checkIfExists) {
          // We want to return the earliest time after creation that this reference image is valid for too, so that the client only
          // needs to query this API occasionally.
          const laterDeviceHistoryEntry: DeviceHistory =
            await models.DeviceHistory.findOne({
              where: [
                {
                  uuid: device.uuid,
                  GroupId: device.GroupId,
                  fromDateTime: { [Op.gt]: fromTime },
                },
                models.sequelize.where(
                  Sequelize.fn("ST_X", Sequelize.col("location")),
                  { [Op.ne]: deviceHistoryEntry.location.lng }
                ),
                models.sequelize.where(
                  Sequelize.fn("ST_Y", Sequelize.col("location")),
                  { [Op.ne]: deviceHistoryEntry.location.lat }
                ),
              ] as any,
              order: [["fromDateTime", "ASC"]],
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
            payload
          );
        } else {
          // Get reference image for device at time if any, and return it
          const mimeType = "image/webp"; // Or something better
          const time = fromTime
            ?.toISOString()
            .replace(/:/g, "_")
            .replace(".", "_");
          const filename = `device-${device.uuid}-reference-image@${time}.webp`;
          // Get reference image for device at time if any.
          return streamS3Object(
            request,
            response,
            referenceImage,
            filename,
            mimeType,
            response.locals.requestUser.id,
            device.groupId,
            referenceImageFileSize
          );
        }
      }
      return next(
        new UnprocessableError(
          "No reference image available for device at time"
        )
      );
    }
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
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const atTime =
        (request.query["at-time"] &&
          (request.query["at-time"] as unknown as Date)) ||
        new Date();
      const device = response.locals.device;
      const deviceHistoryEntry = await models.DeviceHistory.findOne({
        where: {
          uuid: device.uuid,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
          fromDateTime: { [Op.lte]: atTime },
        },
        include: [
          {
            model: models.Station,
            include: [
              {
                model: models.Group,
                attributes: ["groupName"],
              },
            ],
          },
        ],
        order: [["fromDateTime", "DESC"]],
      });
      if (deviceHistoryEntry && deviceHistoryEntry.Station) {
        return successResponse(response, "Got station for device at time", {
          location: mapStation(deviceHistoryEntry.Station),
        });
      }
      return next(
        new UnprocessableError("No station recorded for device at time")
      );
    }
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
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const fromTime =
        request.query["from-time"] &&
        (request.query["from-time"] as unknown as Date);
      const untilTime =
        (request.query["until-time"] &&
          (request.query["until-time"] as unknown as Date)) ||
        new Date();

      const timeWindow = {};
      if (fromTime) {
        (timeWindow as any).recordingDateTime = {
          [Op.and]: [{ [Op.gt]: fromTime }, { [Op.lte]: untilTime }],
        };
      }
      const tag = request.params.tag;
      const tracks = await models.Track.findAll({
        raw: true,
        where: {
          archivedAt: { [Op.eq]: null },
        },
        include: [
          {
            model: models.TrackTag,
            required: true,
            where: {
              [Op.and]: {
                [Op.or]: [
                  { automatic: { [Op.eq]: true }, "data.name": "Master" },
                  { automatic: { [Op.eq]: false } },
                ],
              },
            },
            attributes: ["automatic", "what"],
          },
          {
            model: models.Recording,
            required: true,
            where: {
              DeviceId: response.locals.device.id,
              GroupId: response.locals.device.GroupId,
              ...timeWindow,
            },
            attributes: [],
          },
        ],
        order: [["id", "DESC"]],
      });

      const tracksById = new Map();
      for (const userTrack of tracks.filter(
        (track) => !track["TrackTags.automatic"]
      )) {
        tracksById.set(userTrack.id, userTrack);
      }
      for (const autoTrack of tracks.filter(
        (track) =>
          track["TrackTags.automatic"] && track["TrackTags.what"] === tag
      )) {
        if (
          !(
            tracksById.has(autoTrack.id) &&
            tracksById.get(autoTrack.id)["TrackTags.what"] !== tag
          )
        ) {
          tracksById.set(autoTrack.id, autoTrack);
        }
      }
      const filteredTracks = Array.from(tracksById.values()).filter(
        (track) => track["TrackTags.what"] === tag
      );
      return successResponse(response, "Got tracks with tag", {
        tracks: filteredTracks.map(mapTrack),
      });
    }
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
      idOf(query("stationId")).optional(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const fromTime =
        request.query["from-time"] &&
        (request.query["from-time"] as unknown as Date);
      const untilTime =
        (request.query["until-time"] &&
          (request.query["until-time"] as unknown as Date)) ||
        new Date();

      // We only want to get tracks that are not falsified by a human.
      const timeWindow = {};
      if (fromTime) {
        (timeWindow as any).recordingDateTime = {
          [Op.and]: [{ [Op.gt]: fromTime }, { [Op.lte]: untilTime }],
        };
      }
      const tracks = await models.Track.findAll({
        raw: true,
        where: {
          archivedAt: { [Op.eq]: null },
        },
        include: [
          {
            model: models.TrackTag,
            required: true,
            where: {
              [Op.and]: {
                [Op.or]: [
                  { automatic: { [Op.eq]: true }, "data.name": "Master" },
                  { automatic: { [Op.eq]: false } },
                ],
              },
            },
            attributes: ["automatic", "what", "path"],
          },
          {
            model: models.Recording,
            required: true,
            where: {
              DeviceId: response.locals.device.id,
              GroupId: response.locals.device.GroupId,
              ...timeWindow,
            },
            attributes: [],
          },
        ],
      });

      const tracksById = new Map();
      for (const userTrack of tracks.filter(
        (track) => !track["TrackTags.automatic"]
      )) {
        tracksById.set(userTrack.id, userTrack);
      }
      for (const autoTrack of tracks.filter(
        (track) => track["TrackTags.automatic"]
      )) {
        if (
          !(
            tracksById.has(autoTrack.id) &&
            tracksById.get(autoTrack.id)["TrackTags.what"] !==
              autoTrack["TrackTags.what"]
          )
        ) {
          tracksById.set(autoTrack.id, autoTrack);
        }
      }
      const uniqueTags = {};
      for (const track of tracksById.values()) {
        const what = track["TrackTags.what"];
        if (!uniqueTags[what]) {
          uniqueTags[what] = { what, path: track["TrackTags.path"], count: 1 };
        } else {
          uniqueTags[what].count += 1;
        }
      }
      return successResponse(response, "Got used track-tags", {
        trackTags: Object.values(uniqueTags),
      });
    }
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
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const device = response.locals.device;
      const deviceLocations = await models.DeviceHistory.findAll({
        where: {
          uuid: device.uuid,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
        },
        include: [
          {
            model: models.Station,
            include: [
              {
                model: models.Group,
                attributes: ["groupName"],
              },
            ],
          },
        ],
        order: [["fromDateTime", "DESC"]],
      });

      const locations = Object.values(
        deviceLocations
          .map(({ Station, fromDateTime }) => ({
            fromDateTime,
            location: mapStation(Station),
          }))
          .reduce((acc, item) => {
            acc[item.location.id] = item;
            return acc;
          }, {})
      ).sort(
        (
          a: { fromDateTime: Date; location: ApiStationResponse },
          b: { fromDateTime: Date; location: ApiStationResponse }
        ) => {
          return (
            new Date(b.fromDateTime).getTime() -
            new Date(a.fromDateTime).getTime()
          );
        }
      );
      return successResponse(response, "Got locations for device", {
        locations,
      });
    }
  );

  /**
   * @api {post} /api/v1/devices/:deviceId/reference-image Set the reference image for a device
   * @apiName GetDeviceReferenceImageAtTime
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiQuery {String} [at-time] ISO8601 formatted date string for when the reference image should be current.
   * @apiQuery {String} [type] Can be 'pov' for point-of-view reference image or 'in-situ' for a reference image showing device placement in the environment.
   * @apiBody {Binary} Binary image file for reference image.
   *
   * @apiDescription Sets a reference image for a device at a given point in time, or now,
   * if no date time is specified.  Not that the content-typ
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
      query("at-time").default(new Date().toISOString()).isISO8601().toDate(),
      query("type").optional().isIn(["pov", "in-situ"]),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response) => {
      // Set the reference image.
      // If the location hasn't changed, we need to carry this forward whenever we create
      // another device history entry?
      const referenceType = request.query.type || "pov";
      // TODO: Make some tests for this.
      const atTime = request.query["at-time"] as unknown as Date;
      const device = response.locals.device;
      const previousDeviceHistoryEntry: DeviceHistory =
        await models.DeviceHistory.findOne({
          where: {
            uuid: device.uuid,
            GroupId: device.GroupId,
            location: { [Op.ne]: null },
            fromDateTime: { [Op.lt]: atTime },
          },
          order: [["fromDateTime", "DESC"]],
        });
      if (previousDeviceHistoryEntry) {
        // If there was a previous reference image for this location entry, delete it.
        const previousSettings: DeviceHistorySettings =
          previousDeviceHistoryEntry.settings || {};
        if (previousSettings) {
          if (referenceType === "pov" && previousSettings.referenceImagePOV) {
            try {
              await deleteFile(previousSettings.referenceImagePOV);
              delete previousSettings.referenceImagePOV;
              delete previousSettings.referenceImagePOVFileSize;
            } catch (e) {
              // ...
            }
          } else if (
            referenceType === "in-situ" &&
            previousSettings.referenceImageInSitu
          ) {
            try {
              await deleteFile(previousSettings.referenceImageInSitu);
              delete previousSettings.referenceImageInSitu;
              delete previousSettings.referenceImageInSituFileSize;
            } catch (e) {
              // ...
            }
          }
        }

        const { key, size } = await uploadFileStream(request as any, "ref");
        const newSettings =
          referenceType === "pov"
            ? {
                referenceImagePOVFileSize: size,
                referenceImagePOV: key,
              }
            : {
                referenceImageInSituFileSize: size,
                referenceImageInSitu: key,
              };
        await previousDeviceHistoryEntry.update({
          settings: {
            ...previousSettings,
            ...newSettings,
          },
        });
        return successResponse(response, { key, size });
      } else {
        // We can't add an image, because we don't have a device location.
        return successResponse(
          response,
          "No location for device to tag with reference"
        );
      }
    }
  );

  /**
 * @api {post} /api/v1/devices/:deviceId/mask-regions Set mask regions for a device
 * @apiName SetDeviceMaskRegions
 * @apiGroup Device
 * @apiParam {Integer} deviceId Id of the device
 * @apiBody {Object[]} maskRegions collection of mask regions 
 * @apiBodyExample {json} 
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
    body("maskRegions").isArray().not().isEmpty(),
    query("at-time").default(new Date().toISOString()).isISO8601().toDate(),
  ]),
  fetchAuthorizedRequiredDeviceById(param("id")),
  async (request: Request, response: Response) => {
    try {
      const atTime = request.query["at-time"] as unknown as Date;
      const maskRegions = request.body.maskRegions;
      const device = response.locals.device;
      const deviceHistoryEntry: DeviceHistory = await models.DeviceHistory.findOne({
        where: {
          uuid: device.uuid,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
          fromDateTime: { [Op.lt]: atTime },
        },
        order: [["fromDateTime", "DESC"]],
      });

      if (deviceHistoryEntry) {
        await deviceHistoryEntry.update({
          settings: {
            ...deviceHistoryEntry.settings,
            maskRegions: maskRegions,
          },
        });

        return successResponse(response, "Mask regions added successfully");
      } else {
        return successResponse(
          response,
          "No device history settings entry found to add mask regions"
        );
      }
    } catch (e) {
      console.log(e);
    }
  }
);

/**
 * @api {get} /api/v1/devices/:deviceId/settings Get device settings
 * @apiName GetDeviceSettings
 * @apiGroup Device
 * @apiParam {Integer} deviceId Id of the device
 *
 * @apiDescription Retrieves settings for a device from the DeviceHistory table.
 *
 * @apiUse V1UserAuthorizationHeader
 *
 * @apiUse V1ResponseSuccess
 * @apiSuccess {Object} settings Device settings
 * @apiUse V1ResponseError
 */

app.get(
  `${apiUrl}/:id/mask-regions`,
  extractJwtAuthorizedUser,
  validateFields([
    idOf(param("id")),
    query("at-time").isISO8601().toDate().optional(),
  ]),
  fetchAuthorizedRequiredDeviceById(param("id")),
  async (request: Request, response: Response) => {
    try {
      const atTime = request.query["at-time"] as unknown as Date;
      const device = response.locals.device;
      const deviceSettings: DeviceHistory | null = await models.DeviceHistory.findOne({
        where: {
          uuid: device.uuid,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
          fromDateTime: { [Op.lte]: atTime },
        },
        order: [["fromDateTime", "DESC"]],
      });

      if (deviceSettings) {
        return successResponse(response, "Device mask-regions retrieved successfully", deviceSettings.settings);
      } else {
        return successResponse(response, "No device mask-regions found");
      }
    } catch (e) {
      console.log(e);
    }
  }
);

  /**
   * @api {patch} /api/v1/devices/:deviceId/fix-location Fix a device location at a given time
   * @apiName FixupDeviceLocationAtTimeById
   * @apiGroup Device
   * @apiParam {Integer} deviceId Id of the device
   * @apiInterface {apiBody::ApiDeviceLocationFixupBody} recording The recording data.
   *
   * @apiDescription A group admin can fix a location of a device at a particular time.
   * If needed, a new station will be created.
   *
   * Once a new station is selected for the device at that time - and until such a time as the device moves again,
   * recordings from the device for that time interval will be re-assigned to that station, and have their location
   * set to the location of the station.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id/fix-location`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("setStationAtTime").custom(
        jsonSchemaOf(ApiDeviceLocationFixupSchema)
      ),
    ]),
    fetchAdminAuthorizedRequiredDeviceById(param("id")),
    parseJSONField(body("setStationAtTime")),
    async (request, response, next) => {
      // Now make sure we have access to the station.
      await fetchAuthorizedRequiredStationById(
        response.locals.setStationAtTime.stationId
      )(request, response, next);
    },
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.device.GroupId !== response.locals.station.GroupId) {
        return next(
          new ClientError(
            "Supplied station doesn't belong to the same group as supplied device"
          )
        );
      }
      const { stationId, fromDateTime, location } =
        response.locals.setStationAtTime;
      const device = response.locals.device;
      let station = await models.Station.findByPk(stationId);
      let fromDateTimeParsed;
      try {
        fromDateTimeParsed = new Date(Date.parse(fromDateTime));
      } catch (e) {
        return next(
          new UnprocessableError(
            "Supplied fromDateTime is not a valid timestamp"
          )
        );
      }
      if (fromDateTimeParsed < station.activeAt) {
        station = await station.update({ activeAt: fromDateTime });
      }

      const setLocation = location || station.location;

      // Check if there's already a device entry at that time:
      const deviceHistoryEntry = await models.DeviceHistory.findOne({
        where: {
          uuid: device.uuid,
          //fromDateTime: { [Op.gte]: fromDateTime },
          fromDateTime,
        },
        //order: [["fromDateTime", "asc"]]
      });
      if (deviceHistoryEntry) {
        await deviceHistoryEntry.update({
          setBy: "user",
          location: setLocation,
          stationId: station.id,
          fromDateTime,
        });
      } else {
        await models.DeviceHistory.create({
          uuid: device.uuid,
          saltId: device.saltId,
          DeviceId: device.id,
          fromDateTime,
          location: setLocation,
          setBy: "user",
          GroupId: device.GroupId,
          deviceName: device.deviceName,
          stationId: station.id,
        });
      }
      // Get the earliest history location that's later than our current fromDateTime, if any
      const laterLocation: DeviceHistory = await models.DeviceHistory.findOne({
        where: {
          uuid: device.uuid,
          GroupId: device.GroupId,
          location: { [Op.ne]: null },
          fromDateTime: { [Op.gt]: fromDateTime },
        },
        order: [["fromDateTime", "ASC"]],
      });

      // FIXME - Do we need to exclude null recordingDateTime?
      const recordingTimeWindow = {
        DeviceId: device.id,
        StationId: { [Op.ne]: stationId },
        recordingDateTime: { [Op.gte]: fromDateTime },
      };
      if (laterLocation) {
        (recordingTimeWindow.recordingDateTime as any) = {
          [Op.and]: [
            { [Op.gte]: fromDateTime },
            { [Op.lt]: laterLocation.fromDateTime },
          ],
        };
      } else {
        // Update the device known location if this is the latest device history entry.
        await device.update({ location: setLocation });
      }

      const affectedRecordings = await models.Recording.findAll({
        where: recordingTimeWindow,
      });
      const stationsIdsToUpdateLatestRecordingFor = Object.keys(
        affectedRecordings.reduce((acc, recording) => {
          if (recording.StationId) {
            acc[recording.StationId] = true;
          }
          return acc;
        }, {})
      ).map(Number);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [affectedCount] = await models.Recording.update(
        {
          location: setLocation,
          StationId: station.id,
        },
        {
          where: recordingTimeWindow,
        }
      );
      let stationsToUpdateLatestRecordingFor = [];
      if (stationsIdsToUpdateLatestRecordingFor.length !== 0) {
        stationsToUpdateLatestRecordingFor = await models.Station.findAll({
          where: {
            id: { [Op.in]: stationsIdsToUpdateLatestRecordingFor },
          },
        });
      }
      stationsToUpdateLatestRecordingFor.push(station);

      const allStationRecordingTimeUpdates = [];
      for (const station of stationsToUpdateLatestRecordingFor) {
        // Get the latest thermal recording, and the latest audio recording, and update

        // Make sure we update the latest times for both kinds of recordings on the station,
        // and if removing the last recording from a station, null out the lastXXRecordingTime field
        const [
          latestThermalRecording,
          latestAudioRecording,
          earliestRecording,
        ] = await Promise.all([
          models.Recording.findOne({
            where: {
              StationId: station.id,
              type: RecordingType.ThermalRaw,
              recordingDateTime: { [Op.ne]: null },
            },
            order: [["recordingDateTime", "DESC"]],
          }),
          models.Recording.findOne({
            where: {
              StationId: station.id,
              type: RecordingType.Audio,
              recordingDateTime: { [Op.ne]: null },
            },
            order: [["recordingDateTime", "DESC"]],
          }),

          models.Recording.findOne({
            where: {
              StationId: station.id,
              recordingDateTime: { [Op.ne]: null },
            },
            order: [["recordingDateTime", "ASC"]],
          }),
        ]);
        let updates: any = {};

        if (
          latestAudioRecording &&
          (!station.lastAudioRecordingTime ||
            latestAudioRecording.recordingDateTime !==
              station.lastAudioRecordingTime)
        ) {
          updates.lastAudioRecordingTime = (
            latestAudioRecording as Recording
          ).recordingDateTime;
        } else if (!latestAudioRecording && station.lastAudioRecordingTime) {
          updates.lastAudioRecordingTime = null;
        }
        if (
          latestThermalRecording &&
          (!station.lastThermalRecordingTime ||
            latestThermalRecording.recordingDateTime !==
              station.lastThermalRecordingTime)
        ) {
          updates.lastThermalRecordingTime = (
            latestThermalRecording as Recording
          ).recordingDateTime;
        } else if (
          !latestThermalRecording &&
          station.lastThermalRecordingTime
        ) {
          updates.lastThermalRecordingTime = null;
        }
        if (station.automatic && station.id !== stationId) {
          if (
            earliestRecording &&
            earliestRecording.recordingDateTime < station.activeAt
          ) {
            updates.activeAt = (
              earliestRecording as Recording
            ).recordingDateTime;
          } else if (!earliestRecording) {
            await station.destroy();
            updates = {};
            await models.DeviceHistory.destroy({
              where: {
                stationId: station.id,
              },
            });
          }
        }

        if (Object.keys(updates).length !== 0) {
          allStationRecordingTimeUpdates.push(station.update(updates));
        }
      }
      if (allStationRecordingTimeUpdates.length) {
        await Promise.all(allStationRecordingTimeUpdates);
      }
      return successResponse(response, [
        "Updated device station at time.",
        `Updated ${affectedCount} recording(s)`,
      ]);
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
      return successResponse(response, "Request successful", {
        device: mapDeviceResponse(
          response.locals.device,
          response.locals.viewAsSuperUser
        ),
      });
    }
  );

  const getUsersFns = [
    async (request, response, next) => {
      await fetchAuthorizedRequiredGroupById(response.locals.device.GroupId)(
        request,
        response,
        next
      );
    },
    async (request: Request, response: Response) => {
      const users = (
        await response.locals.group.getUsers({
          attributes: ["id", "userName"],
          through: {
            where: { removedAt: { [Op.eq]: null, pending: { [Op.eq]: null } } },
          },
        })
      ).map((user) => ({
        userName: user.userName,
        id: user.id,
        admin: (user as any).GroupUsers.admin,
        owner: (user as any).GroupUsers.admin,
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
      query("only-active").optional().isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
    ]),
    // Should this require admin access to the device?
    fetchAdminAuthorizedRequiredDeviceById(query("deviceId")),
    ...getUsersFns
  );

  // Alias of /api/v1/devices/users for consistency reasons
  app.get(
    `${apiUrl}/:deviceId/users`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("only-active").optional().isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
    ]),
    // Should this require admin access to the device?
    fetchAdminAuthorizedRequiredDeviceById(param("deviceId")),
    ...getUsersFns
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
      query("only-active").default(false).isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    fetchUnauthorizedRequiredScheduleById(body("scheduleId")),
    (request, response, next) => {
      if (
        response.locals.schedule.UserId == response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        next();
      } else {
        return next(
          new ClientError(
            "Schedule doesn't belong to user",
            HttpStatusCode.Forbidden
          )
        );
      }
    },
    async (request, response) => {
      await response.locals.device.update({
        ScheduleId: response.locals.schedule.id,
      });
      return successResponse(response, "schedule assigned");
    }
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
      // Allow adding a schedule to an inactive device by default
      query("only-active").default(false).isBoolean().toBoolean(),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    fetchUnauthorizedRequiredScheduleById(body("scheduleId")),
    (request, response, next) => {
      if (
        response.locals.schedule.UserId == response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        next();
      } else {
        return next(
          new ClientError(
            "Schedule doesn't belong to user",
            HttpStatusCode.Forbidden
          )
        );
      }
    },
    async (request, response) => {
      await response.locals.device.update({
        ScheduleId: null,
      });
      return successResponse(response, "schedule removed");
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
      const requestDevice: Device = await models.Device.findByPk(
        response.locals.requestDevice.id
      );

      const device = await requestDevice.reRegister(
        models,
        request.body.newName,
        response.locals.group,
        request.body.newPassword
      );
      if (device === false) {
        return next(
          new ClientError(
            `already a device in group '${response.locals.group.groupName}' with the name '${request.body.newName}'`
          )
        );
      }
      return successResponse(response, "Registered the device again.", {
        id: device.id,
        token: `JWT ${createEntityJWT(device)}`,
      });
    }
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
      return successResponse(response, { cacophonyIndex });
    }
  );

  /**
   * @api {get} /api/v1/devices/{:deviceId}/cacophony-index-bulk Get the cacophony index for a device across a given range of time frames
   * @apiName cacophony-index-bulk
   * @apiGroup Device
   * @apiDescription Get multiple Cacophony Index values
   * for a given device.  These numbers are the averages of all the Cacophony Index values within the
   * given windows of time.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} deviceId ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [steps=7] Number of time frames to return [default=7]
   * @apiQuery {String} [interval=days] description of each time frame size
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Object} #TODO
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId/cacophony-index-bulk`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("steps"), 7), // Default to 7 day window
      stringOf(query("interval")).default("days"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const cacophonyIndexBulk = await models.Device.getCacophonyIndexBulk(
        response.locals.requestUser,
        response.locals.device,
        request.query.from as unknown as Date,
        request.query.steps as unknown as number,
        request.query.interval as unknown as String
      );
      return successResponse(response, { cacophonyIndexBulk });
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
      return successResponse(response, { cacophonyIndex });
    }
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
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
      stringOf(query("type")).default("audio"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const speciesCount = await models.Device.getSpeciesCount(
        response.locals.requestUser,
        response.locals.device.id,
        request.query.from as unknown as Date,
        request.query["window-size"] as unknown as number,
        request.query.type as unknown as string
      );
      return successResponse(response, { speciesCount });
    }
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
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("steps"), 7), // Default to 7 day window
      stringOf(query("interval")).default("days"),
      stringOf(query("type")).default("audio"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const speciesCountBulk = await models.Device.getSpeciesCountBulk(
        response.locals.requestUser,
        response.locals.device.id,
        request.query.from as unknown as Date,
        request.query.steps as unknown as number,
        request.query.interval as unknown as String,
        request.query.type as unknown as string
      );
      return successResponse(response, { speciesCountBulk });
    }
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
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async function (request: Request, response: Response) {
      const activeDaysCount = await models.Device.getDaysActive(
        response.locals.requestUser,
        response.locals.device.id,
        request.query.from as unknown as Date,
        request.query["window-size"] as unknown as number
      );
      return successResponse(response, { activeDaysCount });
    }
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
      const requestDevice = (await models.Device.findByPk(
        response.locals.requestDevice.id
      )) as Device;
      await requestDevice.updateHeartbeat(models, request.body.nextHeartbeat);
      return successResponse(response, "Heartbeat updated.");
    }
  );

  if (!config.productionEnv) {
    // NOTE: This api is currently for facilitating testing only, and is
    //  not available in production builds.

    /**
     * @api {post} /api/v1/:deviceId/history Get device history
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
      validateFields([idOf(param("deviceId"))]),
      fetchAuthorizedRequiredDeviceById(param("deviceId")),
      async function (request: Request, response: Response) {
        const history = await models.DeviceHistory.findAll({
          where: {
            DeviceId: response.locals.device.id,
          },
          order: [["fromDateTime", "ASC"]],
        });
        return successResponse(response, "Got device history", { history });
      }
    );
  }
}
