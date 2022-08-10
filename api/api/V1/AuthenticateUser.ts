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
import auth, {
  generateAuthTokensForUser,
  getEmailConfirmationToken,
  ttlTypes,
} from "../auth";
import { body } from "express-validator";
import { serverErrorResponse, successResponse } from "./responseUtil";
import { Application, NextFunction, Request, Response } from "express";
import { anyOf, idOf, validPasswordOf } from "../validation-middleware";
import {
  extractJwtAuthorisedSuperAdminUser,
  extractJwtAuthorizedUser,
  extractJWTInfo,
  fetchUnauthorizedOptionalUserByEmailOrId,
  fetchUnauthorizedRequiredUserByEmailOrId,
  fetchUnauthorizedRequiredUserByResetToken,
} from "../extract-middleware";

import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { mapUser } from "@api/V1/User";
import { User } from "@models/User";
import models from "@/models";
import { UserId } from "@/../types/api/common";
import jwt from "jsonwebtoken";
import config from "@config";
import { randomUUID } from "crypto";
import { QueryTypes } from "sequelize";
import {
  sendChangedEmailConfirmationEmail,
  sendWelcomeEmailConfirmationEmail,
} from "@/emails/transactionalEmails";
import { HttpStatusCode } from "@typedefs/api/consts";
import {
  AuthenticationError,
  AuthorizationError,
  ClientError,
  FatalError,
  UnprocessableError,
} from "@api/customErrors";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiAuthenticateUserRequestBody {
  password: string; // Password for the user account
  email: string; // Email identifying a valid user account
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ApiLoggedInUserResponseData {
  userData: ApiLoggedInUserResponse;
}

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/users`;

  // TODO - Give api users the option of asking for a long-lived token, so they don't have to deal with the complexity
  //  of refresh tokens?

  // NOTE: nameOrEmail is just in here until we can update sidekick to just use email.
  const authenticateUserOptions = [
    validateFields([
      anyOf(
        body("nameOrEmail").isEmail().optional(),
        body("email").isEmail().optional()
      ),
      validPasswordOf(body("password")),
    ]),
    fetchUnauthorizedOptionalUserByEmailOrId(body(["email", "nameOrEmail"])),
    (request: Request, response: Response, next: NextFunction) => {
      if (!response.locals.user) {
        // NOTE: Don't give away the fact that the user may not exist - remain vague in the
        //  error message as to whether the error is username or password related.
        return next(
          new AuthenticationError("Wrong password or email address.")
        );
      } else {
        next();
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const passwordMatch = await response.locals.user.comparePassword(
        request.body.password
      );
      if (passwordMatch) {
        // NOTE: If this is called from the old, deprecated API, continue to give out
        //  tokens that never expire.  If called from the new end-point, timeout in 30mins, and
        //  require use of the token refresh.
        const isNewEndPoint = request.path.endsWith("authenticate");
        await response.locals.user.update({ lastActiveAt: new Date() });
        const { refreshToken, apiToken } = await generateAuthTokensForUser(
          response.locals.user,
          request.headers["viewport"] as string,
          request.headers["user-agent"],
          isNewEndPoint
        );
        return successResponse(response, "Successful login.", {
          token: apiToken,
          refreshToken,
          userData: mapUser(response.locals.user),
        });
      } else {
        return next(
          new AuthenticationError("Wrong password or email address.")
        );
      }
    },
  ];

  /**
   * @api {post} /authenticate_user Authenticate a user
   *
   * @apiName AuthenticateUser
   * @apiGroup Authentication
   * @apiDescription Checks the email address corresponds to an existing user account
   * and the password matches the account.
   * @apiBody {String} email Address identifying a valid user account
   * @apiDeprecated Use /api/v1/users/authenticate-user
   *
   * @apiInterface {apiBody::ApiAuthenticateUserRequestBody}
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {String} refreshToken one time use token to refresh the users' session JWT token
   * @apiSuccess {Date} expiry ISO formatted dateTime for when token needs to be refreshed before to provide seamless user experience.
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   */
  app.post("/authenticate_user", ...authenticateUserOptions);

  /**
   * @api {post} /api/v1/users/authenticate Authenticate a user
   *
   * @apiName AuthenticateUser
   * @apiGroup Authentication
   * @apiDescription Checks the email address corresponds to an existing user account
   * and the password matches the account.
   * @apiBody {String} email Address identifying a valid user account
   *
   * @apiInterface {apiBody::ApiAuthenticateUserRequestBody}
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {String} refreshToken one time use token to refresh the users' session JWT token
   * @apiSuccess {Date} expiry ISO formatted dateTime for when token needs to be refreshed before to provide seamless user experience.
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   */
  app.post(`${apiUrl}/authenticate`, ...authenticateUserOptions);

  /**
   * @api {post} /api/v1/users/refresh-session-token Refresh user JWT
   * @apiName RefreshUserAuthentication
   * @apiGroup Authentication
   * @apiDescription Returns a refreshed JWT user auth token for the current user
   * with an updated timeout
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {String} refreshToken One-time use token to refresh JWT session token
   * @apiSuccess {Date} expiry ISO formatted dateTime for when token needs to be refreshed before to provide seamless user experience.
   */
  app.post(
    `${apiUrl}/refresh-session-token`,
    validateFields([body("refreshToken").exists()]),
    extractJWTInfo(body("refreshToken")),
    async (request: Request, response: Response, next: NextFunction) => {
      // NOTE: The key insight for refresh tokens is that they are "one-time-use" tokens.  Every time we give out
      //  a new refresh token, we invalidate the old one.

      const result = await models.sequelize.query(
        `
            select * from "UserSessions" 
            where "refreshToken" = :refreshToken 
            limit 1
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            refreshToken: response.locals.tokenInfo.refreshToken,
          },
        }
      );

      if (result.length) {
        // if valid token, create new token to return, and update existing token.
        // create a new short-lived JWT token for user.
        const validToken = result[0];

        // Best practices taken from auth0 say that we should revoke refresh tokens after 15 days of inactivity:
        // https://auth0.com/blog/achieving-a-seamless-user-experience-with-refresh-token-inactivity-lifetimes/
        const fifteenDaysAgo = new Date(
          new Date().setDate(new Date().getDate() - 15)
        );
        if (new Date(validToken.updatedAt) < fifteenDaysAgo) {
          return next(
            new AuthorizationError("Inactive refresh token expired.")
          );
        }

        const refreshToken = randomUUID();
        const user = await models.User.findByPk(validToken.userId);
        await user.update({ lastActiveAt: new Date() });
        const expiry = new Date(
          new Date().setSeconds(new Date().getSeconds() + (ttlTypes.medium - 5))
        );

        const now = new Date().toISOString();
        await models.sequelize.query(
          `
            update "UserSessions" 
            set "refreshToken" = :refreshToken, "updatedAt" = :updatedAt
            where "refreshToken" = :oldRefreshToken
        `,
          {
            type: QueryTypes.UPDATE,
            replacements: {
              refreshToken,
              oldRefreshToken: response.locals.tokenInfo.refreshToken,
              updatedAt: now,
            },
          }
        );

        const token = auth.createEntityJWT(user, {
          expiresIn: ttlTypes.medium,
        });
        const refreshTokenSigned = jwt.sign(
          { refreshToken },
          config.server.passportSecret
        );
        return successResponse(response, "Got user token.", {
          token: `JWT ${token}`,
          expiry,
          refreshToken: refreshTokenSigned,
        });
      } else {
        return next(new AuthorizationError("Invalid refresh token."));
      }
    }
  );

  const authenticateAsOtherUserOptions = [
    extractJwtAuthorisedSuperAdminUser,
    validateFields([anyOf(body("email").isEmail(), idOf(body("userId")))]),
    fetchUnauthorizedRequiredUserByEmailOrId(body(["email", "userId"])),
    async (request: Request, response: Response) => {
      const isNewEndPoint = request.path.endsWith(
        "admin-authenticate-as-other-user"
      );
      const options = isNewEndPoint ? { expiresIn: ttlTypes.medium } : {};
      const token = auth.createEntityJWT(response.locals.user, options);
      const expiry = new Date(
        new Date().setSeconds(new Date().getSeconds() + (ttlTypes.medium - 5))
      );
      const { id, userName, email, globalPermission, endUserAgreement } =
        response.locals.user;
      return successResponse(response, "Got user token.", {
        token: `JWT ${token}`,
        expiry,
        userData: {
          id,
          userName,
          email,
          globalPermission,
          endUserAgreement,
        },
      });
    },
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
   * @apiBody {String} email Address identifying a valid user account
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiSuccess {Date} expiry ISO formatted dateTime for when token needs to be refreshed before to provide seamless user experience.
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
   * @apiBody {String} email Address identifying a valid user account
   *
   * @apiSuccess {String} token JWT string to provide to further API requests
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   */
  app.post(
    `${apiUrl}/admin-authenticate-as-other-user`,
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
      return successResponse(response, "Token generated.", { token });
    })
  );

  const resetPasswordOptions = [
    validateFields([body("email").isEmail()]),
    fetchUnauthorizedOptionalUserByEmailOrId(body("email")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.user) {
        const user = response.locals.user as User;
        // If we're using the new end-point, make sure the user has confirmed their email address.
        const isNewEndpoint = request.path.endsWith("reset-password");
        if (isNewEndpoint && !user.emailConfirmed) {
          // Do nothing
        } else {
          // FIXME - use correct resetPassword emailer

          const sendingSuccess = await user.resetPassword();
          if (!sendingSuccess) {
            return next(
              new FatalError(
                "We failed to send your password recovery email, please check that you've entered your email correctly."
              )
            );
          }
        }
      } else {
        // In the case where the user doesn't exist, we'll pretend it does so
        // attackers can't use this api to confirm the existence of a given email address.
      }
      return successResponse(
        response,
        "Your password recovery email has been sent"
      );
    },
  ];

  /**
   * @api {post} /api/v1/reset-password Sends an email to a user for resetting password
   * @apiName ResetPassword
   * @apiGroup Authentication
   * @apiBody {String} email Email address of user.
   * @apiUse V1ResponseSuccess
   */
  app.post(`${apiUrl}/reset-password`, ...resetPasswordOptions);

  /**
   * @api {post} /resetpassword Sends an email to a user for resetting password
   * @apiName ResetPassword
   * @apiGroup Authentication
   * @apiDeprecated Use /api/v1/users/reset-password instead
   * @apiBody {String} email Email address of user.
   * @apiUse V1ResponseSuccess
   */
  app.post("/resetpassword", ...resetPasswordOptions);

  const validateTokenOptions = [
    validateFields([body("token").exists()]),
    fetchUnauthorizedRequiredUserByResetToken(body("token")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (
        response.locals.user.password !== response.locals.resetInfo.password
      ) {
        return next(new ClientError("Your password has already been changed"));
      }
      return successResponse(response, "Reset token is still valid", {
        userData: mapUser(response.locals.user),
      });
    },
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
  app.post("/validateToken", ...validateTokenOptions);

  /**
   * @api {post} /api/v1/users/validate-reset-token Validates a reset token
   * @apiName ValidateToken
   * @apiGroup Authentication
   * @apiDescription Used by the front-end when following a password reset link from an email to make sure
   * the link has not already been used to reset a users' password.  Should be used on page load.
   * @apiBody {String} token password reset token to validate
   * @apiInterface {apiSuccess::ApiLoggedInUserResponseData} userData
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(`${apiUrl}/validate-reset-token`, ...validateTokenOptions);

  /**
   * @api {post} /api/v1/users/resend-email-confirmation-request Resends email confirmation email
   * @apiDescription Resend confirmation email that was originally sent as part of sign-up, or when
   * changing email addresses.  This should only be used if the original email was lost.
   * @apiName ResendEmailConfirmationRequest
   * @apiGroup Authentication
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/resend-email-confirmation-request`,
    extractJwtAuthorizedUser,
    async (request: Request, response: Response, next: NextFunction) => {
      const user = await models.User.findByPk(response.locals.requestUser.id);
      if (user.email && !user.emailConfirmed) {
        const emailConfirmationToken = getEmailConfirmationToken(
          user.id,
          user.email
        );
        //
        const groups = await user.getGroups();
        let sendSuccess;
        if (!groups.length) {
          // If the user has no groups, re-send the welcome email,
          sendSuccess = await sendWelcomeEmailConfirmationEmail(
            emailConfirmationToken,
            user.email
          );
        } else {
          // otherwise resend the email change confirmation email.
          sendSuccess = await sendChangedEmailConfirmationEmail(
            emailConfirmationToken,
            user.email
          );
        }
        if (!sendSuccess) {
          return serverErrorResponse(
            response,
            new ClientError(
              `Failed to send email to ${user.email}`,
              HttpStatusCode.ServerError
            )
          );
        }
        return successResponse(response, "Email confirmation request sent");
      } else if (user.emailConfirmed) {
        return next(new UnprocessableError("Email already confirmed"));
      }
    }
  );

  if (config.server.loggerLevel === "debug") {
    app.post(
      `${apiUrl}/get-email-confirmation-token`,
      extractJwtAuthorizedUser,
      validateFields([body("email")]),
      async (request: Request, response: Response) => {
        const token = getEmailConfirmationToken(
          response.locals.requestUser.id,
          request.body.email
        );
        return successResponse(response, "Got email confirmation token", {
          token,
        });
      }
    );
  }

  /**
   * @api {post} /api/v1/users/validate-email-confirmation-request Validates token from email confirmation email
   * @apiName ConfirmValidateEmail
   * @apiGroup Authentication
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/validate-email-confirmation-request`,
    validateFields([body("emailConfirmationJWT").exists()]),
    // Decode the JWT token, get the email, userId for the token.
    extractJWTInfo(body("emailConfirmationJWT")),
    async (request, response, next) => {
      await fetchUnauthorizedRequiredUserByEmailOrId(
        response.locals.tokenInfo.id
      )(request, response, next);
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const tokenInfo = response.locals.tokenInfo as {
        id: UserId;
        email: string;
      };
      let user = response.locals.user;
      if (tokenInfo.email !== user.email) {
        return next(
          new UnprocessableError(
            "User email address differs from email to confirm"
          )
        );
      }
      if (user.email) {
        // NOTE: It's okay if this link is used multiple times, we'll just say it's confirmed successfully each time.
        const emailAlreadyConfirmed = user.emailConfirmed; // Email could be already confirmed if we're changing the email address.

        // TODO: Do we return a logged in user here?
        //  If it's a changed email address, then we should log the user out, and prompt the user to login with the
        //  new email address.
        //  If it's a first time email confirmation, then we can return the login details, and log the user in
        //  again.  Either way we should return a new set of user keys.
        // Generate a new set of tokens to be replaced.
        const { refreshToken, apiToken } = await generateAuthTokensForUser(
          user,
          request.headers["viewport"] as string,
          request.headers["user-agent"]
        );

        user = await user.update({ emailConfirmed: true });
        return successResponse(response, "Email confirmed", {
          signOutUser: emailAlreadyConfirmed, // UI should sign out user and make them sign in again with new email.
          userData: mapUser(user),
          token: apiToken,
          refreshToken,
        });
      }
    }
  );

  // NOTE: This is really just for is the user has lost the email that was sent
  // /api/v1/users/resend-email-confirmation-request (initial email confirmation request is sent as part of sign-up)
  // /api/v1/users/validate-email-confirmation-request (also needs browse endpoint)
  // /api/v1/users/refresh-session-token

  // /api/v1/users/invite-user-to-group
  // /api/v1/users/accept-group-invite (user, group, admin) (also needs browse endpoint)

  // Not sure if we want this one:
  // /api/v1/users/request-group-invite
}
