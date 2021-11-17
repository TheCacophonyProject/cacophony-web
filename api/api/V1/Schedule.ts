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

import {validateFields} from "../middleware";
import { body, param } from "express-validator";
import models from "@models";
import responseUtil from "./responseUtil";
import {Application, NextFunction, Response, Request} from "express";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredDeviceById, fetchAuthorizedRequiredGroupById,
  fetchUnauthorizedRequiredScheduleById,
  parseJSONField
} from "@api/extract-middleware";
import { idOf } from "../validation-middleware";
import {jsonSchemaOf} from "@api/schema-validation";
import ScheduleConfigSchema from "@schemas/api/schedule/ScheduleConfigSchema.schema.json";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ScheduleConfig } from "@typedefs/api/schedule";
import {Schedule} from "@models/Schedule";

export const mapSchedule = (schedule: Schedule): ScheduleConfig => {
  return schedule.schedule as ScheduleConfig;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiScheduleConfig {
  schedule: ScheduleConfig;
}

export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/schedules`;

  /**
   * @api {post} /api/v1/schedules Adds a new schedule
   * @apiName PostSchedule
   * @apiGroup Schedules
   * @apiDescription This call is used to upload a new audio bait
   * schedule which controls when sound bait files are played. The
   * body of the request should contain the schedule in JSON format.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {Int[]} devices List of device Ids that schedule should apply to
   * @apiInterface {apiBody::ApiScheduleConfig} schedule Schedule
   *
   * @apiUse V1ResponseSuccess
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(body("groupId")),
      body("schedule").custom(jsonSchemaOf(ScheduleConfigSchema))
    ]),
    parseJSONField(body("schedule")),
    fetchAuthorizedRequiredGroupById(body("groupId")),
    async function (request, response) {
      // Enforce that all of these devices are part of the same group.
      // If a device gets moved to another group - then what?
      const schedule = models.Schedule.buildSafely({ schedule: response.locals.schedule });
      schedule.GroupId = response.locals.group.id;
      await schedule.save();
      return responseUtil.send(response, {
        statusCode: 200,
        id: schedule.id,
        messages: ["Created new schedule."],
      });
    }
  );

  /**
   * @api {get} api/v1/schedules/ Get device audio bait schedule (for this device)
   * @apiName GetSchedule
   * @apiGroup Schedules
   * @apiDescription This call is used by a device to retrieve its audio bait
   * schedule.
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiInterface {apiSuccess::ApiScheduleConfig} schedule Metadata of the schedule.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    extractJwtAuthorisedDevice,
      async (request: Request, response: Response, next: NextFunction) => {
        // FIXME - Does this actually work?
        await fetchUnauthorizedRequiredScheduleById(response.locals.requestDevice.ScheduleId)(request, response, next);
        next();
      },
      async (request: Request, response: Response) => {
        return responseUtil.send(response, {
          statusCode: 200,
          messages: [],
          schedule: mapSchedule(response.locals.schedule),
        });
      }
  );

  /**
   * @api {get} api/v1/schedules/:deviceId Get audio bait schedule for a device
   * @apiName GetScheduleForDevice
   * @apiGroup Schedules
   * @apiDescription This call is used by a user to retrieve the audio bait
   * schedule for one of their devices.
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiSuccess::ApiScheduleConfig} schedule Metadata of the schedule.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // FIXME - Does this actually work?
      await fetchUnauthorizedRequiredScheduleById(response.locals.device.ScheduleId)(request, response, next);
      next();
    },
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        schedule: mapSchedule(response.locals.schedule),
      });
    });
};
