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

import { expectedTypeOf, validateFields } from "../middleware.js";
import { initSequelize } from "@models/index.js";
import { successResponse } from "./responseUtil.js";
import { body, param, query } from "express-validator";
import type { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAuthorizedOptionalDeviceById,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredEventById,
  fetchUnAuthorizedOptionalEventDetailSnapshotById,
} from "../extract-middleware.js";
import { jsonSchemaOf } from "../schema-validation.js";
import EventDatesSchema from "@schemas/api/event/EventDates.schema.json" with { type: "json" };
import EventDescriptionSchema from "@schemas/api/event/EventDescription.schema.json" with { type: "json" };
import type { EventDescription, JsonDocument } from "@typedefs/api/event.js";
import logger from "@log";
import {
  booleanOf,
  deprecatedField,
  exactlyOneOf,
  idOf,
  integerOf,
  optionalDateOf,
} from "../validation-middleware.js";
import { ClientError, UnprocessableError } from "@api/customErrors.js";
import type { DeviceId, IsoFormattedDateString } from "@typedefs/api/common.js";
import { EventEnv, HttpStatusCode } from "@typedefs/api/consts.js";
import { isLatLng } from "@models/util/validation.js";
import { streamS3Object } from "@api/V1/signedUrl.js";
import { Op, QueryTypes } from "sequelize";
import { Device } from "@models/Device.js";
import { Event } from "@models/Event.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import { maybeUpdateDeviceHistoryLocation } from "@api/V1/deviceHistoryUpdates.js";
import { DeviceHistory } from "@/models/DeviceHistory.js";
import { greaterDate } from "@api/fileUploaders/uploadGenericRecording.js";
import { GroupUsers } from "@models/GroupUsers.js";

const sequelize = await initSequelize();
const EVENT_TYPE_REGEXP = /^[A-Z0-9/-]+$/i;

const uploadEvent = async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  let device = response.locals.device || response.locals.requestDevice;
  const now = (request.query["at-time"] as unknown as Date) || new Date();
  if (!device.deviceName) {
    // If we just have a device JWT id, get the actual device at this point.
    device = await Device.findByPk(device.id);
  }
  if (response.locals.requestDevice) {
    // The device is connecting directly, so update the last connected time.
    await device.update({
      lastConnectionTime: greaterDate(now, "lastConnectionTime"),
    });
  }

  let detailsId = response.locals.detailsnapshot?.id;
  let env: EventEnv = EventEnv.Unknown;
  if (!detailsId) {
    const description: EventDescription = request.body.description;
    let resolvedDetails: Record<string, JsonDocument>;
    {
      let details: JsonDocument = description.details || {};
      if (typeof description.details === "string") {
        try {
          details = JSON.parse(description.details as string);
        } catch (e) {
          //
          logger.error(
            "Failed to parse JSON %s: %s",
            e,
            typeof description.details,
          );
        }
      }
      resolvedDetails = details as Record<string, JsonDocument>;
    }

    env = (resolvedDetails["env"] as EventEnv) || EventEnv.Unknown;
    if (!["tc2-dev", "tc2-test", "tc2-prod", "unknown"].includes(env)) {
      env = EventEnv.Unknown;
    }
    delete resolvedDetails["env"];
    const detail = await DetailSnapshot.getOrCreateMatching(
      description.type,
      resolvedDetails,
    );
    detailsId = detail.id;

    // Maybe update the device history entry on config change if location has updated.
    if (description.type === "config") {
      interface ConfigEvent {
        location?: {
          latitude: number;
          longitude: number;
          updated: IsoFormattedDateString;
        };
        device?: {
          id: DeviceId;
        };
      }
      const configEventDetails = resolvedDetails as unknown as ConfigEvent;

      if (
        configEventDetails.location &&
        configEventDetails.location.latitude !== undefined &&
        configEventDetails.location.longitude !== undefined
      ) {
        const deviceId =
          (configEventDetails.device && configEventDetails.device.id) ||
          device.id;
        let configDevice = device;
        if (
          configEventDetails.device &&
          configEventDetails.device.id !== device.id
        ) {
          configDevice = await Device.findByPk(deviceId);
        }
        if (configDevice) {
          const lat = configEventDetails.location.latitude;
          const lng = configEventDetails.location.longitude;
          // Pre-validate to avoid server-side crashes on invalid inputs
          if (!isLatLng({ lat, lng }, false)) {
            // Allow logging the event still to get it off the device, just don't update the device location.
            logger.warning(`Invalid location '{"lat":${lat},"lng":${lng}}'`);
          } else {
            try {
              await maybeUpdateDeviceHistoryLocation(
                configDevice,
                { lat, lng },
                new Date(configEventDetails.location.updated),
                "config",
              );
            } catch (e: unknown) {
              let message = "unknown error";
              if (e instanceof Error) {
                message = e.message;
              }
              if (
                (e && (e as Error).name === "SequelizeValidationError") ||
                message.includes("Invalid location")
              ) {
                return next(
                  new UnprocessableError(
                    `Invalid location '{"lat":${lat},"lng":${lng}}'`,
                  ),
                );
              }
              return next(
                new ClientError(`Failed to update device history: ${message}`),
              );
            }
          }
        } else {
          return next(
            new ClientError(
              `Couldn't find device #${deviceId} to update device history location for`,
            ),
          );
        }
      }
    }
  }
  // NOTE: Allow event dates to be a little in the future to account for clock drift.
  const tenMinutesFromNow = new Date(
    new Date().setMinutes(new Date().getMinutes() + 10),
  );

  const sortedTimes: Date[] = request.body.dateTimes
    .map((dateTime: IsoFormattedDateString) => new Date(dateTime))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());
  // Check that the device was the same for earliest and latest times, otherwise need to binary
  // search to attribute events correctly.
  const earliest = sortedTimes[0];
  const latest = sortedTimes[sortedTimes.length - 1];
  const earliestActualDevice = await DeviceHistory.getDeviceFromUuidAtTime(
    device.uuid,
    earliest,
  );
  let latestActualDevice = earliestActualDevice;
  if (earliest !== latest) {
    // Check both ends
    latestActualDevice = await DeviceHistory.getDeviceFromUuidAtTime(
      device.uuid,
      latest,
    );
  }
  let eventList: {
    DeviceId: DeviceId;
    EventDetailId: number;
    dateTime: Date;
    env: EventEnv;
  }[];
  if (
    earliestActualDevice &&
    latestActualDevice &&
    earliestActualDevice.DeviceId !== latestActualDevice.DeviceId
  ) {
    // We need to bisect, but this is rare, so just map every event to the deviceId.
    const actualDevices: DeviceHistory[] = await Promise.all(
      sortedTimes.map((dateTime) =>
        DeviceHistory.getDeviceFromUuidAtTime(device.uuid, dateTime),
      ),
    );
    eventList = sortedTimes.map((dateTime, index) => ({
      DeviceId: actualDevices[index].DeviceId,
      EventDetailId: detailsId,
      dateTime,
      env,
    }));
  } else if (
    earliestActualDevice &&
    device.id !== earliestActualDevice.DeviceId
  ) {
    eventList = sortedTimes.map((dateTime) => ({
      DeviceId: earliestActualDevice.DeviceId,
      EventDetailId: detailsId,
      dateTime,
      env,
    }));
  } else {
    eventList = sortedTimes.map((dateTime) => ({
      DeviceId: device.id,
      EventDetailId: detailsId,
      dateTime,
      env,
    }));
  }
  eventList = eventList.filter((event: { dateTime: Date }) => {
    if (event.dateTime > tenMinutesFromNow) {
      logger.warning(
        "Discarding event with invalid future dateTime %s.",
        JSON.stringify(event),
      );
      return false;
    }
    return true;
  });
  const count = eventList.length;
  try {
    // Batch inserting events to max 100 events at a time, to spare DB memory usage.
    for (let i = 0; i < eventList.length; i += 100) {
      await Event.bulkCreate(
        eventList.slice(i, Math.min(i + 100, eventList.length)),
      );
    }
  } catch (e: unknown) {
    let message = "unknown error";
    if (e) {
      message = (e as Error).message;
    }
    return next(new ClientError(`Failed to record events. ${message}`));
  }
  return successResponse(response, "Added events.", {
    eventsAdded: count,
    eventDetailId: detailsId,
  });
};

export interface ApiEventsRequestBody {
  Timestamp?: IsoFormattedDateString; // Deprecated, use 'dateTimes' instead
  eventDetailId?: number; // ID of existing event details entry if known. Either eventDetailId or description are required.
  description?: EventDescription; // Description of the event. Either eventDetailId or description are required.
  dateTimes: IsoFormattedDateString[]; // Array of event times in ISO standard format, eg ["2017-11-13T00:47:51.160Z"]
}

const commonEventFields = [
  deprecatedField(body("Timestamp")),
  exactlyOneOf(
    idOf(body("eventDetailId")),
    body("description")
      .exists()
      .withMessage(expectedTypeOf("EventDescription"))
      .bail()
      .custom(jsonSchemaOf(EventDescriptionSchema))
      .bail()
      .custom(
        (description: EventDescription) =>
          description.type.match(EVENT_TYPE_REGEXP) !== null,
      )
      .withMessage("description type contains invalid characters"),
  ),
  body("dateTimes")
    .exists()
    .bail()
    .withMessage(expectedTypeOf("Array of ISO formatted date time strings"))
    .isArray({ min: 1 })
    .withMessage(`Got empty array`)
    .bail()
    .custom(jsonSchemaOf(EventDatesSchema)),

  // NOTE: Primarily used in testing, allows us to backdate the lastConnectionTime of an uploading device
  optionalDateOf(query("at-time")),
];

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/events`;

  /**
   * @api {post} /api/v1/events Add new events
   * @apiName Add Event
   * @apiGroup Events
   * @apiDescription This call is used to upload new events.
   * The event can be described by specifying an existing eventDetailId or by
   * the 'description' parameter.
   *
   * `Either eventDetailId or description is required`
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiInterface {apiBody::ApiEventsRequestBody}
   * @apiUse EventExampleDescription
   * @apiUse EventExampleEventDetailId
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer} eventsAdded Number of events added
   * @apiSuccess {Integer} eventDetailId Id of the Event Detail record used.  May be existing or newly created
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorisedDevice,
    validateFields(commonEventFields),
    // Extract required resources
    fetchUnAuthorizedOptionalEventDetailSnapshotById(body("eventDetailId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // eventDetailId is optional, but if it is supplied we need to make sure it exists
      if (request.body.eventDetailId && !response.locals.detailsnapshot) {
        return next(
          new ClientError(
            `Could not find a event snapshot with an id of '${request.body.eventDetailId}`,
            HttpStatusCode.Forbidden,
          ),
        );
      }
      next();
    },
    // Finally, upload event(s)
    uploadEvent,
  );

  /**
   * @api {post} /api/v1/events/thumbnail Adds a new thumbnail + classification event.
   * @apiName Post Device Thumbnail Classification
   * @apiGroup Events
   * @apiDescription Upload a thumbnail + classification from a connected edge device.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {File} file Thumbnail for the recording.
   * @apiBody {JSON} data JSON data in the format { what: string, conf: number, dateTimes?: IsoFormattedDateString[] }
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} success
   * @apiUse V1ResponseError
   */

  /*
  // FIXME: re-enable when we have some tests
  app.post(
    `${apiUrl}/thumbnail`,
    extractJwtAuthorisedDevice,
    util.multipartUpload(
      "event-thumb",
      async (
        _uploader,
        uploadingDevice,
        _uploadingUser,
        data,
        keys,
        _uploadedFileDatas,
      ): Promise<Event> => {
        console.assert(
          keys.length === 1,
          "Only expected 1 file attachment for this end-point",
        );
        const key = keys[0];
        // New event
        const description: EventDescription = {
          type: "classifier",
          details: {
            fileKey: key,
            ...data,
          },
        };
        delete description.details["type"];
        delete description.details["filename"];
        delete description.details["dateTimes"];
        const detail = await DetailSnapshot.getOrCreateMatching(
          description.type,
          description.details,
        );
        const dateTime =
          (data["dateTimes"] &&
            data["dateTimes"].length &&
            data["dateTimes"][0]) ||
          new Date().toISOString();
        return await Event.create({
          DeviceId: uploadingDevice.id,
          EventDetailId: detail.id,
          dateTime,
        });
      },
    ),
  );
   */

  /**
   * @api {get} /api/v1/events/:id/thumbnail Return an event thumbnail given an event id.
   * @apiName GetEventThumbnail
   * @apiGroup Events
   * @apiDescription Get an event thumbnail given an event id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/thumbnail`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchAuthorizedRequiredEventById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const event = response.locals.event;
      if (event.EventDetail.type !== "classifier") {
        return next(
          new ClientError(
            `Specified event was not of type 'thumbnail`,
            HttpStatusCode.Forbidden,
          ),
        );
      }
      await streamS3Object(
        request,
        response,
        event.EventDetail.details.fileKey,
        `event-thumbnail-${event.id}.png`,
        "image/png",
      );
    },
  );

  /**
   * @api {post} /api/v1/events/device/:deviceId Add new events on behalf of device
   * @apiName AddEventOnBehalf
   * @apiGroup Events
   * @apiDescription This call is used to upload new events on behalf of a device.
   * The event can be described by specifying an existing eventDetailId or by
   * the 'description' parameter.
   *
   * `Either eventDetailId or description is required`
   * @apiParam {String} deviceId ID of the device to upload on behalf of.
   * If you don't have access to the deviceId, the deviceName can be used instead in it's place -
   * however note that requests using deviceName will be rejected if multiple devices exist with
   * the same deviceName. The use of deviceName is `DEPRECATED` and may not be supported in future.
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiBody::ApiEventsRequestBody}
   * @apiUse EventExampleDescription
   * @apiUse EventExampleEventDetailId
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer} eventsAdded Number of events added
   * @apiSuccess {Integer} eventDetailId Id of the Event Detail record used.  May be existing or newly created
   * @apiuse V1ResponseError
   */
  app.post(
    `${apiUrl}/device/:deviceId`,
    // Validate session
    extractJwtAuthorizedUser,
    // Validate fields
    validateFields([
      idOf(param("deviceId")),
      ...commonEventFields,
      // Default to also allowing inactive devices to have uploads on their behalf
      booleanOf(query("only-active"), false),
    ]),
    // Extract required resources
    fetchUnAuthorizedOptionalEventDetailSnapshotById(body("eventDetailId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Pull out device here, since if a device gets moved from a project a user is not a member of
      // and then sidekick tries to offload events for the old device pre-move, it would otherwise
      // fail, and the events are stuck on sidekick forever.
      const device = await Device.findByPk(
        request.params.deviceId as unknown as DeviceId,
      );
      if (!device) {
        return next(
          new ClientError(
            `Could not find a device an id of '${request.params.deviceId}`,
            HttpStatusCode.Forbidden,
          ),
        );
      }
      // Make sure the user has access to a device with the same uuid
      const user = response.locals.requestUser;
      const userGroups = (
        await GroupUsers.findAll({
          where: {
            UserId: user.id,
            removedAt: null,
          },
        })
      ).map((g) => g.GroupId);
      const userDevice = await Device.findOne({
        where: {
          uuid: device.uuid,
          GroupId: { [Op.in]: userGroups },
        },
      });
      if (!userDevice) {
        return next(
          new ClientError(
            `Could not find a device an id of ${request.params.deviceId} for user`,
            HttpStatusCode.Forbidden,
          ),
        );
      }

      response.locals.device = device;
      // eventDetailId is optional, but if it is supplied we need to make sure it exists
      if (request.body.eventDetailId && !response.locals.detailsnapshot) {
        return next(
          new ClientError(
            `Could not find a event snapshot with an id of '${request.body.eventDetailId}`,
            HttpStatusCode.Forbidden,
          ),
        );
      }
      next();
    },
    uploadEvent,
  );

  /**
   * @api {get} /api/v1/events Query recorded events
   * @apiName QueryEvents
   * @apiGroup Events
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {Datetime} [startTime] Return only events on or after this time
   * @apiQuery {Datetime} [endTime] Return only events from before this time
   * @apiQuery {Integer} [deviceId] Return only events for this device id
   * @apiQuery {Integer} [limit] Limit returned events to this number (default is 100)
   * @apiQuery {Integer} [offset] Offset returned events by this amount (default is 0)
   * @apiQuery {String} [type] Alphaonly string describing the type of event wanted
   * @apiQuery {Boolean} [latest] Set to true to see the most recent events recorded listed first
   * @apiQuery {Boolean} [only-active=true] Only return events for active devices
   * @apiQuery {Boolean} [include-count=true] Get count of all events matching this query
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} offset Offset of returned page of results from 1st result matched by query.
   * @apiSuccess {Number} count Total number of results matching the query.
   * @apiSuccess {JSON} rows Array of `ApiEvent` containing details of events matching the criteria given.
   * @apiUse ApiEvent
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    // Validate session
    extractJwtAuthorizedUser,
    // Validate request structure
    validateFields([
      query("startTime")
        .isISO8601({ strict: true })
        .optional()
        .withMessage(expectedTypeOf("ISO formatted date string")),
      query("endTime")
        .isISO8601({ strict: true })
        .optional()
        .withMessage(expectedTypeOf("ISO formatted date string")),
      idOf(query("deviceId")).optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("type").matches(EVENT_TYPE_REGEXP).optional(),
      booleanOf(query("latest")).optional(),
      booleanOf(query("only-active")).optional(),
      booleanOf(query("include-count"), true),
    ]),
    // Extract required resources
    fetchAuthorizedOptionalDeviceById(query("deviceId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // deviceId is optional, but if it is supplied we need to make sure that the user
      // is allowed to access it.
      if (request.query.deviceId && !response.locals.device) {
        return next(
          new ClientError(
            `Could not find a device with an id of '${request.query.deviceId} for user`,
            HttpStatusCode.Forbidden,
          ),
        );
      }
      next();
    },
    // Check permissions on resources
    // Extract device if any, and check that user has permissions to access it
    async (request: Request, response: Response) => {
      const query = request.query;
      const offset: number =
        (query.offset && (query.offset as unknown as number)) || 0;
      const includeCount = query["include-count"] as unknown as boolean;
      const result = await Event.query(
        response.locals.requestUser.id,
        query.startTime as string,
        query.endTime as string,
        Number(query.deviceId),
        offset,
        query.limit as unknown as number | undefined,
        query.latest as unknown as boolean,
        query.type as unknown as string,
        includeCount,
      );
      const payload: {
        limit?: number;
        offset: number;
        rows: Event[];
        count?: number;
      } = {
        offset,
        rows: includeCount
          ? (result as { rows: Event[]; count: number }).rows
          : (result as Event[]),
      };
      if (query.limit) {
        payload.limit = Number(query.limit);
      }
      if (includeCount) {
        payload.count = (result as { rows: Event[]; count: number }).count;
      }
      return successResponse(response, "Completed query.", payload);
    },
  );

  /**
   * @api {get} /api/v1/events/event-types Return distinct known event-types.
   * @apiName GetKnownEventTypes
   * @apiGroup Events
   * @apiDescription Get all known event types
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/event-types`,
    extractJwtAuthorizedUser,
    async (_request: Request, response: Response) => {
      const eventTypes = await sequelize.query(
        `select distinct type from "DetailSnapshots"`,
        { type: QueryTypes.SELECT },
      );
      return successResponse(response, "Got event types", {
        eventTypes: (eventTypes as { type: string }[]).map(({ type }) => type),
      });
    },
  );

  /**
   * @api {get} /api/v1/events/event-types/for-device/:deviceId Return distinct known event-types for a given device.
   * @apiName GetKnownRecentEventTypesForDevice
   * @apiGroup Events
   * @apiDescription Get known event types for a device in the last month
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/event-types/for-device/:deviceId`,
    extractJwtAuthorizedUser,
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (_request: Request, response: Response) => {
      const eventTypes = await sequelize.query(
        `
      select distinct 
        type 
        from "DetailSnapshots" ds 
          inner join "Events" e
        on ds.id = e."EventDetailId"
        where e."DeviceId" = ${response.locals.device.id}
        and e."dateTime" > now() - interval '1 month' 
      `,
        { type: QueryTypes.SELECT },
      );
      return successResponse(response, "Got event types", {
        eventTypes: (eventTypes as { type: string }[]).map(({ type }) => type),
      });
    },
  );

  /**
   * @api {get} /api/v1/events/:id Return an event given an event id.
   * @apiName GetEventById
   * @apiGroup Events
   * @apiDescription Get an event given an event id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchAuthorizedRequiredEventById(param("id")),
    async (_request: Request, response: Response) => {
      const event = response.locals.event;
      const details = {
        ...event.EventDetail.details,
      };
      delete details.fileKey;
      return successResponse(response, "Got event", {
        event: {
          id: event.id,
          details,
          type: event.EventDetail.type,
          dateTime: event.dateTime,
        },
      });
    },
  );
}
