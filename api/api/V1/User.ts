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

import { expectedTypeOf, validateFields } from "../middleware";
import {
  generateAuthTokensForUser,
  getEmailConfirmationToken,
  getJoinGroupRequestToken,
} from "../auth";
import models from "@models";
import { successResponse } from "./responseUtil";
import { body, matchedData, param, query } from "express-validator";
import {
  AuthorizationError,
  ClientError,
  FatalError,
  UnprocessableError,
  ValidationError,
} from "../customErrors";
import { Application, NextFunction, Request, Response } from "express";
import config from "@config";
import { User } from "@models/User";
import {
  anyOf,
  idOf,
  integerOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware";
import {
  extractJwtAuthorisedSuperAdminUser,
  extractJwtAuthorizedUser,
  extractJWTInfo,
  fetchAdminAuthorizedRequiredGroups,
  fetchUnauthorizedOptionalUserByEmailOrId,
  fetchUnauthorizedRequiredUserByEmailOrId,
  fetchUnauthorizedRequiredUserByResetToken,
} from "../extract-middleware";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { arrayOf, jsonSchemaOf } from "@api/schema-validation";
import ApiUserSettingsSchema from "@schemas/api/user/ApiUserSettings.schema.json";
import { sendEmailConfirmationEmail } from "@/scripts/emailUtil";
import { ApiGroupResponse } from "@typedefs/api/group";
import GroupIdSchema from "@schemas/api/common/GroupId.schema.json";
import {
  sendAddedToGroupNotificationEmail,
  sendGroupMembershipRequestEmail,
  sendWelcomeEmailConfirmationEmail,
} from "@/emails/transactionalEmails";
import { CACOPHONY_WEB_VERSION } from "@/Globals";
import { HttpStatusCode } from "@typedefs/api/consts";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiLoggedInUsersResponseSuccess {
  usersList: ApiLoggedInUserResponse[];
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiLoggedInUserResponseSuccess {
  userData: ApiLoggedInUserResponse;
}
export const mapUser = (
  user: User,
  omitSettings = false
): ApiLoggedInUserResponse => {
  const userData: ApiLoggedInUserResponse = {
    id: user.id,
    userName: user.userName,
    email: user.email,
    emailConfirmed: user.emailConfirmed,
    globalPermission: user.globalPermission,
    endUserAgreement: user.endUserAgreement,
  };
  if (user.settings && !omitSettings) {
    userData.settings = user.settings;
  }
  return userData;
};

export const mapUsers = (users: User[], omitSettings = false) =>
  users.map((user) => mapUser(user, omitSettings));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiChangePasswordRequestBody {
  password: string; // Password for the user account
  token: string; // Valid password reset token
}

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/users`;

  /**
   * @api {post} /api/v1/users Register a new user
   * @apiName RegisterUser
   * @apiGroup User
   *
   * @apiParam {String} userName Username for new user.
   * @apiParam {String} password Password for new user.
   * @apiParam {String} email Email for new user.
   * @apiParam {Integer} [endUserAgreement] Version of the end user agreement accepted.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} token JWT for authentication. Contains the user ID and type.
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseSuccess}
   *
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    validateFields([
      anyOf(validNameOf(body("username")), validNameOf(body("userName"))),
      body("email").isEmail(),
      validPasswordOf(body("password")),
      body("endUserAgreement").isInt().optional(),
    ]),
    fetchUnauthorizedOptionalUserByEmailOrId(body("email")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.user) {
        return next(
          new ValidationError([
            { msg: "Email address in use", location: "body", param: "email" },
          ])
        );
      } else {
        next();
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      if (
        request.body.endUserAgreement &&
        Number(request.body.endUserAgreement) !== config.euaVersion
      ) {
        return next(
          new ValidationError([
            {
              msg: "Out of date end user agreement version specified",
              location: "body",
              param: "endUserAgreement",
            },
          ])
        );
      } else {
        next();
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const now = new Date().toISOString();
      const user: User = await models.User.create({
        userName: request.body.username || request.body.userName,
        password: request.body.password,
        email: request.body.email,
        endUserAgreement: request.body.endUserAgreement,
        lastActiveAt: now,
      });
      // For now, we don't want to send welcome emails on browse, just browse-next
      if (
        !request.headers.host.includes("browse.cacophony.org.nz") &&
        !request.headers.host.includes("browse-test.cacophony.org.nz")
      ) {
        //  && !config.productionEnv
        // NOTE Send a welcome email, with a requirement to validate the email address.
        //  We won't send transactional emails until the address has been validated.
        //  While the account is unvalidated, show a banner in the site, which allows to resend the validation email.
        //  User alerts and group invitations would not be activated until the user has confirmed their email address.
        const sendEmailSuccess = await sendWelcomeEmailConfirmationEmail(
          getEmailConfirmationToken(user.id, user.email),
          user.email
        );
        if (!sendEmailSuccess && config.productionEnv) {
          // In this case, we don't want to create the user.
          await user.destroy();
          return next(
            new FatalError("Failed to send welcome/email confirmation email.")
          );
        }
      }
      const { refreshToken, apiToken } = await generateAuthTokensForUser(
        user,
        request.headers["viewport"] as string,
        request.headers["user-agent"]
      );
      return successResponse(response, "Created new user.", {
        token: apiToken,
        refreshToken,
        userData: mapUser(user),
      });
    }
  );

  /**
   * @api {patch} /api/v1/users Updates the authenticated user's details
   * @apiName UpdateUser
   * @apiGroup User
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} [userName] New full name to set.
   * @apiParam {String} [password] New password to set.
   * @apiParam {String} [email] New email to set.
   * @apiParam {Number} [endUserAgreement] New version of the end user agreement accepted to set.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      // FIXME - When passing unknown parameters here, the error returned isn't very useful.
      anyOf(
        validNameOf(body("username")),
        validNameOf(body("userName")),
        body("email").isEmail(),
        validPasswordOf(body("password")),
        integerOf(body("endUserAgreement")),
        body("settings").custom(jsonSchemaOf(ApiUserSettingsSchema))
      ),
    ]),
    async (request: Request, Response: Response, next: NextFunction) => {
      if (
        request.body.email &&
        !(await models.User.freeEmail(request.body.email))
      ) {
        return next(
          new ValidationError([
            { msg: "Email address in use", location: "body", param: "email" },
          ])
        );
      } else {
        next();
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      // map matchedData to db fields.
      const dataToUpdate = matchedData(request);
      const requestUser = await models.User.findByPk(
        response.locals.requestUser.id
      );
      if (dataToUpdate.email) {
        // If the user has changed their email, we'll need to send
        // another confirmation email.
        dataToUpdate.emailConfirmed = false;
        if (
          !request.headers.host.includes("browse.cacophony.org.nz") &&
          !request.headers.host.includes("browse-test.cacophony.org.nz")
        ) {
          const emailSuccess = await sendEmailConfirmationEmail(
            requestUser,
            dataToUpdate.email
          );
          if (!emailSuccess && config.productionEnv) {
            return next(
              new FatalError("Failed to send email confirmation email.")
            );
          }
        }
      }
      await requestUser.update(dataToUpdate);
      return successResponse(response, "Updated user.");
    }
  );

  /**
   * @api {get} api/v1/users/:userEmailOrId Get details for a user
   * @apiName GetUser
   * @apiGroup User
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseSuccess}
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:userEmailOrId`,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      anyOf(param("userEmailOrId").isEmail(), idOf(param("userEmailOrId"))),
    ]),
    fetchUnauthorizedRequiredUserByEmailOrId(param("userEmailOrId")),
    (request: Request, response: Response, next: NextFunction) => {
      if (
        (response.locals.requestUser.hasGlobalRead() &&
          response.locals.viewAsSuperUser) ||
        response.locals.requestUser.id === response.locals.user.id
      ) {
        return next();
      } else {
        return next(
          new ClientError(
            "User doesn't have permissions to view other user details",
            HttpStatusCode.Forbidden
          )
        );
      }
    },
    async (request, response) => {
      return successResponse(response, {
        userData: mapUser(response.locals.user),
      });
    }
  );

  const listUsersOptions = [
    extractJwtAuthorisedSuperAdminUser,
    async (request, response) => {
      const users = await models.User.getAll({});
      return successResponse(response, { usersList: mapUsers(users, true) });
    },
  ];

  /**
   * @api {get} api/v1/listUsers List usernames
   * @apiName ListUsers
   * @apiGroup User
   * @apiDescription Given an authenticated super-user, we need to be able to get
   * a list of all email addresses on the system, so that we can switch to viewing
   * as a given user.
   * @apiDeprecated Use /api/v1/users/list-users
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiSuccess::ApiLoggedInUsersResponseSuccess}
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(`${baseUrl}/listUsers`, ...listUsersOptions);

  /**
   * @api {get} api/v1/users/list-users List usernames
   * @apiName ListUsers
   * @apiGroup User
   * @apiDescription Given an authenticated super-user, we need to be able to get
   * a list of all usernames on the system, so that we can switch to viewing
   * as a given user.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiInterface {apiSuccess::ApiLoggedInUsersResponseSuccess}
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(`${apiUrl}/list-users`, ...listUsersOptions);

  const endUserAgreementOptions = [
    async (request, response) => {
      return successResponse(response, { euaVersion: config.euaVersion });
    },
  ];

  /**
   * @api {get} /api/v1/endUserAgreement/latest Get the latest end user agreement version
   * @apiName EndUserAgreementVersion
   * @apiGroup User
   * @apiDeprecated Use /api/v1/end-user-agreement/latest
   *
   * @apiSuccess {Integer} euaVersion Version of the latest end user agreement.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(`${baseUrl}/endUserAgreement/latest`, ...endUserAgreementOptions);

  /**
   * @api {get} /api/v1/end-user-agreement/latest Get the latest end user agreement version
   * @apiName EndUserAgreementVersion
   * @apiGroup User
   *
   * @apiSuccess {Integer} euaVersion Version of the latest end user agreement.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(`${baseUrl}/end-user-agreement/latest`, ...endUserAgreementOptions);

  if (!config.productionEnv) {
    // TODO(docs) - This is just for test/debug purposes to increment the EUA version and test that the UI prompts.
    app.post(
      `${baseUrl}/end-user-agreement/debug-increment`,
      async (request: Request, response: Response) => {
        config.euaVersion++;
        return successResponse(response, "Incremented EUA version", {
          euaVersion: config.euaVersion,
        });
      }
    );

    // TODO(docs) - This is just for test/debug purposes to increment the CW version and test that the UI prompts to refresh.
    app.post(
      `${baseUrl}/cacophony-web/debug-increment`,
      async (request: Request, response: Response) => {
        CACOPHONY_WEB_VERSION.version += ".1";
        return successResponse(response, "Incremented Cacophony web version");
      }
    );
  }

  const changePasswordOptions = [
    validateFields([body("token").exists(), validPasswordOf(body("password"))]),
    fetchUnauthorizedRequiredUserByResetToken(body("token")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.user.password != response.locals.resetInfo.password) {
        return next(new ClientError("Your password has already been changed"));
      }
      const result = await response.locals.user.update({
        password: request.body.password,
      });
      if (!result) {
        return next(
          new ClientError("Error changing password please contact sys admin")
        );
      }
      const { refreshToken, apiToken } = await generateAuthTokensForUser(
        response.locals.user,
        request.headers["viewport"] as string,
        request.headers["user-agent"]
      );
      return successResponse(response, {
        token: apiToken,
        refreshToken,
        userData: mapUser(response.locals.user),
      });
    },
  ];

  /**
   * @api {patch} /api/v1/user/change-password Updates a users password with reset token authentication
   * @apiName ChangePassword
   * @apiGroup User
   * @apiInterface {apiBody::ApiChangePasswordRequestBody}
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseSuccess} userData
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(`${apiUrl}/change-password`, ...changePasswordOptions);

  /**
   * @api {patch} /api/v1/user/changePassword Updates a users password with reset token authentication
   * @apiName ChangePassword
   * @apiGroup User
   * @apiInterface {apiBody::ApiChangePasswordRequestBody}
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseSuccess} userData
   * @apiDeprecated Use /api/v1/users/change-password
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(`${apiUrl}/changePassword`, ...changePasswordOptions);

  // TODO (docs)
  app.post(
    `${apiUrl}/accept-group-invite`,
    validateFields([body("inviteToken").exists()]),
    extractJWTInfo(body("inviteToken")),
    // Get a token with user, and group id to add to.
    async (request: Request, response: Response, next: NextFunction) => {
      const { id, groupId, admin, inviterId } = response.locals.tokenInfo;
      const [user, group, inviter] = await Promise.all([
        models.User.findByPk(id),
        models.Group.findByPk(groupId),
        models.User.findByPk(inviterId),
      ]);
      if (!inviter) {
        return next(new UnprocessableError("Inviting user no longer exists"));
      }
      if (!user) {
        return next(new UnprocessableError("User no longer exists"));
      }
      if (!group) {
        return next(new UnprocessableError("Group no longer exists"));
      }
      // TODO:
      // Check if the user already belongs to the group.
      // Check if the user giving permissions is still an admin member of the group in question.
      return successResponse(response, "Added to invited group");
    }
  );

  // TODO(docs) - This returns limited info about groups that a user with this email address is admin of.
  app.get(
    `${apiUrl}/groups-for-admin-user/:emailAddress`,
    extractJwtAuthorizedUser,
    validateFields([param("emailAddress").isEmail()]),
    fetchUnauthorizedRequiredUserByEmailOrId(param("emailAddress")),
    (request: Request, response: Response, next: NextFunction) => {
      // This is a little bit hacky, but is safe in this context.
      response.locals.requestUser = response.locals.user;
      return next();
    },
    fetchAdminAuthorizedRequiredGroups,
    async (request: Request, response: Response) => {
      const groups: ApiGroupResponse[] = response.locals.groups.map(
        ({ id, groupName }) => ({ id, groupName, admin: false })
      );
      return successResponse(response, "Got groups for admin user", {
        groups,
      });
    }
  );

  app.post(
    `${apiUrl}/request-group-membership`,
    extractJwtAuthorizedUser,
    validateFields([
      body("groupAdminEmail").isEmail(),
      body("groups")
        .exists()
        .withMessage(expectedTypeOf("GroupId[]"))
        .bail()
        .custom(jsonSchemaOf(arrayOf(GroupIdSchema))),
    ]),
    fetchUnauthorizedRequiredUserByEmailOrId(body("groupAdminEmail")),
    (request: Request, response: Response, next: NextFunction) => {
      // This is a little bit hacky, but is safe in this context.
      response.locals.originalUser = response.locals.requestUser;
      response.locals.requestUser = response.locals.user;
      return next();
    },
    fetchAdminAuthorizedRequiredGroups,
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure each of the groups requested is found in the group admin users groups that
      // they are admin of:
      const requestingUser = await models.User.findByPk(
        response.locals.originalUser.id
      );
      const requestedOfUser = await models.User.findByPk(
        response.locals.requestUser.id
      );
      if (!requestedOfUser.emailConfirmed) {
        return next(
          new ClientError("Requested has has not activated their account")
        );
      }
      for (const groupId of request.body.groups) {
        if (!response.locals.groups.find(({ id }) => id === groupId)) {
          return next(new ClientError("User is not a group admin"));
        }
      }
      const joinGroups = response.locals.groups.filter(({ id }) =>
        request.body.groups.includes(id)
      );
      const acceptToGroupRequestToken = getJoinGroupRequestToken(
        requestingUser.id,
        request.body.groups
      );
      const sendSuccess = await sendGroupMembershipRequestEmail(
        acceptToGroupRequestToken,
        requestingUser.email,
        joinGroups.map(({ groupName }) => groupName),
        requestedOfUser.email
      );
      if (sendSuccess) {
        return successResponse(response, "Sent membership request to user");
      } else {
        return next(
          new FatalError("Failed sending membership request email to user")
        );
      }
    }
  );

  app.post(
    `${apiUrl}/validate-group-membership-request`,
    extractJwtAuthorizedUser,
    validateFields([
      body("membershipRequest").exists(),
      body("admin").isArray().exists(),
    ]),
    extractJWTInfo(body("membershipRequest")),
    fetchAdminAuthorizedRequiredGroups,
    async (request: Request, response: Response, next: NextFunction) => {
      // FIXME - make sure all of these JWT tokens have a 'type' field that we can check against,
      // to make sure they can't be reused for other requests.
      const { id, type, groups } = response.locals.tokenInfo;
      if (type !== "join-groups") {
        return next(new AuthorizationError("Invalid token type"));
      }
      const userToGrantMembershipFor = await models.User.findByPk(id);
      if (!userToGrantMembershipFor) {
        return next(new UnprocessableError("User no longer exists"));
      }

      if (groups.length !== request.body.admin.length) {
        return next(
          new UnprocessableError("Mismatched groups and permissions count")
        );
      }
      const groupsWithPermissions = [];
      for (let i = 0; i < groups.length; i++) {
        groupsWithPermissions.push({
          groupId: groups[i],
          admin: Boolean(request.body.admin[i]),
        });
      }

      // Check that all the groups in the request match groups that the current user is an admin of:
      const groupsUserIsAdminFor = response.locals.groups.map(({ id }) => id);
      const groupsToAdd = groupsWithPermissions
        .filter(({ groupId }) => groupsUserIsAdminFor.includes(groupId))
        .map(({ groupId, admin }) => ({
          group: response.locals.groups.find(({ id }) => id === groupId),
          admin,
        }));
      if (groupsToAdd.length === 0) {
        return next(
          new ClientError("No longer admin for any of the requested groups")
        );
      }

      // Now add the user to the requested groups, with permissions.
      const additions = [];
      for (const { group, admin } of groupsToAdd) {
        additions.push(
          models.Group.addUserToGroup(group, userToGrantMembershipFor, admin)
        );
      }
      await Promise.all(additions);
      // Let the requesting user know that they've now been added to the groups.
      await sendAddedToGroupNotificationEmail(
        userToGrantMembershipFor.email,
        groupsToAdd.map(({ group: { groupName } }) => groupName)
      );
      return successResponse(response, "Allowed to add user.", {
        userId: id,
        userName: userToGrantMembershipFor.userName,
      });
    }
  );
}
