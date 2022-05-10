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
import { generateAuthTokensForUser } from "../auth";
import models from "@models";
import responseUtil from "./responseUtil";
import { body, param, matchedData, query } from "express-validator";
import { ClientError, ValidationError } from "../customErrors";
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
  fetchAdminAuthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedOptionalUserByNameOrEmailOrId,
  fetchUnauthorizedOptionalUserByNameOrId,
  fetchUnauthorizedRequiredGroupById,
  fetchUnauthorizedRequiredUserByNameOrEmailOrId,
  fetchUnauthorizedRequiredUserByNameOrId,
  fetchUnauthorizedRequiredUserByResetToken,
} from "../extract-middleware";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { jsonSchemaOf } from "@api/schema-validation";
import ApiUserSettingsSchema from "@schemas/api/user/ApiUserSettings.schema.json";
import {
  sendEmailConfirmationEmail,
  sendWelcomeEmailConfirmationEmail,
} from "@/scripts/emailUtil";
import logger from "@log";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiLoggedInUsersResponseSuccess {
  usersList: ApiLoggedInUserResponse[];
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiLoggedInUserResponseSuccess {
  userData: ApiLoggedInUserResponse;
}
export const mapUser = (user: User): ApiLoggedInUserResponse => {
  const userData: ApiLoggedInUserResponse = {
    id: user.id,
    userName: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    emailConfirmed: user.emailConfirmed,
    globalPermission: user.globalPermission,
    endUserAgreement: user.endUserAgreement,
  };
  if (user.settings) {
    userData.settings = user.settings;
  }
  return userData;
};

export const mapUsers = (users: User[]) => users.map(mapUser);

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
   * @apiInterface {apiSuccess::ApiLoggedInUsersResponseSuccess}
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
    fetchUnauthorizedOptionalUserByNameOrId(body(["username", "userName"])),
    (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.user) {
        return next(
          new ValidationError([
            { msg: "Username in use", location: "body", param: "userName" },
          ])
        );
      } else {
        next();
      }
    },
    async (request: Request, Response: Response, next: NextFunction) => {
      if (!(await models.User.freeEmail(request.body.email))) {
        return next(
          new ValidationError([
            { msg: "Email address in use", location: "body", param: "email" },
          ])
        );
      } else {
        next();
      }
    },
    async (request: Request, Response: Response, next: NextFunction) => {
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
    async (request: Request, response: Response) => {
      const now = new Date().toISOString();
      const user: User = await models.User.create({
        username: request.body.username || request.body.userName,
        password: request.body.password,
        email: request.body.email,
        endUserAgreement: request.body.endUserAgreement,
        lastActiveAt: now,
      });

      // NOTE Send a welcome email, with a requirement to validate the email address.
      //  We won't send transactional emails until the address has been validated.
      //  While the account is unvalidated, show a banner in the site, which allows to resend the validation email.
      //  User alerts and group invitations would not be activated until the user has confirmed their email address.
      await sendWelcomeEmailConfirmationEmail(user);
      const { refreshToken, expiry, apiToken } =
        await generateAuthTokensForUser(
          user,
          request.headers["viewport"] as string,
          request.headers["user-agent"]
        );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Created new user."],
        token: apiToken,
        refreshToken,
        expiry,
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
   * @apiParam {String} [userName] New username to set.
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
        (request.body.username || request.body.userName) &&
        !(await models.User.freeUsername(
          request.body.username || request.body.userName
        ))
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
    async (request: Request, response: Response) => {
      // map matchedData to db fields.
      const dataToUpdate = matchedData(request);
      if (dataToUpdate.userName) {
        dataToUpdate.username = dataToUpdate.userName;
        delete dataToUpdate.userName;
      }
      const requestUser = await models.User.findByPk(
        response.locals.requestUser.id
      );
      if (dataToUpdate.email) {
        // If the user has changed their email, we'll need to send
        // another confirmation email.
        dataToUpdate.emailConfirmed = false;
        await sendEmailConfirmationEmail(requestUser, dataToUpdate.email);
      }
      await requestUser.update(dataToUpdate);
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Updated user."],
      });
    }
  );

  /**
   * @api {get} api/v1/users/:userNameOrId Get details for a user
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
    `${apiUrl}/:userNameOrId`,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      anyOf(validNameOf(param("userNameOrId")), idOf(param("userNameOrId"))),
    ]),
    fetchUnauthorizedRequiredUserByNameOrId(param("userNameOrId")),
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
            403
          )
        );
      }
    },
    async (request, response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        userData: mapUser(response.locals.user),
      });
    }
  );

  const listUsersOptions = [
    extractJwtAuthorisedSuperAdminUser,
    async (request, response) => {
      const users = await models.User.getAll({});
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        usersList: mapUsers(users),
      });
    },
  ];

  /**
   * @api {get} api/v1/listUsers List usernames
   * @apiName ListUsers
   * @apiGroup User
   * @apiDescription Given an authenticated super-user, we need to be able to get
   * a list of all usernames on the system, so that we can switch to viewing
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
   * @api {get} api/v1/list-users List usernames
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
  app.get(`${baseUrl}/list-users`, ...listUsersOptions);

  const endUserAgreementOptions = [
    async (request, response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        euaVersion: config.euaVersion,
      });
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

  const changePasswordOptions = [
    validateFields([body("token").exists(), validPasswordOf(body("password"))]),
    fetchUnauthorizedRequiredUserByResetToken(body("token")),
    async (request: Request, response: Response) => {
      if (response.locals.user.password != response.locals.resetInfo.password) {
        return responseUtil.send(response, {
          statusCode: 403,
          messages: ["Your password has already been changed"],
        });
      }
      const result = await response.locals.user.update({
        password: request.body.password,
      });
      if (!result) {
        return responseUtil.send(response, {
          statusCode: 403,
          messages: ["Error changing password please contact sys admin"],
        });
      }
      const { expiry, refreshToken, apiToken } =
        await generateAuthTokensForUser(
          response.locals.user,
          request.headers["viewport"] as string,
          request.headers["user-agent"]
        );

      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        token: apiToken,
        refreshToken,
        expiry,
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
    async (request: Request, response: Response) => {
      const { id, groupId, admin, inviterId } = response.locals.tokenInfo;
      const [user, group, inviter] = await Promise.all([
        models.User.findByPk(id),
        models.Group.findByPk(groupId),
        models.User.findByPk(inviterId),
      ]);
      if (!inviter) {
        return responseUtil.send(response, {
          statusCode: 422,
          messages: ["Inviting user no longer exists"],
        });
      }
      if (!user) {
        return responseUtil.send(response, {
          statusCode: 422,
          messages: ["User no longer exists"],
        });
      }
      if (!group) {
        return responseUtil.send(response, {
          statusCode: 422,
          messages: ["Group no longer exists"],
        });
      }

      // TODO:
      // Check if the user already belongs to the group.
      // Check if the user giving permissions is still an admin member of the group in question.

      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Added to invited group"],
      });
    }
  );

  app.post(
    `${apiUrl}/request-group-membership`,
    extractJwtAuthorizedUser,
    validateFields([body("groupAdminEmail").exists()]),
    fetchUnauthorizedRequiredUserByNameOrEmailOrId(body("groupAdminEmail")),
    async (request: Request, response: Response) => {
      const groupOwner = response.locals.user;
      // TODO: Check if the groupOwner is actually admin of any groups.
      // Send group owner an email with a token which can grant access for the requesting user
      // for any of their groups.
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Send membership request to user"],
      });
    }
  );

  app.post(
    `${apiUrl}/validate-group-membership-request`,
    // Get token from request email.
    validateFields([body("membershipRequest").exists()]),
    extractJWTInfo(body("membershipRequest")),
    async (request: Request, response: Response) => {
      // FIXME - make sure all of these JWT tokens have a 'type' field that we can check against,
      // to make sure they can't be reused for other requests.
      const { id, type } = response.locals.tokenInfo;
      if (type !== "membership-request") {
        return responseUtil.send(response, {
          statusCode: 401,
          userId: id,
          messages: ["Invalid token type"],
        });
      }
      const userToGrantMembershipFor = await models.User.findByPk(id);
      if (!userToGrantMembershipFor) {
        return responseUtil.send(response, {
          statusCode: 422,
          messages: ["User no longer exists"],
        });
      }

      return responseUtil.send(response, {
        statusCode: 200,
        userId: id,
        userName: userToGrantMembershipFor.username,
        messages: ["Allowed to add user."],
      });
    }
  );
}
