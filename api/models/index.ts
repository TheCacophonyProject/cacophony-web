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
import config from "../config.js";
import Sequelize from "sequelize";
import path from "path";
import fs from "fs";
import log from "../logging.js";
import type { AlertStatic } from "./Alert.js";
import type { UserStatic } from "./User.js";
import type { TagStatic } from "./Tag.js";
import type { RecordingStatic } from "./Recording.js";
import type { TrackTagStatic } from "./TrackTag.js";
import type { TrackStatic } from "./Track.js";
import type { DetailSnapshotStatic } from "./DetailSnapshot.js";
import type { FileStatic } from "./File.js";
import type { EventStatic } from "./Event.js";
import type { DeviceStatic } from "./Device.js";
import type { GroupStatic } from "./Group.js";
import type { GroupUsersStatic } from "./GroupUsers.js";
import type { ScheduleStatic } from "./Schedule.js";
import type { StationStatic } from "./Station.js";
import { asyncLocalStorage } from "@/Globals.js";
import type { DeviceHistoryStatic } from "./DeviceHistory.js";
import type { GroupInvitesStatic } from "./GroupInvites.js";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basename = path.basename(__filename);
const dbConfig = config.database;

// Have sequelize send us query execution timings
dbConfig.benchmark = true;

const IS_DEBUG = config.server.loggerLevel === "debug";

// Send logs via winston
(dbConfig as any).logging = IS_DEBUG
  ? async (msg: string, timeMs: number) => {
      // Sequelize seems to happen in its own async context?
      let requestQueryCount =
        (asyncLocalStorage.getStore() as Map<string, any>)?.get("queryCount") ||
        0;
      requestQueryCount++;
      (asyncLocalStorage.getStore() as Map<string, any>)?.set(
        "queryCount",
        requestQueryCount
      );

      let requestQueryTime =
        (asyncLocalStorage.getStore() as Map<string, any>)?.get("queryTime") ||
        0;
      requestQueryTime += timeMs;
      (asyncLocalStorage.getStore() as Map<string, any>)?.set(
        "queryTime",
        requestQueryTime
      );
      if (timeMs > (config.database.slowQueryLogThresholdMs || 200)) {
        log.warning("Slow query: %s [%d]ms", msg, timeMs);
      } else {
        log.info(
          "query: %s [%d]ms",
          msg.replace(/\n/g, "").replace(/\t/, " ").replace(/\s+/g, " "),
          timeMs
        );
      }
    }
  : false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ModelCommon<T> extends Sequelize.Model {
  getJwtDataValues: () => { _type: string; id: any };
}
export interface ModelStaticCommon<T> extends Sequelize.ModelCtor<any> {
  getFromName: (name: string) => Promise<T | null>;
  publicFields: readonly string[];
  apiSettableFields: readonly string[];
  addAssociations: (models: Record<string, ModelStaticCommon<any>>) => void;
  userGetAttributes: readonly string[];
  getDataValue: (fieldName: string) => any;
}

export interface ModelsDictionary {
  User: UserStatic;
  Recording: RecordingStatic;
  Tag: TagStatic;
  TrackTag: TrackTagStatic;
  Track: TrackStatic;
  DetailSnapshot: DetailSnapshotStatic;
  File: FileStatic;
  Event: EventStatic;
  Device: DeviceStatic;
  Group: GroupStatic;
  DeviceHistory: DeviceHistoryStatic;
  GroupInvites: GroupInvitesStatic;
  Station: StationStatic;
  GroupUsers: GroupUsersStatic;
  Schedule: ScheduleStatic;
  Alert: AlertStatic;
  sequelize: Sequelize.Sequelize;
}

let AllModels: ModelsDictionary;

export default async function () {
  if (!AllModels) {
    // String-based operators are deprecated in sequelize v4 as a security concern.
    // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators-security
    // Because they are currently used via the API, we need to keep them enabled.
    // The following definition explicitly enables the aliases we want to support.
    const Op = Sequelize.Op;

    // If we're running in debug mode, we want to be able to see requestIds with every
    // logged DB call, so that we can match up all the logs for a single request.
    // By default, sequelize pools connections, and keeps them around for a while,
    // which for some reason breaks the context passing of our AsyncLocalStorage based
    // requestIds.  Setting the pools to timeout after idle for 1ms and having max 1 connection
    // resolves this issue for debugging purposes, but this is not something you'd
    // want to do in production!
    const poolOptions = IS_DEBUG
      ? {
          pool: {
            max: 1,
            min: 0,
            idle: 1,
            evict: 1,
          },
        }
      : {};

    // @ts-ignore
    const sequelize = new Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        ...dbConfig,
        logQueryParameters: true,
        operatorsAliases: {
          $eq: Op.eq,
          $ne: Op.ne,
          $gte: Op.gte,
          $gt: Op.gt,
          $lte: Op.lte,
          $lt: Op.lt,
          $not: Op.not,
          $in: Op.in,
          $notIn: Op.notIn,
          $is: Op.is,
          $like: Op.like,
          $notLike: Op.notLike,
          $iLike: Op.iLike,
          $notILike: Op.notILike,
          $between: Op.between,
          $notBetween: Op.notBetween,
          $contains: Op.contains,
          $and: Op.and,
          $or: Op.or,
          $any: Op.any,
          $all: Op.all,
        },
        ...poolOptions,
      }
    );

    const db: Record<string, any> = {};

    const files = fs.readdirSync(__dirname).filter((file) => {
      return (
        file.indexOf(".") !== 0 && file !== basename && file.endsWith(".js")
      );
    });
    for (const file of files) {
      try {
        const filePath = path.join(__dirname, file);
        const model = await import(filePath);
        const m = model.default(sequelize, Sequelize.DataTypes);
        db[m.name] = m;
      } catch (e) {
        console.error(`Error loading model ${file}`, e);
      }
    }

    Object.keys(db).forEach((modelName) => {
      if (db[modelName].addAssociations) {
        db[modelName].addAssociations(db);
      }
    });
    AllModels = {
      ...db,
      sequelize,
    } as ModelsDictionary;
  }
  return AllModels;
}
