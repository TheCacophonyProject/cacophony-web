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

import middleware from "../middleware";
import auth from "../auth";
import { body, param } from "express-validator/check";
import models from "../../models";
import responseUtil from "./responseUtil";
import { Application, Response } from "express";

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
   * @apiParam {Int[]} devices List of device Ids that schedule should apply to
   * @apiParam {JSON} schedule Schedule
   *
   * @apiUse V1ResponseSuccess
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl,
    [
      auth.authenticateUser,
      middleware.parseArray("devices", body),
      middleware.parseJSON("schedule", body),
      auth.userCanAccessDevices,
    ],
    middleware.requestWrapper(async function (request, response) {
      const deviceIds = request.body.devices;

      const instance = models.Schedule.buildSafely(request.body);
      instance.UserId = request.user.id;
      // TODO make the device and schedule changes apply in a single transaction
      await instance.save();

      await models.Device.update(
        { ScheduleId: instance.id },
        { where: { id: deviceIds } }
      );

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Added new schedule for the calling device(s)."],
      });
    })
  );

  /**
   * @api {get} api/v1/schedules/ Get device audio bait schedule (for this device)
   * @apiName GetSchedule
   * @apiGroup Schedules
   * @apiDescription This call is used by a device to retrieve its audio bait
   * schedule.
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiSuccess {JSON} schedule Metadata of the schedule.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    [auth.authenticateDevice],
    middleware.requestWrapper(async (request, response) => {
      return getSchedule(request.device, response);
    })
  );

  /**
   * @api {get} api/v1/schedules/:deviceId Get audio bait schedule (for a user's device)
   * @apiName GetScheduleForDevice
   * @apiGroup Schedules
   * @apiDescription This call is used by a user to retrieve the audio bait
   * schedule for one of their devices.
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiSuccess {JSON} userData Metadata of the scedule.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:deviceId`,
    [
      auth.authenticateUser,
      middleware.getDeviceById(param),
      auth.userCanAccessDevices,
    ],
    middleware.requestWrapper(async (request, response) =>
      getSchedule(request.device, response, request.user)
    )
  );
};

async function getSchedule(device: any, response: Response, user = null) {
  let schedule = { schedule: {} };

  if (device.ScheduleId) {
    schedule = await models.Schedule.findByPk(device.ScheduleId);
    if (!schedule) {
      return responseUtil.send(response, {
        statusCode: 400,
        devicename: device.devicename,
        messages: ["Cannot find schedule."],
      });
    }
  }

  const resData: any = {
    statusCode: 200,
    messages: [],
    schedule: schedule.schedule,
  };
  // get all the users devices that are also associated with this same schedule
  if (user && device.ScheduleId) {
    resData.devices = await models.Device.onlyUsersDevicesMatching(user, {
      ScheduleId: device.ScheduleId,
    });
  } else if (user) {
    resData.devices = await models.Device.onlyUsersDevicesMatching(user, {
      id: device.id,
    });
  }
  return responseUtil.send(response, resData);
}
