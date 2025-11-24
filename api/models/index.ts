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
import Sequelize, {
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import path from "path";
import fs from "fs";
import log from "../logging.js";
import { Alert } from "./Alert.js";
import { User } from "./User.js";
import { Tag } from "./Tag.js";
import { Recording } from "./Recording.js";
import { TrackTag } from "./TrackTag.js";
import { Track } from "./Track.js";
import { DetailSnapshot } from "./DetailSnapshot.js";
import { File } from "./File.js";
import { Event } from "./Event.js";
import { Device } from "./Device.js";
import { Group } from "./Group.js";
import { GroupUsers } from "./GroupUsers.js";
import { Schedule } from "./Schedule.js";
import { Station } from "./Station.js";
import { asyncLocalStorage } from "@/Globals.js";
import { DeviceHistory } from "./DeviceHistory.js";
import { GroupInvites } from "./GroupInvites.js";
import { fileURLToPath } from "url";
import type { TrackTagUserData } from "@models/TrackTagUserData.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basename = path.basename(__filename);
const dbConfig = config.database;
const IS_DEBUG = config.server.loggerLevel === "debug";
const IS_CI_ENV = !!process.env.IS_CI_ENV;
// Have sequelize send us query execution timings
dbConfig.benchmark = !IS_CI_ENV;

export class ModelStaticCommon<
  T extends Sequelize.Model,
> extends Sequelize.Model<InferAttributes<T>, InferCreationAttributes<T>> {
  declare static addAssociations: () => void;
  declare static apiSettableFields: NonAttribute<readonly string[]>;
  declare static publicFields: NonAttribute<readonly string[]>;
}

export interface ModelsDictionary {
  User: User;
  Recording: Recording;
  Tag: Tag;
  TrackTag: TrackTag;
  TrackTagUserData: TrackTagUserData;
  Track: Track;
  DetailSnapshot: DetailSnapshot;
  File: File;
  Event: Event;
  Device: Device;
  Group: Group;
  DeviceHistory: DeviceHistory;
  GroupInvites: GroupInvites;
  Station: Station;
  GroupUsers: GroupUsers;
  Schedule: Schedule;
  Alert: Alert;
  sequelize: Sequelize.Sequelize;
}

let AllModels: ModelsDictionary;

export default async function () {
  if (!AllModels) {
    const Op = Sequelize.Op;

    // If we're running in debug mode, we want to be able to see requestIds with every
    // logged DB call, so that we can match up all the logs for a single request.
    // By default, sequelize pools connections, and keeps them around for a while,
    // which for some reason breaks the context passing of our AsyncLocalStorage based
    // requestIds.  Setting the pools to timeout after idle for 1ms and having max 1 connection
    // resolves this issue for debugging purposes, but this is not something you'd
    // want to do in production!

    // TODO: We also don't want to restrict pooling when running local cypress tests really.
    const poolOptions =
      IS_DEBUG && !IS_CI_ENV
        ? {
            pool: {
              max: 1,
              min: 0,
              idle: 1,
              evict: 1,
            },
          }
        : {};

    const sequelizeInstance = new Sequelize.Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        ...dbConfig,
        logQueryParameters: true,
        // String-based operators are deprecated in sequelize v4 as a security concern.
        // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators-security
        // Because they are currently used via the API, we need to keep them enabled.
        // The following definition explicitly enables the aliases we want to support.
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
        // NOTE: Currently outputting slow queries and timings on production.
        // Send logs via winston
        logging:
          !IS_CI_ENV && (IS_DEBUG || true)
            ? async (msg: string, timeMs: number) => {
                // Sequelize seems to happen in its own async context?
                const store = asyncLocalStorage.getStore();
                let requestQueryCount =
                  (store?.get("queryCount") as number) || 0;
                requestQueryCount++;
                store?.set("queryCount", requestQueryCount);
                let requestQueryTime = (store?.get("queryTime") as number) || 0;
                requestQueryTime += timeMs;
                store?.set("queryTime", requestQueryTime);
                if (timeMs > (config.database.slowQueryLogThresholdMs || 200)) {
                  log.warning("Slow query: %s [%d]ms", msg, timeMs);
                } else if (IS_DEBUG) {
                  log.info(
                    "QUERY %dms\n\t\t %s",
                    timeMs,
                    msg
                      .replace("Executed (default): ", "")
                      .replace(/\n/g, "")
                      .replace(/\t/, " ")
                      .replace(/\s+/g, " "),
                  );
                }
              }
            : false,
      },
    );

    const db: Record<string, ModelStaticCommon<never>> = {};

    const files = fs.readdirSync(__dirname).filter((file) => {
      return (
        file.indexOf(".") !== 0 && file !== basename && file.endsWith(".js")
      );
    });
    for (const file of files) {
      try {
        const filePath = path.join(__dirname, file);
        const { init } = await import(filePath);
        const model = init(sequelizeInstance);
        db[model.name] = model;
      } catch (e) {
        console.error(`Error loading model ${file}`, e);
      }
    }

    Object.entries(db).forEach(([_modelName, model]) => {
      if (model["addAssociations"]) {
        model["addAssociations"]();
      }
    });
    AllModels = {
      ...db,
      sequelize: sequelizeInstance,
    } as ModelsDictionary;
  }
  return AllModels;
}
