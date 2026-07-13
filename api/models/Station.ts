/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2020  The Cacophony Project

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

// Station data as supplied to API on creation.
import Sequelize, {
  CreationOptional,
  DataTypes,
  ForeignKey,
  NonAttribute,
  Op,
} from "sequelize";
import { locationField } from "@models/util/util.js";
import { ModelStaticCommon } from "@models/index.js";
import { LatLng, StationId, GroupId } from "@typedefs/api/common.js";
import { ApiStationSettings } from "@typedefs/api/station.js";
import { User } from "@models/User.js";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";

export interface CreateStationData {
  name: string;
  lat: number;
  lng: number;
}

export enum TimeInterval {
  Years = "years",
  Months = "months",
  Weeks = "weeks",
  Days = "days",
  Hours = "hours",
}

export class Station extends ModelStaticCommon<Station> {
  declare id: CreationOptional<StationId>;
  declare name: string;
  declare location: LatLng;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare retiredAt: CreationOptional<Date>;
  declare lastUpdatedById: CreationOptional<number>;
  declare GroupId: ForeignKey<GroupId>;
  declare activeAt: CreationOptional<Date>;
  declare automatic: CreationOptional<boolean>;
  declare needsRename: CreationOptional<boolean>;
  declare settings?: CreationOptional<ApiStationSettings>;
  declare earliestThermalRecordingTime: CreationOptional<Date>;
  declare earliestAudioRecordingTime: CreationOptional<Date>;
  declare lastThermalRecordingTime: CreationOptional<Date>;
  declare lastAudioRecordingTime: CreationOptional<Date>;

  // FIXME: These two probably don't need to be separate, as most cameras are hybrid now.
  declare lastActiveThermalTime: CreationOptional<Date>;
  declare lastActiveAudioTime: CreationOptional<Date>;

  declare Group?: NonAttribute<Group>;

  static addAssociations() {
    this.belongsTo(Group);
    this.hasMany(Recording);
  }

  static async activeInGroupAtTime(
    groupId: GroupId,
    atDateTime: Date,
  ): Promise<Station[]> {
    return await this.findAll({
      where: {
        GroupId: groupId,
        // NOTE: If it's an automatic station, we're allowed to move its start time
        [Op.or]: [
          { activeAt: { [Op.lte]: atDateTime } },
          { automatic: { [Op.eq]: true } },
        ],
        retiredAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: atDateTime }],
        },
      },
    });
  }

  static async activeInGroupDuringTimeRange(
    groupId: GroupId,
    fromTime: Date = new Date(),
    untilTime: Date = new Date(),
    orAutomatic = false,
  ): Promise<Station[]> {
    const findClause = [
      {
        [Op.and]: [
          { retiredAt: null as Date | null },
          { activeAt: { [Op.lte]: untilTime } },
        ],
      },
      {
        retiredAt: {
          [Op.and]: [{ [Op.gte]: fromTime }, { [Op.lt]: untilTime }],
        },
      },
    ];
    if (orAutomatic) {
      (findClause as object[]).push({
        [Op.and]: [{ retiredAt: null }, { automatic: true }],
      });
    }
    return await this.findAll({
      where: {
        GroupId: groupId,
        [Op.or]: findClause,
      },
    });
  }

  static async getCacophonyIndex(
    authUser: User,
    stationId: StationId,
    from: Date,
    windowSizeInHours: number,
  ): Promise<number> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    const [result, _] = (await this.sequelize.query(
      `select round((avg(scores))::numeric, 2) as index from
      (select
        (jsonb_array_elements("cacophonyIndex")->>'index_percent')::float as scores
    from
    "Recordings"
  where
    "StationId" = ${stationId}
    and "type" = 'audio'
    and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC') as cacophonyIndex`,
    )) as [{ index: number }[], unknown];
    return result[0].index;
  }

  static async getCacophonyIndexBulk(
    authUser: User,
    stationId: StationId,
    from: Date,
    steps: number,
    interval: TimeInterval,
  ): Promise<{ stationId: StationId; from: string; cacophonyIndex: number }[]> {
    const counts = [];
    let stepSizeInMs;
    switch (interval) {
      case "hours":
        stepSizeInMs = 60 * 60 * 1000;
        break;
      case "days":
        stepSizeInMs = 24 * 60 * 60 * 1000;
        break;
      case "weeks":
        stepSizeInMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case "months": {
        const currMonthDays = new Date(
          from.getFullYear(),
          from.getMonth() + 1,
          0,
        ).getDate();
        stepSizeInMs = currMonthDays * 24 * 60 * 60 * 1000;
        break;
      }
      case "years": {
        const currYearDays = new Date(from.getFullYear(), 11, 31).getDate();
        stepSizeInMs = currYearDays * 24 * 60 * 60 * 1000;
        break;
      }
      default:
        throw new Error(`Invalid interval: ${interval}`);
    }
    const stepSizeInHours = stepSizeInMs / (60 * 60 * 1000);

    for (let i = 0; i < steps; i++) {
      const windowEnd = new Date(from.getTime() - i * stepSizeInMs);
      const result = await this.getCacophonyIndex(
        authUser,
        stationId,
        windowEnd,
        stepSizeInHours,
      );
      counts.push({
        stationId: stationId,
        from: windowEnd.toISOString(),
        cacophonyIndex: result,
      });
    }
    return counts;
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: DataTypes.STRING,
    location: locationField(),
    lastUpdatedById: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    retiredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    earliestThermalRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    earliestAudioRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastThermalRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastAudioRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActiveThermalTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActiveAudioTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    activeAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    automatic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    needsRename: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  };
  Station.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Stations",
    name: {
      plural: "Stations",
      singular: "Station",
    },
  });
  return Station;
};
