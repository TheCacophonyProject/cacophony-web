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
import { body, oneOf } from "express-validator";
import responseUtil from "./responseUtil";
import { Application, NextFunction, Request, Response } from "express";
import {
  deprecatedField,
  validNameOf,
  validPasswordOf,
} from "../validation-middleware";
import {
  extractJwtAuthorisedSuperAdminUser,
  fetchUnauthorizedOptionalUserByNameOrEmailOrId,
  fetchUnauthorizedRequiredUserByNameOrEmailOrId,
  fetchUnauthorizedRequiredUserByResetToken,
} from "../extract-middleware";

const ttlTypes = Object.freeze({ short: 60, medium: 5 * 60, long: 30 * 60 });

import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { mapUser } from "@api/V1/User";
import { User } from "@models/User";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiAuthenticateUserRequestBody {
  password: string; // Password for the user account
  userName?: string; // Username identifying a valid user account
  nameOrEmail?: string; // Username or email of a valid user account.
  email?: string; // Email identifying a valid user account
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ApiLoggedInUserResponseData {
  userData: ApiLoggedInUserResponse;
}

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/users`;

  const authenticateUserOptions = [
      validateFields([
          oneOf(
              [
                  deprecatedField(validNameOf(body("username"))),
                  validNameOf(body("userName")),

                  // FIXME - We are probably rejecting some valid email addresses here.
                  validNameOf(body("nameOrEmail")),
                  body("nameOrEmail").isEmail(),
                  body("email").isEmail(),
              ],
              "could not find a user with the given username or email"
          ),

          // FIXME - How about not sending our passwords in the clear eh?
          //  Ideally should generate hash on client side, and compare hashes with one
          //  stored on the backend.  Salt on both sides with some timestamp
          //  rounded to x minutes, so that if hash is compromised
          //  it can't be reused for long.
          validPasswordOf(body("password")),
      ]),
      fetchUnauthorizedOptionalUserByNameOrEmailOrId(
          body(["username", "userName", "nameOrEmail", "email"])
      ),
      (request: Request, response: Response, next: NextFunction) => {
          if (!response.locals.user) {
              // NOTE: Don't give away the fact that the user may not exist - remain vague in the
              //  error message as to whether the error is username or password related.
              return responseUtil.send(response, {
                  statusCode: 401,
                  messages: ["Wrong password or username/email address."],
              });
          } else {
              next();
          }
      },
      async (request: Request, response: Response) => {
          const passwordMatch = await response.locals.user.comparePassword(
              request.body.password
          );
          if (passwordMatch) {
              const token = auth.createEntityJWT(response.locals.user);
              const {
                  id,
                  username,
                  firstName,
                  lastName,
                  email,
                  globalPermission,
                  endUserAgreement,
              } = response.locals.user;
              responseUtil.send(response, {
                  statusCode: 200,
                  messages: ["Successful login."],
                  token: `JWT ${token}`,
                  userData: {
                      id,
                      userName: username,
                      firstName,
                      lastName,
                      email,
                      globalPermission,
                      endUserAgreement,
                  },
              });
          } else {
              responseUtil.send(response, {
                  statusCode: 401,
                  messages: ["Wrong password or username/email address."],
              });
          }
      }
  ];

  /**
   * @api {post} /authenticate_user Authenticate a user
   *
   * @apiName AuthenticateUser
   * @apiGroup Authentication
   * @apiDescription Checks the username corresponds to an existing user account
   * and the password matches the account.
   * One of 'username', 'userName', 'email', or 'nameOrEmail' is required.
   * @apiDeprecated Use /api/v1/users/authenticate-user
   *
   * @apiInterface {apiBody::ApiAuthenticateUserRequestBody}
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   */
  app.post(
    "/authenticate_user",
      ...authenticateUserOptions
  );

    /**
     * @api {post} /api/v1/users/authenticate-user Authenticate a user
     *
     * @apiName AuthenticateUser
     * @apiGroup Authentication
     * @apiDescription Checks the username corresponds to an existing user account
     * and the password matches the account.
     * One of 'username', 'userName', 'email', or 'nameOrEmail' is required.
     *
     * @apiInterface {apiBody::ApiAuthenticateUserRequestBody}
     *
     * @apiSuccess {String} token JWT string to provide to further API requests
     * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
     */
    app.post(
        `${apiUrl}/authenticate-user`,
        ...authenticateUserOptions
    );

  const authenticateAsOtherUserOptions = [
      extractJwtAuthorisedSuperAdminUser,
      validateFields([validNameOf(body("name"))]),
      fetchUnauthorizedRequiredUserByNameOrEmailOrId(body("name")),
      async (request: Request, response: Response) => {
          const token = auth.createEntityJWT(response.locals.user);
          const {
              id,
              username,
              firstName,
              lastName,
              email,
              globalPermission,
              endUserAgreement,
          } = response.locals.user;
          responseUtil.send(response, {
              statusCode: 200,
              messages: ["Got user token."],
              token: `JWT ${token}`,
              userData: {
                  id,
                  userName: username,
                  firstName,
                  lastName,
                  email,
                  globalPermission,
                  endUserAgreement,
              },
          });
      }
  ];

  /**
   * @api {post} /admin_authenticate_as_other_user Authenticate as any user if you are a super-user.
   * @apiName AdminAuthenticateAsOtherUser
   * @apiGroup Authentication
   * @apiDescription Allows an authenticated super-user to obtain a user JWT token for any other user, so that they
   * can view the site as that user.
   * @apiDeprecated Use /api/v1/users/admin-authenticate-as-other-user
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiBody {String} name Username identifying a valid user account
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   */
  app.post(
    "/admin_authenticate_as_other_user",
      ...authenticateAsOtherUserOptions
  );

    /**
     * @api {post} /api/v1/users/admin-authenticate-as-other-user Authenticate as any user if you are a super-user.
     * @apiName AdminAuthenticateAsOtherUser
     * @apiGroup Authentication
     * @apiDescription Allows an authenticated super-user to obtain a user JWT token for any other user, so that they
     * can view the site as that user.
     *
     * @apiUse V1UserAuthorizationHeader
     *
     * @apiBody {String} name Username identifying a valid user account
     *
     * @apiSuccess {String} token JWT string to provide to further API requests
     * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
     */
    app.post(
        `${apiUrl}/admin_authenticate_as_other_user`,
        ...authenticateAsOtherUserOptions
    );

  /**
   * @api {post} /token Generate temporary JWT
   * @apiName Token
   * @apiGroup Authentication
   * @apiDeprecated No longer maintained, not supported by all API endpoints and may be removed in future
   * @apiDescription It is sometimes necessary to include an
   * authentication token in a URL but it is not safe to provide a
   * user's primary JWT as it can easily leak into logs etc. This API
   * generates a short-lived token which can be used as part of URLs.
   *
   * @apiParam {String} [ttl] short,medium,long defining token expiry time
   * @apiParam {JSON} [access] dictionary of access to different entities
   *
   * @apiParamExample  {JSON} access:
   * {"devices":"r"}
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiSuccess {JSON} token JWT that may be used to call the report endpoint. Token will require
   * prefixing with "JWT " before use in Authorization header fields.
   */
  app.post(
    "/token",
    validateFields([body("ttl").optional(), body("access").optional()]),
    auth.authenticateUser,
    middleware.requestWrapper(async (request, response) => {
      // FIXME - deprecate or remove this if not used anywhere?
      const expiry = ttlTypes[request.body.ttl] || ttlTypes["short"];
      const token = auth.createEntityJWT(
        request.user,
        { expiresIn: expiry },
        request.body.access
      );

      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Token generated."],
        token: token,
      });
    })
  );

  const resetPasswordOptions = [
      validateFields([
      oneOf(
          [
              deprecatedField(validNameOf(body("username"))),
              validNameOf(body("userName")),
              validNameOf(body("nameOrEmail")),
              body("nameOrEmail").isEmail(),
              body("email").isEmail(),
          ],
          "Missing user name in request"
      ),
      ]),
      fetchUnauthorizedOptionalUserByNameOrEmailOrId(
          body(["username", "userName", "nameOrEmail", "email"])
      ),
      async (request: Request, response: Response) => {
          if (response.locals.user) {
              await (response.locals.user as User).resetPassword();
          }
          return responseUtil.send(response, {
              statusCode: 200,
              messages: ["Email has been sent"],
          });
      }];

  /**
   * @api {post} /api/v1/reset-password Sends an email to a user for resetting password
   * @apiName ResetPassword
   * @apiGroup Authentication
   * @apiBody {String} email Email of user.
   * @apiUse V1ResponseSuccess
   */
  app.post(
    `${apiUrl}/reset-password`,
      ...resetPasswordOptions
  );

    /**
     * @api {post} /resetpassword Sends an email to a user for resetting password
     * @apiName ResetPassword
     * @apiGroup Authentication
     * @apiDeprecated Use /api/v1/users/reset-password instead
     * @apiBody {String} userName Username of user.
     * @apiUse V1ResponseSuccess
     */
    app.post(
        "/resetpassword",
        ...resetPasswordOptions
    );

    const validateTokenOptions = [
        validateFields([
            body("token").exists()
        ]),
        fetchUnauthorizedRequiredUserByResetToken(body("token")),
        async (request: Request, response: Response) => {
            if (response.locals.user.password != response.locals.resetInfo.password) {
                return responseUtil.send(response, {
                    statusCode: 403,
                    messages: ["Your password has already been changed"],
                });
            }
            return responseUtil.send(response, {
                statusCode: 200,
                messages: [],
                userData: mapUser(response.locals.user),
            });
        }
    ];

  /**
   * @api {post} /validateToken Validates a reset token
   * @apiName ValidateToken
   * @apiGroup Authentication
   * @apiBody {String} token password reset token to validate
   * @apiDeprecated Use /api/v1/users/validate-reset-token
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    "/validateToken",
      ...validateTokenOptions
  );

    /**
     * @api {post} /api/v1/users/validate-reset-token Validates a reset token
     * @apiName ValidateToken
     * @apiGroup Authentication
     * @apiBody {String} token password reset token to validate
     * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
     * @apiUse V1ResponseSuccess
     * @apiUse V1ResponseError
     */
    app.post(
        `${apiUrl}/validate-reset-token`,
        ...validateTokenOptions
    );

    // TODO(browse-next): New apis:

    // NOTE: This is really just for is the user has lost the email that was sent
    // /api/v1/users/resend-email-confirmation-request (initial email confirmation request is sent as part of sign-up)

    // /api/v1/users/validate-email-confirmation-request (also needs browse endpoint)
    // /api/v1/users/invite-user-to-group
    // /api/v1/users/accept-group-invite (user, group, admin) (also needs browse endpoint)
    // /api/v1/users/refresh-session-token

    // Not sure if we want this one:
    // /api/v1/users/request-group-invite
}
