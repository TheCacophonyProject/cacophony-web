/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2021  The Cacophony Project

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

import type { User } from "@models/User.js";
import { QueryTypes } from "sequelize";
import modelsInit from "@models/index.js";
import type { GroupId, StationId } from "@typedefs/api/common.js";
import type { MonitoringPageCriteria } from "@typedefs/api/monitoring.js";
import { RecordingType } from "@typedefs/api/consts.js";
import type {Recording} from "@models/Recording.js";

const models = await modelsInit();

export interface MonitoringParams {
  groups: GroupId[];
  stations: StationId[];
  from?: Date;
  until?: Date;
  page: number;
  pageSize: number;
  types?: (
    | RecordingType.ThermalRaw
    | RecordingType.Audio
    | RecordingType.TrailCamVideo
    | RecordingType.TrailCamImage
  )[];
}

const GROUPS_AND_STATIONS = "GROUPS_AND_STATIONS";
const USER_PERMISSIONS = "USER_PERMISSIONS";
const DATE_SELECTION = "DATE_SELECTION";
const RECORDING_TYPES = "RECORDING_TYPES";
const PAGING = "PAGING";
const BEFORE_CACOPHONY = new Date(2017, 1, 1);

const LAST_TIMES_TABLE = `with lasttimes as                                    
(select "recordingDateTime", "StationId", "GroupId",
   LAG("recordingDateTime", 1) OVER (PARTITION BY "StationId" ORDER BY "recordingDateTime") lasttime,
   LAG("duration", 1) OVER (PARTITION BY "StationId" ORDER BY "recordingDateTime") lastduration
     from "Recordings" 
     where "recordingDateTime" is not NULL
       and "deletedAt" is null 
       and ({${RECORDING_TYPES}})
       and duration > 2.5
       {${GROUPS_AND_STATIONS}}
       {${USER_PERMISSIONS}}
       {${DATE_SELECTION}}
)`;

const WHERE_IS_VISIT_START = `where "lasttime" is NULL 
or extract(epoch from "recordingDateTime") - extract(epoch from "lasttime") - "lastduration" > 600`;

const VISITS_COUNT_SQL = `${LAST_TIMES_TABLE} select count(*) from "lasttimes" ${WHERE_IS_VISIT_START}`;

const VISIT_STARTS_SQL = `${LAST_TIMES_TABLE} 
select * from "lasttimes" 
${WHERE_IS_VISIT_START}
order by "recordingDateTime" desc
{${PAGING}}`;

export async function calculateMonitoringPageCriteria(
  user: User,
  params: MonitoringParams,
  viewAsSuperAdmin: boolean
): Promise<MonitoringPageCriteria> {
  return getDatesForSearch(user, params, viewAsSuperAdmin);
}

const makeRecordingTypes = (suppliedTypes: string[]): string => {
  const types = [];
  const allowedTypes = [
    RecordingType.Audio,
    RecordingType.ThermalRaw,
    RecordingType.TrailCamImage,
    RecordingType.TrailCamVideo,
  ];
  for (const type of suppliedTypes) {
    if ((allowedTypes as string[]).includes(type)) {
      types.push(type);
    }
  }
  return types.map((type) => `type = '${type}'`).join(" or ");
};

async function getDatesForSearch(
  user: User,
  params: MonitoringParams,
  viewAsSuperAdmin: boolean
): Promise<MonitoringPageCriteria> {
  const replacements = {
    GROUPS_AND_STATIONS: makeGroupsAndStationsCriteria(
      params.stations,
      params.groups
    ),
    USER_PERMISSIONS: await makeGroupsPermissions(user, viewAsSuperAdmin),
    RECORDING_TYPES: makeRecordingTypes(params.types),
    DATE_SELECTION: makeDatesCriteria(params),
    PAGING: null,
  };

  const countRet = await models.sequelize.query(
    replaceInSQL(VISITS_COUNT_SQL, replacements),
    { type: QueryTypes.SELECT }
  );
  const approxVisitCount = parseInt((countRet[0] as {count: string}).count);
  const returnVal = createPageCriteria(params, approxVisitCount);
  if (approxVisitCount < params.pageSize) {
    returnVal.pageFrom = returnVal.searchFrom;
    returnVal.pageUntil = returnVal.searchUntil;
  } else if (params.page <= returnVal.pagesEstimate) {
    const limit: number = Number(params.pageSize) + 1;
    const offset: number = (params.page - 1) * params.pageSize;
    replacements.PAGING = ` LIMIT ${limit} OFFSET ${offset}`;
    const results: Recording[] = await models.sequelize.query(
      replaceInSQL(VISIT_STARTS_SQL, replacements),
      { model: models.Recording }
    );

    if (results.length > 0) {
      returnVal.pageUntil =
        params.page == 1 ? returnVal.searchUntil : results[0].recordingDateTime;
      if (params.page < returnVal.pagesEstimate) {
        returnVal.pageFrom = results[results.length - 1].recordingDateTime;
      } else {
        returnVal.pageFrom = returnVal.searchFrom;
      }
    }
  }

  return returnVal;
}

function createPageCriteria(
  params: MonitoringParams,
  count: number
): MonitoringPageCriteria {
  const criteria: MonitoringPageCriteria = {
    page: params.page,
    pagesEstimate: Math.ceil(count / params.pageSize),
    searchFrom: params.from || BEFORE_CACOPHONY,
    searchUntil: params.until || new Date(),
    compareAi: "Master",
  };

  if (params.stations.length !== 0) {
    criteria.stations = params.stations;
  }

  if (params.groups.length !== 0) {
    criteria.groups = params.groups;
  }

  return criteria;
}

function replaceInSQL(
  sql: string,
  replacements: { [key: string]: string }
): string {
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    sql = sql.replace(new RegExp(`{${placeholder}}`, "g"), replacement);
  }
  return sql;
}

function makeGroupsAndStationsCriteria(
  stationIds: StationId[],
  groupIds: GroupId[]
): string {
  const stationString =
    stationIds.length > 0 ? `"StationId" IN (${stationIds.join(",")})` : null;
  const grpString =
    groupIds.length > 0 ? `"GroupId" IN (${groupIds.join(",")})` : null;

  if (stationString && grpString) {
    return ` and (${stationString} or ${grpString})`;
  } else if (stationString) {
    return ` and ${stationString}`;
  } else if (grpString) {
    return ` and ${grpString}`;
  }

  return "";
}

function makeDatesCriteria(params: MonitoringParams): string {
  const fromCondition = params.from
    ? ` AND "recordingDateTime" > '${toPgDate(params.from)}' `
    : "";
  const untilCondition = params.until
    ? ` AND "recordingDateTime" < '${toPgDate(params.until)}' `
    : "";
  return fromCondition + untilCondition;
}

function toPgDate(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", " +00:00");
}

async function makeGroupsAndStationsPermissions(
  user: User,
  viewAsSuperAdmin: boolean
): Promise<string> {
  if (user.hasGlobalRead() && viewAsSuperAdmin) {
    return "";
  }

  const [stationIds, groupIds] = await Promise.all([
    user.getStationIds(),
    user.getGroupsIds(),
  ]);
  return makeGroupsAndStationsCriteria(stationIds, groupIds);
}

async function makeGroupsPermissions(
  user: User,
  viewAsSuperAdmin: boolean
): Promise<string> {
  if (user.hasGlobalRead() && viewAsSuperAdmin) {
    return "";
  }

  const groupIds = await user.getGroupsIds();
  return makeGroupsAndStationsCriteria([], groupIds);
}
