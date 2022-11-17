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
  booleanOf,
  idOf,
  integerOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware";
import {
  extractJwtAuthorisedSuperAdminUser,
  extractJwtAuthorizedUser,
  extractJWTInfo,
  extractOptionalJWTInfo,
  fetchAdminAuthorizedRequiredGroupById,
  fetchAdminAuthorizedRequiredGroups,
  fetchUnauthorizedOptionalUserByEmailOrId,
  fetchUnauthorizedRequiredUserByEmailOrId,
  fetchUnauthorizedRequiredUserByResetToken,
} from "../extract-middleware";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { jsonSchemaOf } from "@api/schema-validation";
import ApiUserSettingsSchema from "@schemas/api/user/ApiUserSettings.schema.json";
import { ApiGroupResponse } from "@typedefs/api/group";
import {
  sendAddedToGroupNotificationEmail,
  sendChangedEmailConfirmationEmail,
  sendGroupMembershipRequestEmail,
  sendWelcomeEmailConfirmationEmail,
  sendWelcomeEmailWithGroupsAdded,
} from "@/emails/transactionalEmails";
import { CACOPHONY_WEB_VERSION } from "@/Globals";
import { HttpStatusCode } from "@typedefs/api/consts";
import { Op } from "sequelize";

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

  const listUsersOptions = [
    extractJwtAuthorisedSuperAdminUser,
    async (request, response) => {
      const users = await models.User.getAll({});
      return successResponse(response, { usersList: mapUsers(users, true) });
    },
  ];

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

  /**
   * @api {post} /api/v1/users Register a new user
   * @apiName RegisterUser
   * @apiGroup User
   *
   * @apiParam {String} userName Username for new user.
   * @apiParam {String} password Password for new user.
   * @apiParam {String} email Email for new user.
   * @apiParam {Integer} [endUserAgreement] Version of the end user agreement accepted.
   * @apiParam {String} [inviteTokenJWT] Optional invite token if signing up via group-invite email.
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
      body("inviteTokenJWT").optional(),
    ]),
    fetchUnauthorizedOptionalUserByEmailOrId(body("email")),
    extractOptionalJWTInfo(body("inviteTokenJWT")),
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
        email: request.body.email.toLowerCase().trim(),
        endUserAgreement: request.body.endUserAgreement,
        lastActiveAt: now,
      });
      // For now, we don't want to send welcome emails on browse, just browse-next
      if (
        !request.headers.host.includes("browse.cacophony.org.nz") &&
        !request.headers.host.includes("browse-test.cacophony.org.nz")
      ) {
        // If the user is signing up from an email invitation, and the email
        // address matches the invite email address, we can mark the user's email as confirmed
        // and add them to any pending invited groups.
        let sendEmailSuccess;
        const token = response.locals.tokenInfo;
        const isSigningUpFromEmailInvitation =
          token &&
          token.exp * 1000 > new Date().getTime() &&
          token._type === "invite-new-user";
        const addedToGroups = [];
        if (isSigningUpFromEmailInvitation) {
          const oneWeekAgo = new Date(
            new Date().setDate(new Date().getDate() - 7)
          );
          // NOTE: Check if there are any pending non-expired group invites for this email address:
          const pendingInvites = await models.GroupInvites.findAll({
            where: {
              email: user.email,
              createdAt: { [Op.gt]: oneWeekAgo },
            },
          });
          for (const invitation of pendingInvites) {
            const group = await models.Group.findByPk(invitation.GroupId);
            if (group) {
              const { added } = await models.Group.addOrUpdateGroupUser(
                group,
                user,
                invitation.admin,
                invitation.owner,
                null
              );
              if (added) {
                addedToGroups.push(group);
              }
            }
            await invitation.destroy();
          }
        }
        if (addedToGroups.length) {
          // NOTE: We can now confirm the users' email address, since they signed up via an email.
          await user.update({ emailConfirmed: true });
          sendEmailSuccess = await sendWelcomeEmailWithGroupsAdded(
            request.headers.host,
            user.email,
            addedToGroups.map(({ groupName }) => groupName)
          );
        } else {
          // NOTE Send a welcome email, with a requirement to validate the email address.
          //  We won't send transactional emails until the address has been validated.
          //  While the account is unvalidated, show a banner in the site, which allows to resend the validation email.
          //  User alerts and group invitations would not be activated until the user has confirmed their email address.
          sendEmailSuccess = await sendWelcomeEmailConfirmationEmail(
            request.headers.host,
            getEmailConfirmationToken(user.id, user.email),
            user.email
          );
        }

        // NOTE: Only destroy users in a production env  if emailing fails, since
        //  otherwise we'd slow down tests too much by having to process emails for all
        //  created users.
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

  if (config.server.loggerLevel === "debug") {
    app.post(
      `${apiUrl}/get-email-confirmation-token`,
      extractJwtAuthorizedUser,
      async (request: Request, response: Response) => {
        const user = await models.User.findByPk(response.locals.requestUser.id);
        const token = getEmailConfirmationToken(user.id, user.email);
        return successResponse(response, "Got email confirmation token.", {
          token,
        });
      }
    );
  }

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
          const token = getEmailConfirmationToken(
            requestUser.id,
            dataToUpdate.email
          );
          const emailSuccess = await sendChangedEmailConfirmationEmail(
            request.headers.host,
            token,
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
      if (
        response.locals.user.password !== response.locals.resetInfo.password
      ) {
        return next(
          new UnprocessableError("Your password has already been changed")
        );
      }
      const newPasswordIsTheSameAsOld =
        await response.locals.user.comparePassword(request.body.password);
      if (newPasswordIsTheSameAsOld) {
        return next(
          new UnprocessableError(
            "New password must be different from old password"
          )
        );
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
   * @api {patch} /api/v1/users/change-password Updates a users password with reset token authentication
   * @apiName ChangePassword
   * @apiGroup User
   * @apiInterface {apiBody::ApiChangePasswordRequestBody}
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseSuccess} userData
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(`${apiUrl}/change-password`, ...changePasswordOptions);

  /**
   * @api {patch} /api/v1/users/changePassword Updates a users password with reset token authentication
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
      idOf(body("groupId")).exists(),
    ]),
    fetchUnauthorizedRequiredUserByEmailOrId(body("groupAdminEmail")),
    (request: Request, response: Response, next: NextFunction) => {
      // This is a little bit hacky, but is safe in this context.
      response.locals.originalUser = response.locals.requestUser;
      response.locals.requestUser = response.locals.user;
      return next();
    },
    fetchAdminAuthorizedRequiredGroupById(body("groupId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure each of the groups requested is found in the group admin users groups that
      // they are admin of:
      const requestingUser = await models.User.findByPk(
        response.locals.originalUser.id
      );
      const requestedOfUser = await models.User.findByPk(
        response.locals.requestUser.id
      );
      if (!requestedOfUser.emailConfirmed || !requestingUser.emailConfirmed) {
        return next(
          new ClientError(
            "Requested and/or requesting user has not activated their account"
          )
        );
      }

      const acceptToGroupRequestToken = getJoinGroupRequestToken(
        requestingUser.id,
        response.locals.group.id
      );
      const sendSuccess = await sendGroupMembershipRequestEmail(
        request.headers.host,
        acceptToGroupRequestToken,
        requestingUser.email,
        response.locals.group.groupName,
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
      body("membershipRequestJWT").exists(),
      booleanOf(body("admin")).optional().default(false),
      booleanOf(body("owner")).optional().default(false),
    ]),
    extractJWTInfo(body("membershipRequestJWT")),
    async (request, response, next) => {
      await fetchAdminAuthorizedRequiredGroupById(
        response.locals.tokenInfo.group
      )(request, response, next);
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const { id, _type } = response.locals.tokenInfo;
      if (_type !== "join-group") {
        return next(new AuthorizationError("Invalid token type"));
      }
      const existingUserOfGroup = await models.GroupUsers.findOne({
        where: {
          UserId: id,
          GroupId: response.locals.group.id,
        },
      });
      if (existingUserOfGroup) {
        return next(new UnprocessableError("User already belongs to group"));
      }
      const userToGrantMembershipFor = await models.User.findByPk(id);
      if (!userToGrantMembershipFor) {
        return next(new UnprocessableError("User no longer exists"));
      }
      const asAdmin = request.body.admin;
      const asOwner = request.body.owner;
      const permissions = {};
      if (asAdmin) {
        (permissions as any).admin = true;
      }
      if (asOwner) {
        (permissions as any).owner = true;
      }
      await models.Group.addOrUpdateGroupUser(
        response.locals.group,
        userToGrantMembershipFor,
        asAdmin,
        asOwner,
        null
      );
      if (userToGrantMembershipFor.emailConfirmed) {
        await sendAddedToGroupNotificationEmail(
          request.headers.host,
          userToGrantMembershipFor.email,
          response.locals.group.groupName,
          permissions
        );
      }
      return successResponse(response, "Allowed to add user.", {
        userId: id,
        userName: userToGrantMembershipFor.userName,
      });
    }
  );
}
