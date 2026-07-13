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

import Sequelize, {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import { ModelStaticCommon } from "./index.js";
import { Device } from "./Device.js";
import type { DetailSnapshotId } from "./DetailSnapshot.js";
import { DetailSnapshot } from "./DetailSnapshot.js";
import type { DeviceId, EventId, UserId } from "@typedefs/api/common.js";
import { User } from "@models/User.js";
import { Group } from "@models/Group.js";
import { EventEnv } from "@typedefs/api/consts.js";

const Op = Sequelize.Op;

export class Event extends ModelStaticCommon<Event> {
  declare id: CreationOptional<EventId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // FIXME: This should be required, but the field is NULLable in the DB
  declare dateTime: CreationOptional<Date>;
  declare EventDetailId: ForeignKey<DetailSnapshotId>;
  declare EventDetail: NonAttribute<DetailSnapshot>;
  declare DeviceId: ForeignKey<DeviceId>;
  declare fileName?: NonAttribute<string>;
  declare Device?: NonAttribute<Device>;
  declare env: CreationOptional<EventEnv>;

  declare static associations: {
    Device: BelongsTo<Device>;
    EventDetail: BelongsTo<DetailSnapshot>;
  };

  /**
   * Return one or more events for a user matching the query
   * arguments given.
   */
  static async query(
    userId: UserId,
    startTime?: string,
    endTime?: string,
    deviceId?: DeviceId,
    offset?: number,
    limit?: number,
    latestFirst?: boolean,
    eventType?: string,
    includeCount?: boolean,
  ): Promise<Event[] | { rows: Event[]; count: number }> {
    const where: Sequelize.WhereOptions<Event> = {};
    offset = offset || 0;
    limit = limit || 100;

    if (startTime || endTime) {
      let dateTime = {};
      if (startTime) {
        dateTime = {
          [Op.gte]: startTime,
        };
      }
      if (endTime) {
        dateTime = {
          ...(dateTime || {}),
          [Op.lt]: endTime,
        };
      }
      where.dateTime = dateTime;
    }

    const eventWhere: Sequelize.WhereOptions = {};
    if (eventType) {
      eventWhere.type = eventType;
    }
    let order: Sequelize.Order = ["dateTime"];
    if (latestFirst) {
      order = [["dateTime", "DESC"]];
    }
    const user = await User.findByPk(userId);
    if (deviceId) {
      where.DeviceId = deviceId;
    } else if (!user.hasGlobalRead()) {
      const allDeviceIds = await user.getDeviceIds();
      where.DeviceId = { [Op.in]: allDeviceIds };
    }
    return await this[includeCount ? "findAndCountAll" : "findAll"]({
      where,
      order,
      include: [
        {
          model: DetailSnapshot,
          as: "EventDetail",
          attributes: ["type", "details"],
          where: eventWhere,
        },
        {
          required: !!deviceId,
          model: Device,
          attributes: ["deviceName"],
        },
      ],
      attributes: { exclude: ["updatedAt", "EventDetailId"] },
      limit,
      offset,
    });
  }

  /**
   * Return the latest event of each type grouped by device id
   */
  static async latestEventsOfTypes(eventTypes: string[]): Promise<Event[]> {
    // This is currently only called by the stopped-devices report, and only ever called as admin.
    return this.findAll({
      where: {},
      include: [
        {
          model: DetailSnapshot,
          as: "EventDetail",
          attributes: ["type", "details"],
          where: { type: { [Op.in]: eventTypes } },
        },
        {
          model: Device,
          attributes: ["id", "deviceName", "GroupId"],
          include: [
            {
              model: Group,
              attributes: ["groupName", "id"],
            },
          ],
        },
      ],
      attributes: [
        // the 1 is some kind of hack that makes this work in sequelize
        [
          Sequelize.literal(
            'DISTINCT ON("Event"."DeviceId", "EventDetail"."type") 1',
          ),
          "device_id__event_type",
        ],
        "id",
        "dateTime",
        "DeviceId",
      ],
      order: [
        ["EventDetail", "type", "DESC"],
        ["DeviceId", "DESC"],
        ["dateTime", "DESC"],
      ],
    });
  }

  static addAssociations() {
    this.belongsTo(DetailSnapshot, {
      as: "EventDetail",
      foreignKey: "EventDetailId",
    });
    this.belongsTo(Device);
  }
}
export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

    dateTime: DataTypes.DATE,
    env: {
      type: Sequelize.ENUM("tc2-dev", "tc2-test", "tc2-prod", "unknown"),
      defaultValue: "unknown",
    },
  };
  Event.init(attributes, {
    tableName: "Events",
    sequelize: sequelizeInstance,
    name: {
      singular: "Event",
      plural: "Events",
    },
  });
  return Event;
};
