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

import { ModelStaticCommon } from "./index.js";
import Sequelize, { CreationOptional, DataTypes, ForeignKey } from "sequelize";
import type { ScheduleId, UserId } from "@typedefs/api/common.js";
import type { ScheduleConfig } from "@typedefs/api/schedule.js";
import { User } from "@models/User.js";
import { Device } from "@models/Device.js";

export class Schedule extends ModelStaticCommon<Schedule> {
  declare id: CreationOptional<ScheduleId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare schedule: CreationOptional<ScheduleConfig>;
  declare UserId: ForeignKey<UserId>;

  static addAssociations() {
    this.belongsTo(User);
    this.hasMany(Device);
  }
  static buildSafely(fields: { schedule: ScheduleConfig }) {
    return Schedule.build({ schedule: fields.schedule });
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
    schedule: DataTypes.JSONB,
  };
  Schedule.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Schedules",
    name: {
      singular: "Schedule",
      plural: "Schedules",
    },
  });
  return Schedule;
};
