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

import Sequelize from "sequelize";
import type { ModelCommon, ModelStaticCommon } from "./index.js";
import type { Device } from "./Device.js";
import type { DetailSnapShot } from "./DetailSnapshot.js";
import type { DeviceId, UserId } from "@typedefs/api/common.js";

const Op = Sequelize.Op;

export interface Event extends Sequelize.Model, ModelCommon<Event> {
  id: number;
  dateTime: Date;
  EventDetailId: number;
  EventDetail: DetailSnapShot;
  DeviceId: DeviceId;
  dataValues: any;
  Device: Device | null;
}

export interface QueryOptions {
  eventType?: string | string[];
  admin?: boolean;
  useCreatedDate?: boolean;
}

export interface EventStatic extends ModelStaticCommon<Event> {
  query: (
    userId?: UserId,
    startTime?: string,
    endTime?: string,
    deviceId?: DeviceId,
    offset?: number,
    limit?: number,
    latest?: boolean,
    options?: QueryOptions,
    includeCount?: boolean
  ) => Promise<{ rows: Event[]; count?: number }>;
  latestEvents: (
    userId?: UserId,
    deviceId?: DeviceId,
    options?: QueryOptions
  ) => Promise<Event[]>;
}

export default function (sequelize, DataTypes) {
  const name = "Event";

  const attributes = {
    dateTime: DataTypes.DATE,
  };

  const Event = sequelize.define(name, attributes) as unknown as EventStatic;

  //---------------
  // CLASS METHODS
  //---------------
  const models = sequelize.models;

  Event.addAssociations = function (models) {
    models.Event.belongsTo(models.DetailSnapshot, {
      as: "EventDetail",
      foreignKey: "EventDetailId",
    });
    models.Event.belongsTo(models.Device);
  };

  /**
   * Return one or more events for a user matching the query
   * arguments given.
   */
  Event.query = async function (
    userId,
    startTime,
    endTime,
    deviceId,
    offset,
    limit,
    latestFirst,
    options,
    includeCount
  ) {
    const where: any = {};
    offset = offset || 0;
    limit = limit || 100;

    if (startTime || endTime) {
      let dateTime;
      if (options && options.useCreatedDate) {
        dateTime = where.createdAt = {};
      } else {
        dateTime = where.dateTime = {};
      }
      if (startTime) {
        dateTime[Op.gte] = startTime;
      }
      if (endTime) {
        dateTime[Op.lt] = endTime;
      }
    }

    if (deviceId) {
      where.DeviceId = deviceId;
    }
    const eventWhere: any = {};
    if (options && options.eventType) {
      if (Array.isArray(options.eventType)) {
        eventWhere.type = {};
        eventWhere.type[Op.in] = options.eventType;
      } else {
        eventWhere.type = options.eventType;
      }
    }

    let order: (string | string[])[] = ["dateTime"];
    if (latestFirst) {
      order = [["dateTime", "DESC"]];
    }
    let user;
    if (userId) {
      // NOTE: This function is sometimes called by scripts without a user
      user = await models.User.findByPk(userId);
    }
    return this.findAndCountAll({
      where: {
        [Op.and]: [
          where, // User query
          // FIXME: Move permissions stuff to middleware
          options && options.admin && !!deviceId
            ? ""
            : await user.getWhereDeviceVisible(), // can only see devices they should
        ],
      },
      order,
      include: [
        {
          model: models.DetailSnapshot,
          as: "EventDetail",
          attributes: ["type", "details"],
          where: eventWhere,
        },
        {
          required: !!deviceId,
          model: models.Device,
          attributes: ["deviceName"],
        },
      ],
      attributes: { exclude: ["updatedAt", "EventDetailId"] },
      limit,
      offset,
    });
  };

  /**
   * Return the latest event of each type grouped by device id
   */
  Event.latestEvents = async function (userId, deviceId, options) {
    const where: any = {};

    if (deviceId) {
      where.DeviceId = deviceId;
    }
    const eventWhere: any = {};
    if (options && options.eventType) {
      if (Array.isArray(options.eventType)) {
        eventWhere.type = {};
        eventWhere.type[Op.in] = options.eventType;
      } else {
        eventWhere.type = options.eventType;
      }
    }

    const order = [
      ["EventDetail", "type", "DESC"],
      ["DeviceId", "DESC"],
      ["dateTime", "DESC"],
    ];

    let user;
    if (userId) {
      // NOTE - This function is called by scripts without supplying a user.
      user = await models.User.findByPk(userId);
    }
    return this.findAll({
      where: {
        [Op.and]: [
          where, // User query
          // FIXME: Move permissions stuff to middleware (though this function is invoked via scripts also, so maybe not?)
          // FIXME: Weird behaviour that this is required if a deviceId is supplied for tests to pass...
          options && options.admin ? "" : await user.getWhereDeviceVisible(), // can only see devices they should
        ],
      },
      order,
      include: [
        {
          model: models.DetailSnapshot,
          as: "EventDetail",
          attributes: ["type", "details"],
          where: eventWhere,
        },
        {
          model: models.Device,
          attributes: ["id", "deviceName", "GroupId"],
          include: [
            {
              model: models.Group,
              attributes: ["groupName", "id"],
            },
          ],
        },
      ],
      attributes: [
        Sequelize.literal(
          'DISTINCT ON("Event"."DeviceId","EventDetail"."type") 1'
        ), // the 1 is some kind of hack that makes this work in sequelize
        "id",
        "dateTime",
        "DeviceId",
      ],
    });
  };
  return Event;
}
