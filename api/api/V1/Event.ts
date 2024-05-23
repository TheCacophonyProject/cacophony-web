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
import modelsInit from "@models/index.js";
import type { Event, QueryOptions } from "@models/Event.js";
import { successResponse } from "./responseUtil.js";
import { body, param, query } from "express-validator";
import type { Application, NextFunction, Request, Response } from "express";
import { errors, powerEventsPerDevice } from "./eventUtil.js";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAuthorizedOptionalDeviceById,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredEventById,
  fetchUnAuthorizedOptionalEventDetailSnapshotById,
} from "../extract-middleware.js";
import { jsonSchemaOf } from "../schema-validation.js";
import EventDatesSchema from "@schemas/api/event/EventDates.schema.json" assert { type: "json" };
import EventDescriptionSchema from "@schemas/api/event/EventDescription.schema.json" assert { type: "json" };
import type { EventDescription } from "@typedefs/api/event.js";
import logger from "@log";
import {
  anyOf,
  booleanOf,
  deprecatedField,
  idOf,
  integerOf,
} from "../validation-middleware.js";
import { ClientError } from "../customErrors.js";
import type { IsoFormattedDateString } from "@typedefs/api/common.js";
import { maybeUpdateDeviceHistory } from "@api/V1/recordingUtil.js";
import { HttpStatusCode } from "@typedefs/api/consts.js";
import util from "@api/V1/util.js";
import { streamS3Object } from "@api/V1/signedUrl.js";

const models = await modelsInit();
const EVENT_TYPE_REGEXP = /^[A-Z0-9/-]+$/i;

const uploadEvent = async (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  let device = response.locals.device || response.locals.requestDevice;
  if (response.locals.requestDevice) {
    // The device is connecting directly, so update the last connected time.
    if (!device.deviceName) {
      // If we just have a device JWT id, get the actual device at this point.
      device = await models.Device.findByPk(device.id);
    }
    await device.update({ lastConnectionTime: new Date() });
  }
  let detailsId = response.locals.detailsnapshot?.id;
  if (!detailsId) {
    const description: EventDescription = request.body.description;
    const detail = await models.DetailSnapshot.getOrCreateMatching(
      description.type,
      description.details
    );
    detailsId = detail.id;

    // Maybe update the device history entry on config change if location has updated.
    if (description.type === "config") {
      try {
        const details = JSON.parse(description.details);
        if (details.location !== null) {
          await maybeUpdateDeviceHistory(
            models,
            device,
            { lat: details.location.latitude, lng: details.location.longitude },
            new Date(details.location.updated),
            "config"
          );
        }
      } catch (e) {
        //...
      }
    }
  }

  const eventList = request.body.dateTimes.map((dateTime) => ({
    DeviceId: device.id,
    EventDetailId: detailsId,
    dateTime,
  }));
  const count = eventList.length;
  try {
    await models.Event.bulkCreate(eventList);
  } catch (exception) {
    return next(
      new ClientError(`Failed to record events. ${exception.message}`)
    );
  }
  return successResponse(response, "Added events.", {
    eventsAdded: count,
    eventDetailId: detailsId,
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiEventsRequestBody {
  Timestamp?: IsoFormattedDateString; // Deprecated, use 'dateTimes' instead
  eventDetailId?: number; // ID of existing event details entry if known. Either eventDetailId or description are required.
  description?: EventDescription; // Description of the event. Either eventDetailId or description are required.
  dateTimes: IsoFormattedDateString[]; // Array of event times in ISO standard format, eg ["2017-11-13T00:47:51.160Z"]
}

// TODO(jon): Consider whether extracting this is worth it compared with just
//  duplicating and having things be explicit in each api endpoint?
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
          description.type.match(EVENT_TYPE_REGEXP) !== null
      )
      .withMessage("description type contains invalid characters")
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
    validateFields(commonEventFields),
    // Extract required resources
    fetchUnAuthorizedOptionalEventDetailSnapshotById(body("eventDetailId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // eventDetailId is optional, but if it is supplied we need to make sure it exists
      if (request.body.eventDetailId && !response.locals.detailsnapshot) {
        return next(
          new ClientError(
            `Could not find a event snapshot with an id of '${request.body.eventDetailId}`,
            HttpStatusCode.Forbidden
          )
        );
      }
      next();
    },
    // Finally, upload event(s)
    uploadEvent
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
        uploader,
        uploadingDevice,
        uploadingUser,
        data,
        keys,
        _uploadedFileDatas,
        _locals
      ): Promise<Event> => {
        console.assert(
          keys.length === 1,
          "Only expected 1 file attachment for this end-point"
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
        delete description.details.type;
        delete description.details.filename;
        delete description.details.dateTimes;
        const detail = await models.DetailSnapshot.getOrCreateMatching(
          description.type,
          description.details
        );
        const dateTime =
          (data.dateTimes && data.dateTimes.length && data.dateTimes[0]) ||
          new Date().toISOString();
        return await models.Event.create({
          DeviceId: uploadingDevice.id,
          EventDetailId: detail.id,
          dateTime,
        });
      }
    )
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
            HttpStatusCode.Forbidden
          )
        );
      }
      await streamS3Object(
        request,
        response,
        event.EventDetail.details.fileKey,
        `event-thumbnail-${event.id}.png`,
        "image/png"
      );
    }
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
            HttpStatusCode.Forbidden
          )
        );
      }
      next();
    },
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    uploadEvent
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
            HttpStatusCode.Forbidden
          )
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
      let options: QueryOptions;
      if (query.type) {
        options = { eventType: query.type } as QueryOptions;
      }
      const includeCount = query["include-count"] as unknown as boolean;
      const result = await models.Event.query(
        response.locals.requestUser.id,
        query.startTime as string,
        query.endTime as string,
        Number(query.deviceId),
        offset,
        query.limit as unknown as number,
        query.latest as unknown as boolean,
        options,
        includeCount
      );
      const payload = {
        limit: query.limit,
        offset,
        rows: includeCount ? result.rows : result,
      };
      if (includeCount) {
        (payload as any).count = result.count;
      }
      return successResponse(response, "Completed query.", payload);
    }
  );

  // DEPRECATED: As far as I can tell, no client ever actually calls this API endpoint, is it only used by CI?
  /**
   * @api {get} /api/v1/events/errors Query recorded errors
   * @apiName QueryErrors
   * @apiGroup Events
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {Datetime} [startTime] Return only errors on or after this time
   * @apiQuery {Datetime} [endTime] Return only errors from before this time
   * @apiQuery {Integer} [deviceId] Return only errors for this device id
   * @apiQuery {Integer} [limit=100] Limit returned errors to this number (default is 100)
   * @apiQuery {Integer} [offset=0] Offset returned errors by this amount (default is 0)
   * @apiQuery {Boolean} [only-active=true] Only return errors for active devices
   *
   * @apiSuccess {json} rows Map of Service Name to Service errors
   * @apiUse V1ResponseSuccess
   * @apiSuccessExample {json} rows
   * {
   *   "<service-name>": {
   *     "name": "<service-name>",
   *     "devices": ["device1","device2"],
   *     "errors": ApiEventError[]
   *   },
   *   "<service-name2>": {
   *     "name": "<service-name2>",
   *     "devices": ["device3","device4"],
   *     "errors": ApiEventError[]
   *   }
   * }
   * @apiSuccessExample {json} ApiEventError
   * {
   *   devices: ["device1", "device2"],
   *   timestamps: ["2020-08-10T13:10:38.000Z", "2020-08-11T13:10:38.000Z"],
   *   similar: ApiEventErrorSimilar[],
   *   patterns: ApiEventErrorPattern[]
   * }
   * @apiSuccessExample {json} ApiEventErrorSimilar
   * {
   *   device: "device1",
   *   timestamp: "2020-08-10T13:10:38.000Z",
   *   lines: ["error line 1", "error line 2", "error line 3"]
   * }
   * @apiSuccessExample {json} ApiEventErrorPattern
   * {
   *   score: 100,
   *   index: 0,
   *   patterns: ["matched error line"]
   * }
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/errors`,
    // Authenticate the session
    extractJwtAuthorizedUser,
    // Validate request structure
    validateFields([
      query("startTime").isISO8601({ strict: true }).optional(),
      query("endTime").isISO8601({ strict: true }).optional(),
      idOf(query("deviceId")).optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("only-active").optional().isBoolean().toBoolean(),
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
            HttpStatusCode.Forbidden
          )
        );
      }
      next();
    },
    async (request: Request, response: Response) => {
      const query = request.query;

      // FIXME(jon): This smells bad, sometimes requires user, and sometimes doesn't
      const result = await errors({
        query: { ...request.query },
        res: { locals: { ...response.locals } },
      });
      return successResponse(response, "Completed query.", {
        limit: query.limit,
        offset: query.offset,
        rows: result,
      });
    }
  );

  // DEPRECATED: As far as I can tell, no client ever calls this API endpoint - is it only used by CI?
  /**
   * @api {get} /api/v1/events/powerEvents Query power events for devices
   * @apiName QueryPower
   * @apiGroup Events
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {Integer} [deviceId] Return only errors for this deviceId
   *
   * @apiSuccess {JSON} events Array of `ApiPowerEvent` containing details of power events matching the criteria given.
   * @apiSuccessExample ApiPowerEvent:
   * {
   *   "hasStopped": true,
   *   "lastStarted": "2021-07-21T02:00:02.929Z",
   *   "lastReported": "2021-07-21T02:00:02.929Z",
   *   "lastStopped": "2021-07-17T20:41:55.000Z",
   *   "hasAlerted": true,
   *   "Device": {
   *     "id": 1576,
   *     "deviceName": "test-device",
   *     "GroupId": 246,
   *     "Group":  {
   *       "groupName": "test-group",
   *       "id": 246
   *     }
   *    }
   *  }
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/powerEvents`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(query("deviceId")).optional(),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    // Extract required resources
    fetchAuthorizedOptionalDeviceById(query("deviceId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // FIXME - can this be incorporated into our fetch logic?
      // deviceId is optional, but if it is supplied we need to make sure that the user
      // is allowed to access it.
      if (request.query.deviceId && !response.locals.device) {
        return next(
          new ClientError(
            `Could not find a device with an id of '${request.query.deviceId} for user`,
            HttpStatusCode.Forbidden
          )
        );
      }
      next();
    },
    async (request: Request, response: Response) => {
      logger.info(
        "Get power events for %s at time %s",
        response.locals.requestUser,
        new Date()
      );
      const events = await powerEventsPerDevice({
        query: { ...request.query },
        res: { locals: { ...response.locals } },
      });
      return successResponse(response, "Completed query.", {
        events,
      });
    }
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
    async (request: Request, response: Response) => {
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
    }
  );
}
