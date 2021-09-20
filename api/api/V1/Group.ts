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

import middleware, { validateFields } from "../middleware";
import auth from "../auth";
import models from "../../models";
import responseUtil from "./responseUtil";
import { body, param, query } from "express-validator";
import { Application, NextFunction, Request, Response } from "express";
import {
  extractGroupByNameOrId,
  parseJSONField,
  extractUserByNameOrId,
  extractValidJWT,
  extractViewMode,
} from "../extract-middleware";
import logger from "../../logging";
import { arrayOf, jsonSchemaOf } from "../schema-validation";
import ApiCreateStationDataSchema from "../../../types/jsonSchemas/api/station/ApiCreateStationData.schema.json";
import {
  booleanOf,
  eitherOf,
  idOf,
  nameOf,
  nameOrIdOf,
  validNameOf,
} from "../validation-middleware";
import { ClientError } from "../customErrors";

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
   * @apiParam {String} groupname Unique group name.
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    extractValidJWT,
    validateFields([validNameOf(body("groupname"))]),
    auth.authenticateAndExtractUser,
    async (request: Request, response: Response, next: NextFunction) => {
      const existingGroup = await models.Group.getFromName(
        request.body.groupname
      );
      if (existingGroup !== null) {
        return next(new ClientError("Group name in use", 400));
      }
      next();
    },
    async (request: Request, response: Response) => {
      const newGroup = await models.Group.create({
        groupname: request.body.groupname,
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
   * @apiParam {JSON} where [Sequelize where conditions](http://docs.sequelizejs.com/manual/tutorial/querying.html#where) for query.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {ApiGroup[]} groups Array of ApiGroup[]
   * @apiSuccess {Number} groups.id Identifier of the group
   * @apiSuccess {String} groups.groupname Name of the group
   * @apiSuccess {ApiGroupUserRelation[]} groups.Users List of all associated group users and their relationship to the group
   * @apiSuccess {ApiGroupUser[]} groups.GroupUsers List of users associated with the group
   * @apiSuccess {ApiDeviceIdAndName[]} groups.Devices List of devices associated with the group
   * @apiSuccessExample {JSON} ApiGroup:
   * {
   *   id: number;
   *   groupname: string;
   *   Users: ApiGroupUserRelation[];
   *   Devices: ApiDeviceIdAndName[];
   *   GroupUsers: ApiGroupUser[];
   * }
   * @apiUse ApiGroupUserRelation
   * @apiUse ApiDeviceIdAndName
   * @apiUse ApiGroupUser
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    extractValidJWT,
    // FIXME deprecate this where query!  Realistically, do we ever use it?
    validateFields([
      middleware.parseJSON("where", query).optional(),
      query("view-mode").optional().equals("user"),
    ]),
    auth.authenticateAndExtractUser,
    extractViewMode,
    async (request: Request, response: Response) => {
      const groups = await models.Group.query(
        request.query.where || {},
        response.locals.requestUser,
        response.locals.viewAsSuperAdmin
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        groups,
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/{groupNameOrId} Get a group by name or id
   * @apiName GetGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view details of a group.
   *
   * @apiParam {Number|String} groupIdOrName group id or group name
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {ApiGroup[]} groups Array of ApiGroup[] (but should only contain one item)
   * @apiSuccess {Number} groups.id Identifier of the group
   * @apiSuccess {String} groups.groupname Name of the group
   * @apiSuccess {ApiGroupUserRelation[]} groups.Users Relationship between current user and the group
   * @apiSuccess {ApiGroupUser[]} groups.GroupUsers List of users associated with the group
   * @apiSuccess {ApiDeviceIdAndName[]} groups.Devices List of devices associated with the group
   * @apiSuccessExample {JSON} ApiGroup:
   * {
   *   id: number;
   *   groupname: string;
   *   Users: ApiGroupUserRelation[];
   *   Devices: ApiDeviceIdAndName[];
   *   GroupUsers: ApiGroupUser[];
   * }
   * @apiUse ApiGroupUserRelation
   * @apiUse ApiDeviceIdAndName
   * @apiUse ApiGroupUser
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName`,
    extractValidJWT,
    validateFields([
      nameOrIdOf(param("groupIdOrName")),
      query("view-mode").optional().equals("user"),
    ]),
    auth.authenticateAndExtractUser,
    extractGroupByNameOrId("params", "groupIdOrName", "groupIdOrName"),
    auth.userHasAccessToGroup,
    extractViewMode,
    async (request: Request, response: Response) => {
      // FIXME - We are likely returning way too much and the kitchen sink information here
      // Who uses this function?
      const groups = await models.Group.query(
        { id: response.locals.group.id },
        response.locals.requestUser,
        response.locals.viewAsSuperAdmin
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        groups,
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/{groupIdOrName}/devices Retrieves all active devices for a group.
   * @apiName GetDevicesForGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view devices that belong
   * to a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number|String} groupIdOrName group id or group name
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {ApiGroupsDevice[]} devices List of devices associated with the group
   * @apiSuccessExample {JSON} ApiGroupsDevice:
   * {
   *   id: number;
   *   deviceName: string;
   * }

   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName/devices`,
    extractValidJWT,
    validateFields([nameOrIdOf(param("groupIdOrName"))]),
    auth.authenticateAndExtractUser,
    extractGroupByNameOrId("params", "groupIdOrName", "groupIdOrName"),
    auth.userHasAccessToGroup,
    async (request: Request, response: Response) => {
      // FIXME - should active devices be a request flag?
      const devices = await response.locals.group.getDevices({
        where: { active: true },
        attributes: ["id", "devicename"],
      });
      return responseUtil.send(response, {
        statusCode: 200,
        devices: devices.map(({ id, devicename }) => ({
          id,
          deviceName: devicename,
        })),
        messages: ["Got devices for group"],
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/{groupIdOrName}/users Retrieves all users for a group.
   * @apiName GetUsersForGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view users that belong
   * to a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number|String} groupIdOrName group id or group name
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {ApiGroupUser[]} users Array of ApiGroupUser listing users assigned to this group
   * @apiUse V1ResponseError
   * @apiSuccessExample {JSON} ApiGroupUser:
   * {
   *  "id":456,
   *  "userName":"user name",
   *  "isGroupAdmin":true
   * }

   *
   */
  app.get(
    `${apiUrl}/:groupIdOrName/users`,
    extractValidJWT,
    validateFields([nameOrIdOf(param("groupIdOrName"))]),
    auth.authenticateAndExtractUser,
    extractGroupByNameOrId("params", "groupIdOrName", "groupIdOrName"),
    auth.userHasAccessToGroup,
    async (request: Request, response: Response) => {
      const users = await response.locals.group.getUsers({
        attributes: ["id", "username"],
      });
      return responseUtil.send(response, {
        statusCode: 200,
        users: users.map(({ username, id, GroupUsers }) => ({
          userName: username,
          id,
          isGroupAdmin: GroupUsers.admin,
          relation: "group",
        })),
        messages: ["Got users for group"],
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
   * @apiParam {String} group name of the group.
   * @apiParam {String} username name of the user to add to the group.
   * @apiParam {Boolean} admin If the user should be an admin for the group.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */

  // TODO(jon): Would be nicer as /api/v1/groups/:groupName/users or something
  app.post(
    `${apiUrl}/users`,
    extractValidJWT,
    validateFields([
      eitherOf(nameOf(body("group")), idOf(body("groupId"))),
      eitherOf(nameOf(body("username")), idOf(body("userId"))),
      booleanOf(body("admin")),
    ]),
    // Extract required resources to validate permissions.
    extractGroupByNameOrId("body", "group", "groupId"),
    auth.authenticateAndExtractUser,
    auth.userHasAdminAccessToGroup,
    // Extract secondary resource
    extractUserByNameOrId("body", "username", "userId"),
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
   * @apiParam {String} group name of the group.
   * @apiParam {String} username username of user to remove from the group.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/users`,
    extractValidJWT,
    validateFields([
      eitherOf(nameOf(body("group")), idOf(body("groupId"))),
      eitherOf(nameOf(body("username")), idOf(body("userId"))),
    ]),
    // Extract required resources to check permissions
    extractGroupByNameOrId("body", "group", "groupId"),
    auth.authenticateAndExtractUser,
    // Check user permissions for resources
    auth.userHasAdminAccessToGroup,
    // Extract secondary resource
    extractUserByNameOrId("body", "username", "userId"),
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
   * @api {post} /api/v1/groups/{groupIdOrName}/stations Add, Update and retire current stations belonging to group
   * @apiName PostStationsForGroup
   * @apiGroup Group
   * @apiDescription A group admin or an admin with globalWrite permissions can update stations for a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number|String} groupNameOrId group name or group id
   * @apiParam {Station[]} stations Json array of ApiStation[]
   * @apiParam {Date} fromDate Start date/time for the new station as ISO timestamp (e.g. '2021-05-19T02:45:01.236Z')
   * @apiParamExample {json} ApiStation:
   * {
   *   name: "Station Name:,
   *   lat: -45.1,
   *   lng: 172.0
   * }
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number[]} stationIdsAddedOrUpdated Array of Identifiers of stations added or updated.
   * @apiSuccess {JSON} updatedRecordingsPerStation Hash of {stationId:recordingId, ...} showing recordings updated
   * by the request.
   * @apiSuccess {string} warnings Warnings showing data validation rule breaches for the applied stations.
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:groupIdOrName/stations`,
    extractValidJWT,
    validateFields([
      body("stations")
        .exists()
        .custom(jsonSchemaOf(arrayOf(ApiCreateStationDataSchema))),
      body("fromDate").isISO8601().toDate().optional(),
      nameOrIdOf(param("groupIdOrName")),
    ]),
    // Extract required resources
    auth.authenticateAndExtractUser,
    extractGroupByNameOrId("params", "groupIdOrName", "groupIdOrName"),
    // Check permissions
    auth.userHasAdminAccessToGroup,
    // Extract further non-dependent resources:
    parseJSONField("body", "stations"),
    async (request, response) => {
      const stationsUpdated = await models.Group.addStationsToGroup(
        response.locals.requestUser,
        response.locals.group,
        response.locals.stations,
        request.body.fromDate
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Added stations to group."],
        ...stationsUpdated,
      });
    }
  );

  /**
   * @api {get} /api/v1/groups/{groupIdOrName}/stations Retrieves all stations from a group, including retired ones.
   * @apiName GetStationsForGroup
   * @apiGroup Group
   * @apiDescription A group member or an admin member with globalRead permissions can view stations that belong
   * to a group.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number|String} groupIdOrName Group name or group id
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {ApiStationDetail[]} stations Array of ApiStationDetail[] showing details of stations in group
   * @apiSuccess {Number} stations.id Id of station
   * @apiSuccess {Number} stations.GroupId Id of the group to which the station belongs
   * @apiSuccess {String} stations.createdAt Timestamp station was created
   * (Note: this is the database record creation date, not the user-supplied fromDate)
   * @apiSuccess {String} stations.retiredAt Timestamp station was retired
   * @apiSuccess {String} stations.updatedAt Timestamp station was last updated
   * @apiSuccess {Number} stations.lastUpdatedById Id of the user account last used to update the station
   * @apiSuccess {ApiLocation} stations.location JSON detailing location of the station
   * @apiSuccess {String} stations.name Name of the station
   * @apiSuccessExample {JSON} ApiStationDetail:
   * {
   *   GroupId: 1338,
   *   createdAt: "2021-08-27T21:04:35.851Z",
   *   id: 415,
   *   lastUpdatedById: 2069,
   *   location:  ApiLocation,
   *   name: "station1",
   *   retiredAt: null,
   *   updatedAt: "2021-08-27T21:04:35.855Z"
   * }
   * @apiSuccessExample {JSON} ApiLocation:
   * Note: these coordinates are currently reversed (Issue 73).
   * {
   *   type: 'Point',
   *   coordinates: [ -45.0, 172.9 ]
   * }
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:groupIdOrName/stations`,
    extractValidJWT,
    validateFields([nameOrIdOf(param("groupIdOrName"))]),
    extractGroupByNameOrId("params", "groupIdOrName", "groupIdOrName"),
    auth.authenticateAndExtractUser,
    auth.userHasAccessToGroup,
    async (request: Request, response: Response) => {
      // FIXME - A flag to only get non-retired stations?
      const stations = await response.locals.group.getStations();
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Got stations for group"],
        stations,
      });
    }
  );
}
