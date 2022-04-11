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

import { validateFields } from "../middleware";
import models from "@models";
import responseUtil from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application, NextFunction, Request, Response } from "express";
import {
  parseJSONField,
  extractJwtAuthorizedUser,
  fetchUnauthorizedOptionalGroupByNameOrId,
  fetchAuthorizedRequiredGroupByNameOrId,
  fetchAdminAuthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredUserByNameOrId,
  fetchAuthorizedRequiredDevicesInGroup,
  fetchAuthorizedRequiredGroups,
  fetchAuthorizedRequiredSchedulesForGroup,
  fetchAuthorizedRequiredStationsForGroup,
  fetchAdminAuthorizedRequiredStationByNameInGroup,
  fetchAuthorizedRequiredStationByNameInGroup,
} from "../extract-middleware";
import { arrayOf, jsonSchemaOf } from "../schema-validation";
import ApiCreateStationDataSchema from "@schemas/api/station/ApiCreateStationData.schema.json";
import ApiGroupSettingsSchema from "@schemas/api/group/ApiGroupSettings.schema.json";
import ApiGroupUserSettingsSchema from "@schemas/api/group/ApiGroupUserSettings.schema.json";

import {
  booleanOf,
  anyOf,
  idOf,
  nameOf,
  nameOrIdOf,
  validNameOf,
  deprecatedField,
} from "../validation-middleware";
import { ClientError } from "../customErrors";
import { mapDevicesResponse } from "./Device";
import {
  checkThatStationsAreNotTooCloseTogether,
  Group,
  locationsAreEqual,
} from "@/models/Group";
import { ApiGroupResponse, ApiGroupUserResponse } from "@typedefs/api/group";
import { ApiDeviceResponse } from "@typedefs/api/device";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  ApiCreateStationData,
  ApiStationResponse,
} from "@typedefs/api/station";
import { ScheduleConfig } from "@typedefs/api/schedule";
import { mapSchedule } from "@api/V1/Schedule";
import { mapStation, mapStations } from "./Station";
import { Op } from "sequelize";
import {
  latLngApproxDistance,
  MIN_STATION_SEPARATION_METERS,
} from "@api/V1/recordingUtil";
import { Station } from "@/models/Station";
import { StationId } from "@typedefs/api/common";

const mapGroup = (
  group: Group,
  viewAsSuperAdmin: boolean
): ApiGroupResponse => {
  const groupData: ApiGroupResponse = {
    id: group.id,
    groupName: group.groupname,
    admin: viewAsSuperAdmin || (group as any).Users[0].GroupUsers.admin,
  };
  if (group.settings) {
    groupData.settings = group.settings;
  }
  if (
    (group as any).Users &&
    (group as any).Users.length &&
    (group as any).Users[0].GroupUsers.settings
  ) {
    groupData.userSettings = (group as any).Users[0].GroupUsers.settings;
  }
  if (group.lastThermalRecordingTime) {
    groupData.lastThermalRecordingTime =
      group.lastThermalRecordingTime.toISOString();
  }
  if (group.lastAudioRecordingTime) {
    groupData.lastAudioRecordingTime =
      group.lastAudioRecordingTime.toISOString();
  }
  return groupData;
};

export const mapLegacyGroupsResponse = (groups: ApiGroupResponse[]) =>
  groups.map(({ groupName, ...rest }) => ({
    groupname: groupName,
    groupName,
    ...rest,
  }));

const mapGroups = (
  groups: Group[],
  viewAsSuperAdmin: boolean
): ApiGroupResponse[] =>
  groups.map((group) => mapGroup(group, viewAsSuperAdmin));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiGroupsResponseSuccess {
  groups: ApiGroupResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiGroupResponseSuccess {
  group: ApiGroupResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiGroupUsersResponseSuccess {
  users: ApiGroupUserResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiGroupDevicesResponseSuccess {
  devices: ApiDeviceResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiCreateStationDataBody {
  stations: ApiCreateStationData[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiCreateSingleStationDataBody {
  station: ApiCreateStationData;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiStationResponseSuccess {
  stations: ApiStationResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiScheduleConfigs {
  schedules: ScheduleConfig[];
}

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/groups`;

  /**
   * @api {post} /api/v1/groups Create a new group
   * @apiName NewGroup
   * @apiGroup Group
   *
   * @apiDescription Creates a new group with the user used in the JWT as the admin.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} groupName Unique group name.
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      anyOf(validNameOf(body("groupname")), validNameOf(body("groupName"))),
    ]),
    fetchUnauthorizedOptionalGroupByNameOrId(body(["groupname", "groupName"])),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.group) {
        return next(new ClientError("Group name in use", 422));
      }
      next();
    },
    async (request: Request, response: Response) => {
      const newGroup = await models.Group.create({
        groupname: request.body.groupname || request.body.groupName,
      });
      await newGroup.addUser(response.locals.requestUser.id, {
        through: { admin: true },
      });
      return responseUtil.send(response, {
        statusCode: 200,
        groupId: newGroup.id,
        messages: ["Created new group."],
      });
    }
  );

  /**
   * @api {get} /api/v1/groups Get all groups the user has access to
   * @apiName GetGroups
   * @apiGroup Group
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGroupsResponseSuccess}
   * @apiSuccessExample {JSON} ApiGroup[]:
   * [{
   *   "id": 1;
   *   "groupName": "My group",
   *   "lastRecordingTime": "2021-11-09T02:22:57.777Z",
   *   "admin": false
   * }]
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      deprecatedField(query("where")), // Sidekick
    ]),
    fetchAuthorizedRequiredGroups,
    async (request: Request, response: Response) => {
      let groups: ApiGroupResponse[] = mapGroups(
        response.locals.groups,
        response.locals.viewAsSuperUser
      );
      if (request.headers["user-agent"].includes("okhttp")) {
        // Sidekick UA
        groups = mapLegacyGroupsResponse(groups);
      }

      return responseUtil.send(response, {
        statusCode: 200,
        messages: [], // FIXME - handle deprecated field.
        groups,
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/:groupNameOrId Get a group by name or id
   * @apiName GetGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view details of a group.
   *
   * @apiParam {Number|String} groupIdOrName group id or group name
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGroupResponseSuccess}
   * @apiSuccessExample {JSON} ApiGroup:
   * {
   *   "id": 1;
   *   "groupName": "My group",
   *   "lastRecordingTime": "2021-11-09T02:22:57.777Z",
   *   "admin": false
   * }
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        group: mapGroup(response.locals.group, response.locals.viewAsSuperUser),
      });
    }
  );
  /**
   * @api {get} /api/v1/groups/:groupIdOrName/devices Retrieves all devices for a group (only active devices by default).
   * @apiName GetDevicesForGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view devices that belong
   * to a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String|Integer} groupIdOrName group id or group name
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGroupDevicesResponseSuccess} devices List of devices associated with the group
   * @apiUse DevicesList
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName/devices`,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      nameOrIdOf(param("groupIdOrName")),
      anyOf(
        query("onlyActive").optional().isBoolean().toBoolean(),
        query("only-active").optional().isBoolean().toBoolean()
      ),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    fetchAuthorizedRequiredDevicesInGroup(param("groupIdOrName")),
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        devices: mapDevicesResponse(
          response.locals.devices,
          response.locals.viewAsSuperUser
        ),
        messages: ["Got devices for group"],
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/:groupIdOrName/users Retrieves all users for a group.
   * @apiName GetUsersForGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view users that belong
   * to a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer|String} groupIdOrName group id or group name
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiGroupUsersResponseSuccess} users List of users associated with the group
   * @apiUse V1ResponseError
   * @apiSuccessExample {JSON} ApiGroupUser:
   * {
   *  "id": 456,
   *  "userName": "user name",
   *  "admin": true
   * }
   *
   */
  app.get(
    `${apiUrl}/:groupIdOrName/users`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      query("view-mode").optional().equals("user"),
    ]),
    // FIXME - should this be only visible to group admins?
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    async (request: Request, response: Response) => {
      const users = await response.locals.group.getUsers({
        attributes: ["id", "username"],
      });
      return responseUtil.send(response, {
        statusCode: 200,
        users: users.map(({ username, id, GroupUsers }) => ({
          userName: username,
          id,
          admin: GroupUsers.admin,
        })),
        messages: ["Got users for group"],
      });
    }
  );

  /**
   * @api {get} api/v1/groups/:groupIdOrName/schedules Get audio bait schedules for a group
   * @apiName GetSchedulesForGroup
   * @apiGroup Schedules
   * @apiDescription This call is used to retrieve the any audio bait schedules for a group.
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {String|Integer} groupIdOrName Name or id of group to get schedules for
   *
   * @apiInterface {apiSuccess::ApiScheduleConfigs} schedules Metadata of the schedules.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName/schedules`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("groupIdOrName"))]),
    fetchAuthorizedRequiredSchedulesForGroup(param("groupIdOrName")),
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Got schedules for group"],
        schedules: response.locals.schedules.map(mapSchedule),
      });
    }
  );

  /**
   * @api {post} /api/v1/groups/users Add a user to a group.
   * @apiName AddUserToGroup
   * @apiGroup Group
   * @apiDescription This call can add a user to a group. It must to be authenticated
   * by an admin from the group or a user with global write permission. It can also be used to update the
   * admin status of a user for the group by setting admin to true or false.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {String} [group] name of the group (either this or 'groupId' must be specified).
   * @apiBody {Integer} [groupId] id of the group (either this or 'group' must be specified).
   * @apiBody {String} userName name of the user to add to the group.
   * @apiBody {Boolean} admin If the user should be an admin for the group.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */

  // TODO(jon): Would be nicer as /api/v1/groups/:groupName/users or something
  app.post(
    `${apiUrl}/users`,
    extractJwtAuthorizedUser,
    validateFields([
      anyOf(nameOf(body("group")), idOf(body("groupId"))),
      anyOf(
        nameOf(body("username")),
        nameOf(body("userName")),
        idOf(body("userId"))
      ),
      booleanOf(body("admin")),
    ]),
    // Extract required resources to validate permissions.
    fetchAdminAuthorizedRequiredGroupByNameOrId(body(["group", "groupId"])),
    // Extract secondary resource
    fetchUnauthorizedRequiredUserByNameOrId(
      body(["username", "userName", "userId"])
    ),
    async (request, response) => {
      const action = await models.Group.addUserToGroup(
        response.locals.group,
        response.locals.user,
        request.body.admin
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [action],
      });
    }
  );
  /**
   * @api {delete} /api/v1/groups/users Removes a user from a group.
   * @apiName RemoveUserFromGroup
   * @apiGroup Group
   * @apiDescription This call can remove a user from a group. Has to be authenticated
   * by an admin from the group or a user with global write permission.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {String} [group] name of the group (either this or 'groupId' must be specified).
   * @apiBody {Integer} [groupId] id of the group (either this or 'group' must be specified).
   * @apiBody {String} [userName] name of the user to remove from the group (either 'userName' or 'userId' must be specified).
   * @apiBody {Integer} [userId] id of the user to remove from the group (either 'userName' or 'userId' must be specified).
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/users`,
    extractJwtAuthorizedUser,
    validateFields([
      anyOf(nameOf(body("group")), idOf(body("groupId"))),
      anyOf(
        nameOf(body("username")),
        nameOf(body("userName")),
        idOf(body("userId"))
      ),
    ]),
    // Extract required resources to check permissions
    fetchAdminAuthorizedRequiredGroupByNameOrId(body(["group", "groupId"])),
    // Extract secondary resource
    fetchUnauthorizedRequiredUserByNameOrId(
      body(["username", "userName", "userId"])
    ),
    async (request, response) => {
      const removed = await models.Group.removeUserFromGroup(
        response.locals.group,
        response.locals.user
      );
      if (removed) {
        return responseUtil.send(response, {
          statusCode: 200,
          messages: ["Removed user from the group."],
        });
      } else {
        return responseUtil.send(response, {
          statusCode: 400,
          messages: ["Failed to remove user from the group."],
        });
      }
    }
  );

  /**
   * @api {post} /api/v1/groups/:groupIdOrName/stations Add, Update and retire current stations belonging to group
   * @apiName PostStationsForGroup
   * @apiGroup Station
   * @apiDescription A group admin or an admin with globalWrite permissions can update stations for a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer|String} groupNameOrId group name or group id
   * @apiInterface {apiBody::ApiCreateStationDataBody} stations Json array of ApiStation[]
   * @apiParam {Date} [from-date] Start date/time for the new station as ISO timestamp (e.g. '2021-05-19T02:45:01.236Z')
   * @apiParam {Date} [until-date] End date/time for the new station as ISO timestamp (e.g. '2021-05-19T02:45:01.236Z')
   * @apiParamExample {json} ApiStation:
   * {
   *   name: "Station Name",
   *   lat: -45.1,
   *   lng: 172.0
   * }
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer[]} stationIdsAddedOrUpdated Array of Identifiers of stations added or updated.
   * @apiInterface {apiSuccess::ApiCreateStationsResponse}
   * @apiSuccess {string} warnings Warnings showing data validation rule breaches for the applied stations.
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:groupIdOrName/stations`,
    extractJwtAuthorizedUser,
    validateFields([
      body("stations")
        .exists()
        .custom(jsonSchemaOf(arrayOf(ApiCreateStationDataSchema))),
      body("from-date").isISO8601().toDate().optional(),
      body("until-date").isISO8601().toDate().optional(),
      nameOrIdOf(param("groupIdOrName")),
    ]),
    // Extract required resources
    fetchAdminAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    // Extract further non-dependent resources:
    parseJSONField(body("stations")),
    async (request, response) => {
      // Get the existing stations for the group:
      const existingStationsInTimeRange =
        await models.Station.activeInGroupDuringTimeRange(
          response.locals.group.id,
          request.body["from-date"],
          request.body["until-date"]
        );

      const newStations = response.locals.stations;
      const stationsToCreate = [];
      const stationsToUpdate: Record<StationId, Station> = {};

      // Check for duplicate names in the supplied stations:
      const uniqueNames = {};
      for (const station of newStations) {
        if (uniqueNames[station.name]) {
          return responseUtil.send(response, {
            statusCode: 422,
            messages: [
              `Name ${station.name} supplied multiple times in station update request.`,
            ],
          });
        }
        uniqueNames[station.name] = true;
      }

      // Check to see if any of these new stations exist:
      for (const station of newStations) {
        let matches = false;
        for (const existingStation of existingStationsInTimeRange) {
          const locationMatches = locationsAreEqual(
            existingStation.location,
            station
          );
          const nameMatches = existingStation.name === station.name;
          if (locationMatches && !nameMatches) {
            // Make sure none of the other active stations have this name
            const otherExistingStationMatchesName =
              existingStationsInTimeRange
                .filter((otherStation) => otherStation !== existingStation)
                .find((otherStation) => otherStation.name === station.name) !==
              undefined;
            if (otherExistingStationMatchesName) {
              return responseUtil.send(response, {
                statusCode: 422,
                messages: [
                  `Name ${station.name} is already in use by another active station`,
                ],
              });
            }

            // Rename the existing station with the new name.
            existingStation.name = station.name;
            existingStation.lastUpdatedById = response.locals.requestUser.id;
            stationsToUpdate[existingStation.id] = existingStation;
            if (existingStation.automatic) {
              stationsToUpdate[existingStation.id].automatic = false;
            }
            matches = true;
          } else if (nameMatches && !locationMatches) {
            // Rename the existing station to a "_moved" name, and create a new station.
            existingStation.name = `${
              existingStation.name
            }_moved_${new Date().toISOString()}`;
            existingStation.lastUpdatedById = response.locals.requestUser.id;
            stationsToUpdate[existingStation.id] = existingStation;
            stationsToCreate.push(station);
            matches = true;
          } else if (nameMatches && locationMatches) {
            // No changes required
            matches = true;
          }
        }
        if (!matches) {
          stationsToCreate.push(station);
        }
      }
      const creationParams = stationsToCreate.map((station) => ({
        name: station.name,
        location: { lat: station.lat, lng: station.lng },
        activeAt: request.body["from-date"] || new Date(),
        retiredAt: request.body["until-date"] || null,
        lastUpdatedById: response.locals.requestUser.id,
        automatic: false,
        GroupId: response.locals.group.id,
      }));
      const updates = await Promise.all([
        ...Object.values(stationsToUpdate).map((station) => station.save()),
        ...creationParams.map((params) => models.Station.create(params)),
      ]);

      const proximityWarnings = checkThatStationsAreNotTooCloseTogether([
        ...updates,
        ...existingStationsInTimeRange,
      ]);

      const responseData = {
        statusCode: 200,
        messages: [
          `Updated${
            stationsToCreate.length ? " and added" : ""
          } stations in group.`,
        ],
        stationIdsAddedOrUpdated: updates.map(({ id }) => id),
      };

      if (proximityWarnings) {
        (responseData as any).warnings = proximityWarnings;
      }
      // FIXME - validate/formalize return type.
      return responseUtil.send(response, responseData);
    }
  );

  /**
   * @api {get} /api/v1/groups/:groupIdOrName/station Add a single station.
   * @apiName CreateStation
   * @apiGroup Station
   * @apiDescription Create a single station
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiBody::ApiCreateSingleStationDataBody} station ApiStation
   * @apiParam {Date} [from-date] Start (active from) date/time for the new station as ISO timestamp (e.g. '2021-05-19T02:45:01.236Z')
   * @apiParam {Date} [until-date] End (retirement) date/time for the new station as ISO timestamp (e.g. '2021-05-19T02:45:01.236Z')
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer} stationId StationId id of new station.
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:groupIdOrName/station`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      body("station").exists().custom(jsonSchemaOf(ApiCreateStationDataSchema)),
      body("from-date").isISO8601().toDate().optional(),
      body("until-date").isISO8601().toDate().optional(),
    ]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    parseJSONField(body("station")),
    async (request: Request, response: Response) => {
      const { name, lat, lng } = response.locals.station;
      const groupId = response.locals.group.id;
      const userId = response.locals.requestUser.id;
      const location = { lat, lng };
      const fromTime = request.body["from-date"] || new Date();
      const untilTime = request.body["until-date"];
      const proximityWarnings = [];
      const activeStationsInTimeWindow =
        await models.Station.activeInGroupDuringTimeRange(
          groupId,
          fromTime,
          untilTime
        );
      for (const existingStation of activeStationsInTimeWindow) {
        if (
          latLngApproxDistance(existingStation.location, location) <
          MIN_STATION_SEPARATION_METERS
        ) {
          proximityWarnings.push(
            `New station is too close to ${existingStation.name} (#${existingStation.id}) - recordings may be incorrectly matched`
          );
        }
      }

      const nameCollision = activeStationsInTimeWindow.find(
        (existingStation) => existingStation.name === name
      );
      if (nameCollision) {
        return responseUtil.send(response, {
          statusCode: 400,
          messages: [
            `An active station with that name already exists in the time window ${fromTime.toISOString()} - ${
              (untilTime && untilTime.toISOString()) || "now"
            }.`,
          ],
        });

        // NOTE: Alternate behaviour: We rename any existing station in the active range that has the same name.
        // await nameCollision.update({ name: `${nameCollision.name}_moved` });
      }

      const station = await models.Station.create({
        name,
        location,
        activeAt: fromTime,
        retiredAt: untilTime || null,
        automatic: false,
        lastUpdatedById: userId,
        GroupId: groupId,
      });

      const responseData = {
        statusCode: 200,
        messages: ["Created station"],
        stationId: station.id,
      };
      if (proximityWarnings.length) {
        (responseData as any).warnings = proximityWarnings;
      }
      return responseUtil.send(response, responseData);
    }
  );

  /**
   * @api {get} /api/v1/groups/:groupIdOrName/station/:stationName Get station by name in group
   * @apiName GetStationInGroup
   * @apiGroup Station
   * @apiDescription Get an *active* station by name in a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiStationResponseSuccess} station Station.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName/station/:stationName`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      nameOrIdOf(param("stationName")),
      query("view-mode").optional().equals("user"),
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    // NOTE: Need this to get a "user not in group" error, otherwise would just get a "no such station" error
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    fetchAuthorizedRequiredStationByNameInGroup(
      param("groupIdOrName"),
      param("stationName")
    ),
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Got station"],
        station: mapStation(response.locals.station),
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/:groupIdOrName/stations Retrieves all stations from a group, including retired ones.
   * @apiName GetStationsForGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view stations that belong
   * to a group.q
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer|String} groupIdOrName Group name or group id
   * @apiQuery {Boolean} [only-active=false] Returns both retired and active stations by default.  Set true to only
   * return currently active stations.
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiStationResponseSuccess} stations Array of ApiStationResponse[] showing details of stations in group
   * @apiSuccessExample {JSON} ApiStationResponse:
   * [{
   *   "groupId": 1338,
   *   "createdAt": "2021-08-27T21:04:35.851Z",
   *   "id": 415,
   *   "lastUpdatedById": 2069,
   *   "location":  {
   *    "lat": -45.0, "lng": 172.9
   *   },
   *   "name": "station1",
   *   "updatedAt": "2021-08-27T21:04:35.855Z"
   * }]
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName/stations`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      query("view-mode").optional().equals("user"),
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    // NOTE: Need this to get a "user not in group" error, otherwise would just get a "no such station" error
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    fetchAuthorizedRequiredStationsForGroup(param("groupIdOrName")),
    async (request: Request, response: Response) => {
      const stations = await response.locals.stations;
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Got stations for group"],
        stations: mapStations(stations),
      });
    }
  );

  app.patch(
    `${apiUrl}/:groupIdOrName/my-settings`,
    extractJwtAuthorizedUser,
    validateFields([
      body("settings")
        .exists()
        .custom(jsonSchemaOf(ApiGroupUserSettingsSchema)),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    parseJSONField(body("settings")),
    async (request: Request, response: Response) => {
      await response.locals.group.GroupUsers.update(
        {
          settings: response.locals.settings,
        },
        {
          where: {
            UserId: response.locals.requestUser.id,
          },
        }
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Updated group settings for user"],
      });
    }
  );

  app.patch(
    `${apiUrl}/:groupIdOrName/group-settings`,
    extractJwtAuthorizedUser,
    validateFields([
      body("settings").exists().custom(jsonSchemaOf(ApiGroupSettingsSchema)),
    ]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    parseJSONField(body("settings")),
    async (request: Request, response: Response) => {
      await response.locals.group.update({
        settings: response.locals.settings,
      });
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Updated group settings"],
      });
    }
  );
}
