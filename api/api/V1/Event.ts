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

import { expectedTypeOf, validateFields } from "../middleware";
import auth from "../auth";
import models from "../../models";
import { QueryOptions } from "../../models/Event";
import responseUtil from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application, Response, Request, NextFunction } from "express";
import {errors, powerEventsPerDevice} from "./eventUtil";
import {
  extractDevice,
  extractOptionalDevice,
  extractOptionalEventDetailSnapshot,
  extractValidJWT
} from "../extract-middleware";
import { jsonSchemaOf } from "../schema-validation";
import EventDatesSchema from "../../../types/jsonSchemas/api/event/EventDates.schema.json";
import EventDescriptionSchema from "../../../types/jsonSchemas/api/event/EventDescription.schema.json";
import { EventDescription } from "@typedefs/api/event";
import logger from "../../logging";
import { booleanOf, eitherOf, idOf, integerOf } from "../validation-middleware";

const EVENT_TYPE_REGEXP = /^[A-Z0-9/-]+$/i;

const uploadEvent = async (request: Request, response: Response, next: NextFunction) => {
  let detailsId = request.body.eventDetailId;
  if (!detailsId) {
    const description: EventDescription = request.body.description;
    const detail = await models.DetailSnapshot.getOrCreateMatching(
      description.type,
      description.details
    );
    detailsId = detail.id;
  }
  const device = response.locals.device || response.locals.requestDevice;
  const eventList = request.body.dateTimes.map(dateTime => ({
    DeviceId: device.id,
    EventDetailId: detailsId,
    dateTime,
  }));
  const count = eventList.length;
  try {
    await models.Event.bulkCreate(eventList);
  } catch (exception) {
    return responseUtil.send(response, {
      statusCode: 500,
      messages: ["Failed to record events.", exception.message],
    });
  }
  return responseUtil.send(response, {
    statusCode: 200,
    messages: ["Added events."],
    eventsAdded: count,
    eventDetailId: detailsId,
  });
};

// TODO(jon): Consider whether extracting this is worth it compared with just
//  duplicating and having things be explicit in each api endpoint?
const commonEventFields = [
  eitherOf(
      idOf(body("eventDetailId")),
      body("description")
        .exists()
        .withMessage(expectedTypeOf("EventDescription"))
        .bail()
        .custom(jsonSchemaOf(EventDescriptionSchema))
        .bail()
        .custom((description: EventDescription) => (
          description.type.match(EVENT_TYPE_REGEXP) !== null
        ))
        .withMessage("description type contains invalid characters")
  ),
  body("dateTimes")
    .exists()
    .bail()
    .withMessage(expectedTypeOf("Array of ISO formatted date time strings"))
    .isArray({min: 1})
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
   * @apiUse EventParams
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
    extractValidJWT,
    validateFields(commonEventFields),
    // Extract required resources
    extractOptionalEventDetailSnapshot("body", "eventDetailId"),
    auth.authenticateAndExtractDevice,
    // Finally, upload event(s)
    uploadEvent
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
   * If you don't have access to the deviceId, the devicename can be used instead in it's place -
   * however note that requests using devicename will be rejected if multiple devices exist with
   * the same devicename. The use of devicename is `DEPRECATED` and may not be supported in future.
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse EventParams
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
    extractValidJWT,
    // Validate fields
    validateFields([
      idOf(param("deviceId")),
        ...commonEventFields
      ]
    ),
    // Extract required resources
    extractOptionalEventDetailSnapshot("body", "eventDetailId"),
    auth.authenticateAndExtractUser,
    extractDevice("params", "deviceId"),
    // Validate resource permissions
    auth.userCanAccessExtractedDevices,
    // Finally, upload event(s)
    uploadEvent
  );

  /**
   * @api {get} /api/v1/events Query recorded events
   * @apiName QueryEvents
   * @apiGroup Events
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Datetime} [startTime] Return only events on or after this time
   * @apiParam {Datetime} [endTime] Return only events from before this time
   * @apiParam {Integer} [deviceId] Return only events for this device id
   * @apiParam {Integer} [limit] Limit returned events to this number (default is 100)
   * @apiParam {Integer} [offset] Offset returned events by this amount (default is 0)
   * @apiParam {String} [type] Alphaonly string describing the type of event wanted
   * @apiParam {Boolean} [latest] Set to true to see the most recent events recorded listed first
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
    extractValidJWT,
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
    ]),
    // Extract required resources
    auth.authenticateAndExtractUser,
    extractOptionalDevice("query", "deviceId"),
    // Check permissions on resources
    auth.userCanAccessOptionalExtractedDevices,
    // Extract device if any, and check that user has permissions to access it
    async (request: Request, response: Response) => {
      const query = request.query;
      const offset: number = (query.offset && query.offset as unknown as number) || 0;
      let options: QueryOptions;
      if (query.type) {
        options = { eventType: query.type } as QueryOptions;
      }

      const result = await models.Event.query(
        response.locals.requestUser,
        query.startTime as string,
        query.endTime as string,
        query.deviceId as unknown as number,
        offset,
        query.limit as unknown as number,
        query.latest as unknown as boolean,
        options
      );

      // TODO(jon): Flatten out the response structure and formalise and validate it.

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        limit: query.limit,
        offset,
        count: result.count,
        rows: result.rows,
      });
    }
  );

  /**
   * @api {get} /api/v1/events/errors Query recorded errors
   * @apiName QueryErrors
   * @apiGroup Events
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Datetime} [startTime] Return only errors on or after this time
   * @apiParam {Datetime} [endTime] Return only errors from before this time
   * @apiParam {Integer} [deviceId] Return only errors for this device id
   * @apiParam {Integer} [limit] Limit returned errors to this number (default is 100)
   * @apiParam {Integer} [offset] Offset returned errors by this amount (default is 0)
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
    extractValidJWT,
    // Validate request structure
    validateFields([
      query("startTime")
        .isISO8601({ strict: true })
        .optional(),
      query("endTime")
        .isISO8601({ strict: true })
        .optional(),
      query("deviceId").isInt().optional().toInt(),
      query("offset").isInt().optional().toInt(),
      query("limit").isInt().optional().toInt(),
    ]),
    // Extract required resources
    auth.authenticateAndExtractUser,
    extractOptionalDevice("query", "deviceId"),
    // Check permissions on resources
    auth.userCanAccessOptionalExtractedDevices,
    async (request: Request, response: Response) => {
      const query = request.query;

      // FIXME(jon): This smells bad, sometimes requires user, and sometimes doesn't
      const result = await errors({ query: {...request.query}, res: { locals: {...response.locals } } });
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        limit: query.limit,
        offset: query.offset,
        rows: result,
      });
    }
  );

  /**
   * @api {get} /api/v1/events/powerEvents Query power events for devices
   * @apiName QueryPower
   * @apiGroup Events
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Integer} [deviceId] Return only errors for this deviceId
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
   *     "devicename": "test-device",
   *     "GroupId": 246,
   *     "Group":  {
   *       "groupname": "test-group",
   *       "id": 246
   *     }
   *    }
   *  }
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/powerEvents`,
    extractValidJWT,
    validateFields([
      query("deviceId")
        .isInt()
        .optional()
        .toInt()
        .withMessage(expectedTypeOf("integer")),
    ]),
    // Extract required resources
    auth.authenticateAndExtractUser,
    extractOptionalDevice("query", "deviceId"),
    // Check permissions on resources
    auth.userCanAccessOptionalExtractedDevices,
    async (request: Request, response: Response) => {
      logger.info("Get power events for %s at time %s", response.locals.requestUser, new Date());
      const result = await powerEventsPerDevice({ query: { ...request.query }, res: { locals: { ...response.locals }} });
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        events: result,
      });
    }
  );
}
