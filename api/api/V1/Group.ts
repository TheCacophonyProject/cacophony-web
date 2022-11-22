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
import { successResponse } from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  extractJWTInfo,
  extractValFromRequest,
  fetchAdminAuthorizedRequiredGroupByNameOrId,
  fetchAuthorizedRequiredDevicesInGroup,
  fetchAuthorizedRequiredGroupByNameOrId,
  fetchAuthorizedRequiredGroups,
  fetchAuthorizedRequiredSchedulesForGroup,
  fetchAuthorizedRequiredStationByNameInGroup,
  fetchAuthorizedRequiredStationsForGroup,
  fetchUnauthorizedOptionalGroupByNameOrId,
  fetchUnauthorizedOptionalUserByEmailOrId,
  fetchUnauthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredInvitationById,
  fetchUnauthorizedRequiredUserByEmailOrId,
  fetchUnauthorizedRequiredUserById,
  parseJSONField,
} from "../extract-middleware";
import { jsonSchemaOf } from "../schema-validation";
import ApiCreateStationDataSchema from "@schemas/api/station/ApiCreateStationData.schema.json";
import ApiGroupSettingsSchema from "@schemas/api/group/ApiGroupSettings.schema.json";
import ApiGroupUserSettingsSchema from "@schemas/api/group/ApiGroupUserSettings.schema.json";
import {
  anyOf,
  booleanOf,
  deprecatedField,
  idOf,
  nameOf,
  nameOrIdOf,
  validNameOf,
} from "../validation-middleware";
import {
  AuthorizationError,
  ClientError,
  UnprocessableError,
} from "../customErrors";
import { mapDevicesResponse } from "./Device";
import { Group } from "@/models/Group";
import { ApiGroupResponse, ApiGroupUserResponse } from "@typedefs/api/group";
import { ApiDeviceResponse } from "@typedefs/api/device";
import {
  ApiCreateStationData,
  ApiStationResponse,
} from "@typedefs/api/station";
import { ScheduleConfig } from "@typedefs/api/schedule";
import { mapSchedule } from "@api/V1/Schedule";
import { mapStation, mapStations } from "./Station";
import {
  latLngApproxDistance,
  MIN_STATION_SEPARATION_METERS,
} from "@api/V1/recordingUtil";
import { HttpStatusCode } from "@typedefs/api/consts";
import { urlNormaliseName } from "@/emails/htmlEmailUtils";
import { Op } from "sequelize";
import {
  sendAddedToGroupNotificationEmail,
  sendGroupInviteExistingMemberEmail,
  sendGroupInviteNewMemberEmail,
  sendLeftGroupNotificationEmail,
  sendRemovedFromGroupNotificationEmail,
  sendRemovedFromInvitedGroupNotificationEmail,
  sendUpdatedGroupPermissionsNotificationEmail,
} from "@/emails/transactionalEmails";
import {
  getInviteToGroupToken,
  getInviteToGroupTokenExistingUser,
} from "@api/auth";
import { GroupId, GroupInvitationId, UserId } from "@typedefs/api/common";
import { GroupInvites } from "@models/GroupInvites";
import config from "@config";

const mapGroup = (
  group: Group,
  viewAsSuperAdmin: boolean
): ApiGroupResponse => {
  const groupData: ApiGroupResponse = {
    id: group.id,
    groupName: group.groupName,
    admin: viewAsSuperAdmin || (group as any).Users[0].GroupUsers.admin,
    owner: viewAsSuperAdmin || (group as any).Users[0].GroupUsers.owner,
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
      if (!response.locals.group) {
        // Check for urlNormalised versions of group name.
        const groupName = extractValFromRequest(
          request,
          body(["groupname", "groupName"])
        );
        await fetchUnauthorizedOptionalGroupByNameOrId(
          urlNormaliseName(groupName)
        )(request, response, next);
      } else {
        next();
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.group) {
        return next(
          new ClientError("Group name in use", HttpStatusCode.Unprocessable)
        );
      }
      next();
    },
    async (request: Request, response: Response) => {
      const newGroup = await models.Group.create({
        groupName: request.body.groupname || request.body.groupName,
      });
      await newGroup.addUser(response.locals.requestUser.id, {
        // Creating user is set as the group owner by default.
        through: { admin: true, owner: true },
      });
      return successResponse(response, "Created new group.", {
        groupId: newGroup.id,
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
      // FIXME - handle deprecated field.
      return successResponse(response, { groups });
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
      return successResponse(response, {
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
      return successResponse(response, "Got devices for group", {
        devices: mapDevicesResponse(
          response.locals.devices,
          response.locals.viewAsSuperUser
        ),
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
   */
  app.get(
    `${apiUrl}/:groupIdOrName/users`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    async (request: Request, response: Response) => {
      const users = await response.locals.group.getUsers({
        attributes: ["id", "userName"],
        through: { where: { removedAt: { [Op.eq]: null } } },
      });
      const existingUsers: ApiGroupUserResponse[] = users.map(
        ({ userName, id, GroupUsers }) => {
          const user: ApiGroupUserResponse = {
            userName,
            id,
            admin: GroupUsers.admin,
            owner: GroupUsers.owner,
          };
          if (GroupUsers.pending) {
            user.pending = GroupUsers.pending;
          }
          return user;
        }
      );
      const invitedUsers = await models.GroupInvites.findAll({
        where: {
          GroupId: response.locals.group.id,
        },
      });
      const futureUsers: ApiGroupUserResponse[] = invitedUsers.map(
        ({ email, admin, owner }) => ({
          userName: email,
          admin,
          owner,
          pending: "invited",
        })
      );
      return successResponse(response, "Got users for group", {
        users: [...existingUsers, ...futureUsers],
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
      return successResponse(response, "Got schedules for group", {
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
   * @apiBody {String} email Email address of the user to add to the group.
   * @apiBody {Boolean} admin If the user should be an admin for the group.
   * @apiBody {Boolean} [owner] If the user should be marked as a group owner.
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
      anyOf(body("email").isEmail(), idOf(body("userId"))),
      booleanOf(body("admin")),
      booleanOf(body("owner")).optional().default(false),
    ]),
    // Extract required resources to validate permissions.
    fetchAdminAuthorizedRequiredGroupByNameOrId(body(["group", "groupId"])),
    // Extract secondary resource
    fetchUnauthorizedRequiredUserByEmailOrId(body(["email", "userId"])),
    async (request, response) => {
      const user = response.locals.user;
      const requestUser = response.locals.requestUser;
      const group = response.locals.group;
      const asAdmin = request.body.admin;
      const asOwner = request.body.owner;
      const { action, permissionChanges, added } =
        await models.Group.addOrUpdateGroupUser(
          group,
          user,
          asAdmin,
          asOwner,
          null
        );

      if (user.id !== requestUser.id && user.emailConfirmed) {
        // NOTE: Appropriate transactional email
        const permissions = {};
        if (permissionChanges.newAdmin && !permissionChanges.oldAdmin) {
          // User was made admin.
          (permissions as any).admin = true;
        } else if (permissionChanges.oldAdmin && !permissionChanges.newAdmin) {
          // User had admin permissions removed.
          (permissions as any).admin = false;
        }
        if (permissionChanges.newOwner && !permissionChanges.oldOwner) {
          // User had ownership bestowed.
          (permissions as any).owner = true;
        } else if (permissionChanges.oldOwner && !permissionChanges.newOwner) {
          // User had ownership removed.
          (permissions as any).owner = false;
        }

        if (added) {
          // User was added.
          // NOTE: Going forward, this would really happen via a user accepting a group invite
          await sendAddedToGroupNotificationEmail(
            request.headers.host,
            user.email,
            group.groupName,
            permissions
          );
        } else {
          // User was updated.
          await sendUpdatedGroupPermissionsNotificationEmail(
            request.headers.host,
            user.email,
            group.groupName,
            permissions
          );
        }
      }
      return successResponse(response, action);
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
   * @apiBody {Integer} [userId] id of the user to remove from the group (must supply either userId or email).
   * @apiBody {Integer} [email] email of the user to remove from the group (must supply either userId or email).
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/users`,
    extractJwtAuthorizedUser,
    validateFields([
      anyOf(nameOf(body("group")), idOf(body("groupId"))),
      anyOf(body("email").isEmail(), idOf(body("userId"))),
    ]),
    // Extract required resources to check permissions
    fetchAdminAuthorizedRequiredGroupByNameOrId(body(["group", "groupId"])),
    // Extract secondary resource
    async (request: Request, response: Response, next: NextFunction) => {
      if (request.body.userId) {
        await fetchUnauthorizedRequiredUserByEmailOrId(body("userId"))(
          request,
          response,
          next
        );
      } else if (request.body.email) {
        // We're trying to remove an invited user.
        await fetchUnauthorizedOptionalUserByEmailOrId(body("email"))(
          request,
          response,
          next
        );
      }
    },

    async (request: Request, response: Response, next: NextFunction) => {
      let removed = false;
      let wasPending = false;
      if (response.locals.user) {
        const success = await models.Group.removeUserFromGroup(
          response.locals.group,
          response.locals.user
        );
        removed = success.removed;
        wasPending = success.wasPending;
      }
      if (!removed && request.body.email) {
        // Check to see if the user was just invited, but not added, in which case we can
        // just revoke the invitation.
        const invitation = await models.GroupInvites.findOne({
          where: {
            GroupId: response.locals.group.id,
            email: request.body.email,
          },
        });
        if (invitation) {
          await invitation.destroy();
          // This user can't have confirmed their email yet, so just send
          await sendRemovedFromInvitedGroupNotificationEmail(
            request.headers.host,
            invitation.email,
            response.locals.group.groupName
          );
        }
      }
      if (removed && !wasPending) {
        if (
          response.locals.user.emailConfirmed &&
          response.locals.user.id !== response.locals.requestUser.id
        ) {
          await sendRemovedFromGroupNotificationEmail(
            request.headers.host,
            response.locals.user.email,
            response.locals.group.groupName
          );
        }
        return successResponse(response, "Removed user from the group.");
      } else if (removed && wasPending) {
        if (response.locals.user.emailConfirmed) {
          await sendRemovedFromInvitedGroupNotificationEmail(
            request.headers.host,
            response.locals.user.email,
            response.locals.group.groupName
          );
        }
        return successResponse(response, "Removed user group invitation.");
      } else {
        return next(new ClientError("Failed to remove user from the group."));
      }
    }
  );

  /**
   * @api {delete} /api/v1/groups/:groupIdOrName/leave-group Removes the calling user from the group, if they are not the last admin user.
   * @apiName UserLeaveGroup
   * @apiGroup Group
   * @apiDescription This call can remove a user from a group. The user must be a member of the group, and not the last admin user.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} groupIdOrName name or id of the group to leave.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:groupIdOrName/leave-group`,
    extractJwtAuthorizedUser,
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    async (request: Request, response: Response, next: NextFunction) => {
      const group = response.locals.group;
      const user = response.locals.requestUser;
      const groupUsers = await models.GroupUsers.findAll({
        where: {
          GroupId: group.id,
        },
      });
      const otherAdmins = groupUsers.filter(
        ({ UserId, admin }) => UserId !== user.id && admin
      );
      if (otherAdmins.length === 0) {
        return next(new ClientError("Can't remove last admin from group."));
      }

      const otherOwners = groupUsers.filter(
        ({ UserId, owner }) => UserId !== user.id && owner
      );
      if (otherOwners.length === 0) {
        return next(new ClientError("Can't remove last owner from group."));
      }

      const thisGroupUser = groupUsers.find(({ UserId }) => UserId === user.id);

      const actualUser = await models.User.findByPk(user.id);
      if (actualUser.emailConfirmed) {
        await sendLeftGroupNotificationEmail(
          request.headers.host,
          actualUser.email,
          response.locals.group.groupName
        );
      }

      // NOTE: Just mark as removed, actually remove at the end of the billing cycle.
      await thisGroupUser.update({
        removedAt: new Date(),
      });
      return successResponse(response, "User left the group.");
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
    async (request: Request, response: Response, next: NextFunction) => {
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
        return next(
          new ClientError(
            `An active station with that name already exists in the time window ${fromTime.toISOString()} - ${
              (untilTime && untilTime.toISOString()) || "now"
            }.`
          )
        );

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
      return successResponse(response, "Created station", {
        stationId: station.id,
        ...(proximityWarnings.length && { warnings: proximityWarnings }),
      });
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
      return successResponse(response, "Got station", {
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
      return successResponse(response, "Got stations for group", {
        stations: mapStations(stations),
      });
    }
  );

  // TODO (docs)
  app.patch(
    `${apiUrl}/:groupIdOrName/my-settings`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      body("settings")
        .exists()
        .custom(jsonSchemaOf(ApiGroupUserSettingsSchema)),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    parseJSONField(body("settings")),
    async (request: Request, response: Response) => {
      const groupUser = await models.GroupUsers.findOne({
        where: {
          GroupId: response.locals.group.id,
          UserId: response.locals.requestUser.id,
        },
      });
      await groupUser.update(
        {
          settings: response.locals.settings,
        },
        {
          where: {
            UserId: response.locals.requestUser.id,
          },
        }
      );
      return successResponse(response, "Updated group settings for user");
    }
  );

  // TODO (docs)
  app.patch(
    `${apiUrl}/:groupIdOrName/group-settings`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      body("settings").exists().custom(jsonSchemaOf(ApiGroupSettingsSchema)),
    ]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    parseJSONField(body("settings")),
    async (request: Request, response: Response) => {
      await response.locals.group.update({
        settings: response.locals.settings,
      });
      return successResponse(response, "Updated group settings");
    }
  );

  app.post(
    `${apiUrl}/:groupIdOrName/accept-invitation`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      body("acceptGroupInviteJWT").exists(),
      query("existing-member").optional().default(false),
    ]),
    // Decode the JWT token, get the email, userId for the token.
    extractJWTInfo(body("acceptGroupInviteJWT")),
    fetchUnauthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    async (request, response, next) => {
      if (
        (response.locals.tokenInfo._type &&
          response.locals.tokenInfo._type === "invite-new-user") ||
        response.locals.tokenInfo._type === "invite-existing-user"
      ) {
        // Make sure url group matches token group.
        if (response.locals.group.id !== response.locals.tokenInfo.group) {
          return next(new AuthorizationError("Token does not match group"));
        }
        next();
      } else {
        return next(new AuthorizationError("Invalid token type"));
      }
    },
    async (request, response, next) => {
      if (response.locals.tokenInfo._type === "invite-new-user") {
        await fetchUnauthorizedRequiredInvitationById(
          response.locals.tokenInfo.id
        )(request, response, next);
      } else if (response.locals.tokenInfo._type === "invite-existing-user") {
        if (response.locals.requestUser.id !== response.locals.tokenInfo.id) {
          return next(
            new AuthorizationError("Token does not match redeeming user")
          );
        }
        await fetchUnauthorizedRequiredUserById(response.locals.tokenInfo.id)(
          request,
          response,
          next
        );
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const actualUser = await models.User.findByPk(
        response.locals.requestUser.id
      );
      const tokenInfo = response.locals.tokenInfo as {
        _type: "invite-new-user" | "invite-existing-user";
        id: UserId | GroupInvitationId;
        group: GroupId;
      };

      if (tokenInfo._type === "invite-new-user") {
        const invitation = response.locals.groupinvite as GroupInvites;
        if (!request.query["existing-member"]) {
          if (invitation.email !== actualUser.email) {
            await invitation.destroy();
            return next(
              new AuthorizationError(
                "Invitation was sent to a different email address"
              )
            );
          }
        }
        // TODO: Can this fail?
        const { added } = await models.Group.addOrUpdateGroupUser(
          response.locals.group,
          actualUser,
          invitation.admin,
          invitation.owner,
          null
        );
        if (added && actualUser.emailConfirmed) {
          const permissions = {};
          if (invitation.admin) {
            (permissions as any).admin = true;
          }
          if (invitation.owner) {
            (permissions as any).owner = true;
          }
          await sendAddedToGroupNotificationEmail(
            request.headers.host,
            actualUser.email,
            response.locals.group.groupName,
            permissions
          );
        }
        await invitation.destroy();
      } else {
        // Existing user
        const pendingUser = await models.GroupUsers.findOne({
          where: {
            UserId: response.locals.requestUser.id,
            GroupId: response.locals.group.id,
            removedAt: { [Op.eq]: null },
            pending: "invited",
          },
        });
        if (!pendingUser) {
          return next(new AuthorizationError("Invite no longer exists"));
        }
        await pendingUser.update({ pending: null });
        if (actualUser.emailConfirmed) {
          const permissions = {};
          if (pendingUser.admin) {
            (permissions as any).admin = true;
          }
          if (pendingUser.owner) {
            (permissions as any).owner = true;
          }
          await sendAddedToGroupNotificationEmail(
            request.headers.host,
            actualUser.email,
            response.locals.group.groupName,
            permissions
          );
        }
      }
      return successResponse(response, "Joined group");
    }
  );

  if (config.server.loggerLevel === "debug") {
    // For front-end debug purposes
    app.post(
      `${apiUrl}/:groupIdOrName/get-invite-user-token`,
      extractJwtAuthorizedUser,
      validateFields([
        nameOrIdOf(param("groupIdOrName")),
        body("email").exists(),
        booleanOf(body("admin")).default(false),
        booleanOf(body("owner")).default(false),
      ]),
      fetchAdminAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
      fetchUnauthorizedOptionalUserByEmailOrId(body("email")),
      async (request: Request, response: Response, next: NextFunction) => {
        let token;
        const group = response.locals.group;
        const user = response.locals.user;
        const makeAdmin = request.body.admin;
        const makeOwner = request.body.owner;
        const requestUser = response.locals.requestUser;
        const email = request.body.email.toLowerCase().trim();
        if (!user) {
          // If the user isn't a member, there should be an invitation created,
          // and we want to get the token for that invitation.
          const existingInvite = await models.GroupInvites.findOne({
            where: { email },
          });
          if (!existingInvite) {
            return next(new AuthorizationError("Invite doesn't exist"));
          }
          token = getInviteToGroupToken(existingInvite.id, group.id);
          // Should we be able to revoke email invites?
        } else {
          const existingGroupUser = await models.GroupUsers.findOne({
            where: {
              UserId: user.id,
              GroupId: group.id,
              pending: "invited",
            },
          });
          if (existingGroupUser) {
            token = getInviteToGroupTokenExistingUser(user.id, group.id);
          } else {
            return next(new AuthorizationError("Invite doesn't exist"));
          }
        }
        return successResponse(response, "Got invite token", {
          token,
        });
      }
    );
  }

  // TODO (docs + tests)
  app.post(
    `${apiUrl}/:groupIdOrName/invite-user`,
    extractJwtAuthorizedUser,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      body("email").exists(),
      booleanOf(body("admin")).default(false),
      booleanOf(body("owner")).default(false),
    ]),
    fetchAdminAuthorizedRequiredGroupByNameOrId(param("groupIdOrName")),
    fetchUnauthorizedOptionalUserByEmailOrId(body("email")),
    async (request: Request, response: Response, next: NextFunction) => {
      const group = response.locals.group;
      const user = response.locals.user;
      const makeAdmin = request.body.admin;
      const email = request.body.email.toLowerCase().trim();
      const makeOwner = request.body.owner;
      const requestUser = response.locals.requestUser;
      // NOTE - send email to user with token to join group, expiring in 1 week.
      if (!user) {
        // If the user isn't a member, email them and invite them to create an account, with a special link to
        // accept which will then add them to the group when the account is created.
        const invitation = await models.GroupInvites.create({
          email,
          invitedBy: requestUser.id,
          GroupId: group.id,
          admin: makeAdmin,
          owner: makeOwner,
        });
        const token = getInviteToGroupToken(invitation.id, group.id);
        const actualRequestUser = await models.User.findByPk(requestUser.id);
        const sendSuccess = await sendGroupInviteNewMemberEmail(
          request.headers.host,
          token,
          actualRequestUser.email,
          group.groupName,
          actualRequestUser.userName,
          email
        );
        if (!sendSuccess) {
          await invitation.destroy();
          return next(new ClientError("Failed to send group invitation"));
        }
        // Should we be able to revoke email invites?
      } else {
        const existingGroupUser = await models.GroupUsers.findOne({
          where: {
            UserId: user.id,
            GroupId: group.id,
          },
        });
        if (existingGroupUser && existingGroupUser.pending === null) {
          return next(
            new UnprocessableError("User is already a member of group")
          );
        }
        if (
          existingGroupUser === null ||
          (existingGroupUser && existingGroupUser.pending !== null)
        ) {
          await models.Group.addOrUpdateGroupUser(
            group,
            user,
            makeAdmin,
            makeOwner,
            "invited"
          );
          const token = getInviteToGroupTokenExistingUser(user.id, group.id);
          const actualRequestUser = await models.User.findByPk(requestUser.id);
          let sendSuccess;
          if (actualRequestUser.emailConfirmed) {
            sendSuccess = await sendGroupInviteExistingMemberEmail(
              request.headers.host,
              token,
              actualRequestUser.email,
              group.groupName,
              actualRequestUser.userName,
              email
            );
          } else {
            // Still send the user an email, but send it as if they are not a current member.
            sendSuccess = await sendGroupInviteNewMemberEmail(
              request.headers.host,
              token,
              actualRequestUser.email,
              group.groupName,
              actualRequestUser.userName,
              email
            );
          }
          if (!sendSuccess) {
            await models.Group.removeUserFromGroup(group, user);
            return next(new ClientError("Failed to send group invitation"));
          }
        }
      }
      return successResponse(response, "Invited user to group");
    }
  );
}
