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
import { body, param, matchedData } from "express-validator";
import { ClientError } from "../customErrors";
import { Application, NextFunction, Request, Response } from "express";
import config from "@config";
import { User } from "@models/User";
import {
  anyOf,
  integerOf,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware";
import {
  extractJwtAuthorisedSuperAdminUser,
  extractJwtAuthorizedUser,
  extractUserByName,
  fetchUnauthorizedOptionalUserByNameOrId,
} from "../extract-middleware";
import logger from "@log";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";

export const mapUser = (user: User): ApiLoggedInUserResponse => ({
  id: user.id,
  userName: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  globalPermission: user.globalPermission,
  endUserAgreement: user.endUserAgreement,
});

export const mapUsers = (users: User[]) => users.map(mapUser);

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/users`;

  /**
   * @api {post} /api/v1/users Register a new user
   * @apiName RegisterUser
   * @apiGroup User
   *
   * @apiParam {String} username Username for new user.
   * @apiParam {String} password Password for new user.
   * @apiParam {String} email Email for new user.
   * @apiParam {Integer} [endUserAgreement] Version of the end user agreement accepted.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} token JWT for authentication. Contains the user ID and type.
   * @apiSuccess {JSON} userData Metadata of the user.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    validateFields([
      validNameOf(body("username")),
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
      const user: User = await models.User.create({
        username: request.body.username,
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
   * @apiParam {String} [username] New username to set.
   * @apiParam {String} [password] New password to set.
   * @apiParam {String} [email] New email to set.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      anyOf(
        validNameOf(body("username")),
        validNameOf(body("userName")),
        body("email").isEmail(),
        validPasswordOf(body("password")),
        integerOf(body("endUserAgreement"))
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
      await response.locals.requestUser.update(dataToUpdate);
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Updated user."],
      });
    }
  );

  // FIXME - Make this username *or* id?
  /**
   * @api {get} api/v1/users/:username Get details for a user
   * @apiName GetUser
   * @apiGroup User
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiSuccess {JSON} userData Metadata of the user.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:userName`,
    extractJwtAuthorizedUser,
    validateFields([validNameOf(param("userName"))]),
    extractUserByName("params", "userName"),
    // FIXME - should a regular user be able to get user information for any other user?
    // FIXME - map user info
    async (request, response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        userData: mapUser(response.locals.user),
      });
    }
  );

  /**
   * @api {get} api/v1/listUsers List usernames
   * @apiName ListUsers
   * @apiGroup User
   * @apiDescription Given an authenticated super-user, we need to be able to get
   * a list of all usernames on the system, so that we can switch to viewing
   * as a given user.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiSuccess {JSON} usersList List of usernames
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${baseUrl}/listUsers`,
    extractJwtAuthorisedSuperAdminUser,
    async (request, response) => {
      const users = await models.User.getAll({});
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        usersList: mapUsers(users),
      });
    }
  );

  /**
   * @api {get} /api/v1/endUserAgreement/latest Get the latest end user agreement version
   * @apiName EndUserAgreementVersion
   * @apiGroup User
   *
   * @apiSuccess {Integer} euaVersion Version of the latest end user agreement.
   * @apiUse V1ResponseSuccess
   *
   * @apiUse V1ResponseError
   */
  app.get(`${baseUrl}/endUserAgreement/latest`, async (request, response) => {
    return responseUtil.send(response, {
      statusCode: 200,
      messages: [],
      euaVersion: config.euaVersion,
    });
  });
}
