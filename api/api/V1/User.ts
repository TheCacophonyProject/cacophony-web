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
import auth from "../auth";
import models from "@models";
import responseUtil from "./responseUtil";
import { body, param, matchedData, query } from "express-validator";
import { ClientError } from "../customErrors";
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
  fetchUnauthorizedOptionalUserByNameOrId,
  fetchUnauthorizedRequiredUserByNameOrId,
  fetchUnauthorizedRequiredUserByResetToken,
} from "../extract-middleware";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { jsonSchemaOf } from "@api/schema-validation";
import ApiUserSettingsSchema from "@schemas/api/user/ApiUserSettings.schema.json";
import {sendEmail, sendEmailConfirmationEmail} from "@/scripts/emailUtil";

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
        return next(new ClientError("Username in use"));
      } else {
        next();
      }
    },
    async (request: Request, Response: Response, next: NextFunction) => {
      if (!(await models.User.freeEmail(request.body.email))) {
        return next(new ClientError("Email address in use"));
      } else {
        next();
      }
    },
    async (request: Request, response: Response) => {
      // FIXME Send a welcome email, with a requirement to validate the email address.
      //  We won't send transactional emails until the address has been validated.
      //  While the account is unvalidated, show a banner in the site, which allows to resend the validation email.
      //  User alerts and group invitations would not be activated until the user has confirmed their email address.

      const user: User = await models.User.create({
        username: request.body.username || request.body.userName,
        password: request.body.password,
        email: request.body.email,
        endUserAgreement: request.body.endUserAgreement,
      });
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Created new user."],
        token: `JWT ${auth.createEntityJWT(user)}`,
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
        return next(new ClientError("Username in use"));
      } else {
        next();
      }
    },
    async (request: Request, Response: Response, next: NextFunction) => {
      if (
        request.body.email &&
        !(await models.User.freeEmail(request.body.email))
      ) {
        return next(new ClientError("Email address in use"));
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
    }
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
  app.get(
    `${baseUrl}/listUsers`,
      ...listUsersOptions
  );

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
  app.get(
      `${baseUrl}/list-users`,
      ...listUsersOptions
  );

  const endUserAgreementOptions = [
    async (request, response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        euaVersion: config.euaVersion,
      });
    }
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
  app.get(
      `${baseUrl}/endUserAgreement/latest`,
      ...endUserAgreementOptions
  );

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
  app.get(
      `${baseUrl}/end-user-agreement/latest`,
      ...endUserAgreementOptions
  );

  const changePasswordOptions = [
    validateFields([body("token"), validPasswordOf(body("password"))]),
    fetchUnauthorizedRequiredUserByResetToken(body("token")),
    async (request: Request, response: Response) => {
      if (response.locals.user.password != response.locals.resetInfo.password) {
        return responseUtil.send(response, {
          statusCode: 403,
          messages: ["Your password has already been changed"],
        });
      }
      const result = await response.locals.user.updatePassword(
          request.body.password
      );
      if (!result) {
        return responseUtil.send(response, {
          statusCode: 403,
          messages: ["Error changing password please contact sys admin"],
        });
      }
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        token: `JWT ${auth.createEntityJWT(response.locals.user)}`,
        userData: mapUser(response.locals.user),
      });
    }
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
  app.patch(
      `${apiUrl}/change-password`,
      ...changePasswordOptions
  );

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
  app.patch(
    `${apiUrl}/changePassword`,
      ...changePasswordOptions
  );
}
