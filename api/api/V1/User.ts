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
import models from "../../models";
import responseUtil from "./responseUtil";
import { body, param, matchedData, oneOf } from "express-validator";
import { ClientError } from "../customErrors";
import { Application, NextFunction, Request, Response } from "express";
import config from "../../config";
import { User } from "../../models/User";
import { validNameOf, validPasswordOf } from "../validation-middleware";
import {
  extractJwtAuthorisedSuperAdminUser,
  extractJwtAuthorisedUser,
  extractUserByName,
} from "../extract-middleware";

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
    async (request: Request, Response: Response, next: NextFunction) => {
      if (!(await models.User.freeUsername(request.body.username))) {
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
    async (request, response) => {
      const user: User = await models.User.create({
        username: request.body.username,
        password: request.body.password,
        email: request.body.email,
        endUserAgreement: request.body.endUserAgreement,
      });
      const userData = await user.getDataValues();
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Created new user."],
        token: `JWT ${auth.createEntityJWT(user)}`,
        userData: userData,
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
    extractJwtAuthorisedUser,
    validateFields([
      // FIXME - Could be "At least one of" with nicer error messages?
      oneOf(
        [
          validNameOf(body("username")),
          body("email").isEmail(),
          validPasswordOf(body("password")),
          body("endUserAgreement").isInt(),
        ],
        "Must provide at least one of: username; email; password; endUserAgreement."
      ),
    ]),
    async (request: Request, Response: Response, next: NextFunction) => {
      if (
        request.body.username &&
        !(await models.User.freeUsername(request.body.username))
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
      await response.locals.requestUser.update(matchedData(request));
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
    extractJwtAuthorisedUser,
    validateFields([validNameOf(param("userName"))]),
    extractUserByName("params", "userName"),
    // FIXME - should a regular user be able to get user information for any other user?
    async (request, response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        userData: await response.locals.user.getDataValues(),
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
        usersList: users,
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
