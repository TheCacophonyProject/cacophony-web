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

import Sequelize, { BuildOptions, ModelAttributes, Op } from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import util from "./util/util";
import { GroupId, LatLng, StationId, UserId } from "@typedefs/api/common";
import { ApiStationSettings } from "@typedefs/api/station";
import models from "@models/index";

// Station data as supplied to API on creation.
export interface CreateStationData {
  name: string;
  lat: number;
  lng: number;
}

export interface Station extends Sequelize.Model, ModelCommon<Station> {
  id: StationId;
  name: string;
  location: LatLng;
  lastUpdatedById: UserId | null;
  lastThermalRecordingTime: Date | null;
  lastAudioRecordingTime: Date | null;
  lastActiveThermalTime: Date | null;
  lastActiveAudioTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeAt: Date;
  retiredAt: Date | null;
  GroupId: GroupId;
  automatic: boolean;
  needsRename: boolean;
  settings?: ApiStationSettings;
}

export interface StationStatic extends ModelStaticCommon<Station> {
  new (values?: object, options?: BuildOptions): Station;
  getAll: (where: any) => Promise<Station[]>;
  getFromId: (id: StationId) => Promise<Station | null>;
  activeInGroupAtTime: (
    groupId: GroupId,
    atDateTime: Date
  ) => Promise<Station[]>;
  activeInGroupDuringTimeRange: (
    groupId: GroupId,
    fromTime?: Date,
    untilTime?: Date
  ) => Promise<Station[]>;
  getCacophonyIndex: (
    authUser,
    stationId,
    from,
    windowSizeInHours
  ) => Promise<number>;
  getCacophonyIndexBulk: (
    authUser,
    stationId: StationId,
    from: Date,
    steps: number,
    interval: String
  ) => Promise<
    { stationId: StationId; from: string; cacophonyIndex: number }[]
  >;
  getSpeciesCount: (
    authUser,
    stationId,
    from,
    windowSizeInHours,
    type
  ) => Promise<{ what: string; count: number }[]>;
  getSpeciesCountBulk: (
    authUser,
    stationId: StationId,
    from: Date,
    steps: number,
    interval: String,
    type: string
  ) => Promise<
    { stationId: StationId; from: string; what: string; count: number }[]
  >;
  getDaysActive: (
    authUser,
    stationId: StationId,
    from: Date,
    windowSizeInHours: number
  ) => Promise<number>;
}
export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): StationStatic {
  const name = "Station";
  const attributes: ModelAttributes = {
    name: {
      type: DataTypes.STRING,
    },
    location: util.locationField(),
    lastUpdatedById: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
    },
    retiredAt: {
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

  // Define table
  const Station = sequelize.define(
    name,
    attributes
  ) as unknown as StationStatic;

  //---------------
  // CLASS METHODS
  //---------------

  Station.addAssociations = function (models) {
    models.Station.belongsTo(models.Group);
    models.Station.hasMany(models.Recording);
  };

  Station.getFromId = async function (id) {
    return this.findByPk(id);
  };

  Station.activeInGroupAtTime = async function (
    groupId: GroupId,
    atDateTime: Date
  ): Promise<Station[]> {
    return await models.Station.findAll({
      where: {
        GroupId: groupId,
        activeAt: { [Op.lte]: atDateTime },
        retiredAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: atDateTime }],
        },
      },
    });
  };

  Station.activeInGroupDuringTimeRange = async function (
    groupId: GroupId,
    fromTime: Date = new Date(),
    untilTime: Date = new Date()
  ): Promise<Station[]> {
    return await models.Station.findAll({
      where: {
        GroupId: groupId,
        [Op.or]: [
          {
            [Op.and]: [
              { retiredAt: { [Op.eq]: null } },
              { activeAt: { [Op.lte]: untilTime } },
            ],
          },
          {
            retiredAt: {
              [Op.and]: [{ [Op.gte]: fromTime }, { [Op.lt]: untilTime }],
            },
          },
        ],
      },
    });
  };

  Station.getCacophonyIndex = async function (
    authUser,
    stationId,
    from,
    windowSizeInHours
  ) {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    console.log(
      `cacophonyIndex: stationId: ${stationId}, from: ${from}, windowSizeInHours: ${windowSizeInHours}, windowEndTimestampUtc: ${windowEndTimestampUtc}`
    );
    const [result, _] = (await sequelize.query(
      `select round((avg(scores))::numeric, 2) as index from
      (select
        (jsonb_array_elements("cacophonyIndex")->>'index_percent')::float as scores
    from
    "Recordings"
  where
    "StationId" = ${stationId}
    and "type" = 'audio'
    and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC') as cacophonyIndex`
    )) as [{ index: number }[], unknown];
    return result[0].index;
  };

  Station.getCacophonyIndexBulk = async function (
    authUser,
    stationId,
    from,
    steps,
    interval
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
      case "months":
        const currMonthDays = new Date(
          from.getFullYear(),
          from.getMonth() + 1,
          0
        ).getDate();
        stepSizeInMs = currMonthDays * 24 * 60 * 60 * 1000;
        break;
      case "years":
        const currYearDays = new Date(from.getFullYear(), 11, 31).getDate();
        stepSizeInMs = currYearDays * 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Invalid interval: ${interval}`);
    }
    const stepSizeInHours = stepSizeInMs / (60 * 60 * 1000);
    console.log(
      `stationId: ${stationId}, from: ${from}, steps: ${steps}, interval: ${interval}, stepSizeInMs: ${stepSizeInMs}, stepSizeInHours: ${stepSizeInHours}`
    );
    for (let i = 0; i < steps; i++) {
      const windowEnd = new Date(from.getTime() - i * stepSizeInMs);
      const result = await Station.getCacophonyIndex(
        authUser,
        stationId,
        windowEnd,
        stepSizeInHours
      );
      counts.push({
        stationId: stationId,
        from: windowEnd.toISOString(),
        cacophonyIndex: result,
      });
    }
    return counts;
  };

  Station.getSpeciesCount = async function (
    authUser,
    stationId,
    from,
    windowSizeInHours,
    type
  ): Promise<{ what: string; count: number }[]> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    // We need to take the time down to the previous hour, so remove 1 second
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    // Get a spread of 24 results with each result falling into an hour bucket.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [results, _] =
      (await sequelize.query(`SELECT tt.what, count(*) as count 
      FROM "Recordings" r 
      JOIN "Tracks" t ON r.id = t."RecordingId" 
      JOIN "TrackTags" tt ON t.id = tt."TrackId" 
      WHERE r."StationId" = ${stationId} 
      AND r."type" = '${type}'
      AND r."recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
      GROUP BY tt.what;
    `)) as [{ what: string; count: number }[], unknown];

    return results.map((item) => ({
      what: String(item.what),
      count: Number(item.count),
    }));
  };

  Station.getSpeciesCountBulk = async function (
    authUser,
    stationId,
    from,
    steps,
    interval,
    type
  ): Promise<
    { stationId: StationId; from: string; what: string; count: number }[]
  > {
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
      case "months":
        const currMonthDays = new Date(
          from.getFullYear(),
          from.getMonth() + 1,
          0
        ).getDate();
        stepSizeInMs = currMonthDays * 24 * 60 * 60 * 1000;
        break;
      case "years":
        const currYearDays = new Date(from.getFullYear(), 11, 31).getDate();
        stepSizeInMs = currYearDays * 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Invalid interval: ${interval}`);
    }
    const stepSizeInHours = stepSizeInMs / (60 * 60 * 1000);
    console.log(
      `stepSizeInHours: ${stepSizeInHours} steps: ${steps} interval: ${interval} from: ${from}`
    );
    for (let i = 0; i < steps; i++) {
      const windowEnd = new Date(from.getTime() - i * stepSizeInMs);
      const result = await Station.getSpeciesCount(
        authUser,
        stationId,
        windowEnd,
        stepSizeInHours,
        type
      );
      counts.push(
        ...result.map((item) => ({
          deviceId: stationId,
          from: windowEnd.toISOString(),
          what: item.what,
          count: item.count,
        }))
      );
    }
    Station.getDaysActive(
      authUser,
      2,
      new Date("2023-04-20T05:02:07.000Z"),
      168
    );
    return counts;
  };

  Station.getDaysActive = async function (
    authUser,
    stationId,
    from,
    windowSizeInHours
  ): Promise<number> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    const timezoneOffset = from.getTimezoneOffset() * 60;
    const query = `
      SELECT DISTINCT DATE("recordingDateTime" AT TIME ZONE 'UTC' AT TIME ZONE INTERVAL '${timezoneOffset} seconds') as DATE
      FROM "Recordings"
      WHERE "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
      AND "StationId" = ${stationId}
      ORDER BY DATE DESC
    `;
    const [results, _] = (await sequelize.query(query)) as [
      { date: string; has_recordings: boolean }[],
      unknown
    ];
    console.log("````````````");
    console.log(results);

    const eventQuery = `
    SELECT DISTINCT DATE(e."dateTime" AT TIME ZONE 'UTC' AT TIME ZONE INTERVAL '${timezoneOffset} seconds') as DATE
    FROM "Events" e
    JOIN "Recordings" r ON e."DeviceId" = r."DeviceId"
    WHERE r."StationId" = ${stationId}
    AND e."dateTime" AT TIME ZONE 'UTC' BETWEEN
        (to_timestamp(${windowEndTimestampUtc}) AT TIME ZONE 'UTC' - INTERVAL '${windowSizeInHours} hours') AND
        to_timestamp(${windowEndTimestampUtc}) AT TIME ZONE 'UTC'
    AND e."dateTime" >= r."recordingDateTime"
    AND NOT EXISTS (
        SELECT 1
        FROM "Recordings" r2
        WHERE r2."DeviceId" = r."DeviceId"
        AND r2."recordingDateTime" > r."recordingDateTime"
        AND r2."recordingDateTime" <= e."dateTime"
    )
    `;
    console.log("hi`");
    const [eventResults, __] = (await sequelize.query(eventQuery)) as [
      { date: string; has_recordings: boolean }[],
      unknown
    ];
    console.log(eventResults);
    const activeDates = new Set();
    results.forEach((item) => activeDates.add(item.date));
    eventResults.forEach((item) => activeDates.add(item.date));
    console.log(activeDates);
    return activeDates.size;
  };

  return Station;
}
