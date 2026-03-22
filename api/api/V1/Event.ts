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

import {
  expectedTypeOf,
  validateFields,
  requestWrapper,
} from "../middleware.js";
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
import type { EventDescription } from "@typedefs/api/event.js";
import logger from "@log";
import {
  anyOf,
  booleanOf,
  deprecatedField,
  idOf,
  integerOf,
} from "../validation-middleware.js";
import { ClientError, UnprocessableError } from "@api/customErrors.js";
import type { IsoFormattedDateString } from "@typedefs/api/common.js";
import { maybeUpdateDeviceHistory } from "@api/V1/recordingUtil.js";
import { HttpStatusCode } from "@typedefs/api/consts.js";
import { isLatLon } from "@models/util/validation.js";
import util from "@api/V1/util.js";
import { streamS3Object } from "@api/V1/signedUrl.js";
import Sequelize, { QueryTypes } from "sequelize";
import { Device } from "@models/Device.js";
import { Event } from "@models/Event.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";

const sequelize = await initSequelize();
const EVENT_TYPE_REGEXP = /^[A-Z0-9/-]+$/i;

const uploadEvent = async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  let device = response.locals.device || response.locals.requestDevice;
  if (response.locals.requestDevice) {
    // The device is connecting directly, so update the last connected time.
    if (!device.deviceName) {
      // If we just have a device JWT id, get the actual device at this point.
      device = await Device.findByPk(device.id);
    }
    await device.update({ lastConnectionTime: new Date() });
  }
  let detailsId = response.locals.detailsnapshot?.id;
  let env = "unknown";
  if (!detailsId) {
    const description: EventDescription = request.body.description;

    let details: Sequelize.WhereOptions | object = description.details || {};
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

    env = details["env"] || "unknown";
    if (["tc2-dev", "tc2-test", "tc2-prod", "unknown"].includes(env)) {
      env = "unknown";
    }
    delete details["env"];
    const detail = await DetailSnapshot.getOrCreateMatching(
      description.type,
      details,
    );
    detailsId = detail.id;

    // Maybe update the device history entry on config change if location has updated.
    if (description.type === "config") {
      if (
        details["location"] &&
        details["location"].latitude !== undefined &&
        details["location"].longitude !== undefined
      ) {
        const lat = details["location"].latitude;
        const lng = details["location"].longitude;
        // Pre-validate to avoid server-side crashes on invalid inputs
        if (!isLatLon({ lat, lng }, false)) {
          return next(
            new UnprocessableError(
              `Invalid location '{"lat":${lat},"lng":${lng}}'`,
            ),
          );
        }
        try {
          const result = await maybeUpdateDeviceHistory(
            device,
            { lat, lng },
            new Date(details["location"].updated),
            "config",
          );
          if (typeof result === "string") {
            return next(
              new ClientError(`Failed to update device history: ${result}`),
            );
          }
        } catch (e) {
          const message = e?.message || "unknown error";
          if (
            e?.name === "SequelizeValidationError" ||
            message.includes("Location is not valid")
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
    }
  }
  const now = new Date();
  const eventList = request.body.dateTimes
    .map((dateTime: IsoFormattedDateString) => ({
      DeviceId: device.id,
      EventDetailId: detailsId,
      dateTime: new Date(dateTime),
      env,
    }))
    .filter((event: { dateTime: Date }) => {
      if (event.dateTime > now) {
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
  } catch (exception) {
    return next(
      new ClientError(`Failed to record events. ${exception.message}`),
    );
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
  anyOf(
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
    async (request: Request, response: Response, next: NextFunction) => {
      const device = response.locals.requestUser;
      if (
        device &&
        device.id &&
        [1931, 1718, 1176, 2114, 1679, 1717, 1567, 1176, 1792].includes(
          device.id,
        )
      ) {
        if (!request.body.eventDetailId && !request.body.description) {
          logger.warning(
            `Event creation request missing eventDetailId and description for device ${device.id}, body contains ${Object.keys(request.body)}`,
          );
        }
      }
      next();
    },
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
    requestWrapper(uploadEvent),
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
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    requestWrapper(uploadEvent),
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
        query.limit as unknown as number,
        query.latest as unknown as boolean,
        query.type as unknown as string,
        includeCount,
      );
      const payload = {
        limit: query.limit,
        offset,
        rows: includeCount
          ? (result as { rows: Event[]; count: number }).rows
          : result,
      };
      if (includeCount) {
        payload["count"] = (result as { rows: Event[]; count: number }).count;
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
