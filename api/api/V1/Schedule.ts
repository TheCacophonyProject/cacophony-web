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
import { body, param, query } from "express-validator";
import modelsInit from "@models/index.js";
import { successResponse } from "./responseUtil.js";
import type { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredDeviceById,
  fetchUnauthorizedRequiredScheduleById,
  parseJSONField,
} from "@api/extract-middleware.js";
import { booleanOf, idOf } from "../validation-middleware.js";
import { jsonSchemaOf } from "@api/schema-validation.js";
import ScheduleConfigSchema from "@schemas/api/schedule/ScheduleConfig.schema.json" assert { type: "json" };
import type {
  ApiScheduleResponse,
  ScheduleConfig,
} from "@typedefs/api/schedule.js";
import type { Schedule } from "@models/Schedule.js";
import type { Device } from "@models/Device.js";
import { ClientError } from "@api/customErrors.js";
import { HttpStatusCode } from "@typedefs/api/consts.js";

const models = await modelsInit();
export const mapSchedule = (schedule: Schedule): ApiScheduleResponse => ({
  id: schedule.id,
  schedule: schedule.schedule as ScheduleConfig,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiScheduleConfig {
  schedule: ScheduleConfig;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiScheduleConfigs {
  schedules: ScheduleConfig[];
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
   * @apiInterface {apiBody::ApiScheduleConfig} schedule Schedule
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      body("schedule").custom(jsonSchemaOf(ScheduleConfigSchema)),
    ]),
    parseJSONField(body("schedule")),
    async function (request, response) {
      const schedule = models.Schedule.buildSafely({
        schedule: response.locals.schedule,
      });
      schedule.UserId = response.locals.requestUser.id;
      await schedule.save();
      return successResponse(response, "Created new schedule.", {
        id: schedule.id,
      });
    }
  );

  /**
   * @api {get} api/v1/schedules Get device audio bait schedule (for this device)
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
      const device = (await models.Device.getFromId(
        response.locals.requestDevice.id
      )) as Device;
      const schedule = await models.Schedule.findByPk(device.ScheduleId);
      if (schedule) {
        return successResponse(response, {
          schedule: schedule.schedule as ScheduleConfig,
        });
      } else {
        return next(
          new ClientError(
            `Could not find schedule for device ${device.id}`,
            HttpStatusCode.Forbidden
          )
        );
      }
    }
  );

  /**
   * @api {get} api/v1/schedules/for-user Get audio bait schedules (for this user)
   * @apiName GetSchedule
   * @apiGroup Schedules
   * @apiDescription This call is used by a user to retrieve all their audio bait
   * schedules.
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiInterface {apiSuccess::ApiScheduleConfigs} schedule Metadata of the schedule.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/for-user`,
    extractJwtAuthorizedUser,
    async (request: Request, response: Response) => {
      // TODO - Should we allow super-users to see all schedules?
      const schedules = await models.Schedule.findAll({
        where: {
          UserId: response.locals.requestUser.id,
        },
      });
      return successResponse(response, "Got schedules for user", {
        schedules: schedules.map(mapSchedule),
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
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request: Request, response: Response, next: NextFunction) => {
      await fetchUnauthorizedRequiredScheduleById(
        response.locals.device.ScheduleId
      )(request, response, next);
    },
    async (request: Request, response: Response) => {
      return successResponse(response, {
        schedule: response.locals.schedule.schedule as ApiScheduleConfig,
      });
    }
  );

  /**
   * @api {delete} api/v1/schedules/:scheduleId Delete audio bait schedule and remove from all devices
   * @apiName DeleteSchedule
   * @apiGroup Schedules
   * @apiDescription This call is used by a user to delete an audio-bait schedule.
   * Deleting the schedule will remove it from all devices it is assigned to.
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:scheduleId`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("scheduleId"))]),
    fetchUnauthorizedRequiredScheduleById(param("scheduleId")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (
        response.locals.schedule.UserId === response.locals.requestUser.id ||
        response.locals.requestUser.hasGlobalWrite()
      ) {
        await response.locals.schedule.destroy();
      } else {
        return next(
          new ClientError(
            `User #${response.locals.requestUser.id} doesn't have permission to delete schedule`,
            HttpStatusCode.Forbidden
          )
        );
      }
      return successResponse(response, "schedule deleted");
    }
  );
};
