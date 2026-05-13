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

import config from "../config.js";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { ExtractJwt } from "passport-jwt";
import { AuthenticationError } from "./customErrors.js";
import type { NextFunction, Request, Response } from "express";
import { User } from "@models/User.js";
import { Device } from "@models/Device.js";
import type {
  GroupId,
  GroupInvitationId,
  UserId,
} from "@typedefs/api/common.js";
import { randomUUID } from "crypto";
import Sequelize, { QueryTypes } from "sequelize";
import { HttpStatusCode } from "@typedefs/api/consts.js";

/*
 * Create a new JWT for a user or device.
 */

export const ttlTypes = Object.freeze({
  short: 60,
  medium: 5 * 60,
  long: 30 * 60,
});

export interface JwtGenerator {
  getJwtDataValues: () => DecodedJWTToken;
}

export function createEntityJWT(
  entity: JwtGenerator,
  options?: { expiresIn?: number },
  access?: Record<string, string>,
): string {
  const payload: DecodedJWTToken = entity.getJwtDataValues();
  if (access) {
    payload.access = access;
  }
  return jwt.sign(payload, config.server.passportSecret, options);
}

export interface DecodedJWTToken {
  access?: Record<string, string>;
  _type: string;
  activated?: boolean;
  id: number;
}

export interface ResetInfo {
  password: string;
  id: number;
}

export const getPasswordResetToken = (
  userId: UserId,
  password: string,
): string => {
  // expires in a day
  return jwt.sign(
    { id: userId, password, _type: "reset-password" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24,
    },
  );
};

export const getEmailConfirmationToken = (
  userId: UserId,
  email: string,
): string => {
  // expires in a day
  return jwt.sign(
    { id: userId, email, _type: "confirm-email" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24,
    },
  );
};

export const getJoinGroupRequestToken = (
  userId: UserId,
  groupId: GroupId,
): string => {
  // expires in a week
  return jwt.sign(
    { id: userId, group: groupId, _type: "join-group" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24 * 365,
    },
  );
};

export const getInviteToGroupToken = (
  inviteId: GroupInvitationId,
  groupId: GroupId,
  email: string, // Email address of invitee
): string => {
  // expires in a year
  return jwt.sign(
    { id: inviteId, group: groupId, _type: "invite-new-user", email },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24 * 365,
    },
  );
};

export const getInviteToGroupTokenExistingUser = (
  userId: UserId,
  groupId: GroupId,
): string => {
  // expires in a week
  return jwt.sign(
    { id: userId, group: groupId, _type: "invite-existing-user" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24 * 365,
    },
  );
};

export const generateAuthTokensForUser = async (
  sequelize: Sequelize.Sequelize,
  user: User,
  viewport = "",
  userAgent = "unknown user agent",
  expires = true,
): Promise<{ refreshToken: string; apiToken: string }> => {
  const now = new Date().toISOString();
  const refreshToken = randomUUID();
  await sequelize.query(
    `
              insert into "UserSessions"
              ("refreshToken", "userId", "userAgent", "createdAt", "updatedAt", "viewport")
              values (:refreshToken, :userId, :userAgent, :createdAt, :updatedAt, :viewport)
            `,
    {
      replacements: {
        // Can we store screen resolution of clients here?  That would be handy.
        viewport,
        userAgent,
        refreshToken,
        userId: user.id,
        createdAt: now,
        updatedAt: now,
      },
      type: QueryTypes.INSERT,
    },
  );
  const expiryOptions = expires ? { expiresIn: ttlTypes.medium } : {};
  const refreshTokenSigned = jwt.sign(
    { refreshToken, _type: "refresh" },
    config.server.passportSecret,
  );
  return {
    refreshToken: refreshTokenSigned,
    apiToken: `JWT ${createEntityJWT(user, expiryOptions)}`,
  };
};

export const getDecodedToken = (
  token: string,
  enforceExpiry = true,
): JwtPayload | string => {
  const decodedToken = jwt.decode(token) as JwtPayload | null;
  if (
    enforceExpiry &&
    decodedToken &&
    decodedToken.exp * 1000 < new Date().getTime()
  ) {
    throw new AuthenticationError("JWT token expired.");
  }
  try {
    return jwt.verify(token, config.server.passportSecret);
  } catch (_e) {
    throw new AuthenticationError(
      `Failed to verify JWT for token ${token} - (${
        decodedToken && JSON.stringify(decodedToken)
      })`,
    );
  }
};

export const getVerifiedJWT = (
  request: Request,
): string | object | DecodedJWTToken => {
  let token = ExtractJwt.fromAuthHeaderWithScheme("jwt")(request);
  if (!token) {
    // allow taking the jwt from the query params.
    token = request.query.jwt as string;
  }
  if (!token) {
    throw new AuthenticationError("Could not find JWT token.");
  }
  try {
    return jwt.verify(token, config.server.passportSecret);
  } catch (_e) {
    throw new AuthenticationError(
      `Failed to verify JWT. (${JSON.stringify(jwt.decode(token))})`,
    );
  }
};

export const getVerifiedJWTFromBody = (
  field: string,
  request: Request,
): string | object | DecodedJWTToken => {
  let token = ExtractJwt.fromBodyField(field)(request);
  if (token && token.startsWith("JWT ")) {
    token = token.slice(4);
  }
  if (!token) {
    // allow taking the jwt from the query params.
    token = request.query.jwt as string;
  }
  if (!token) {
    throw new AuthenticationError("Could not find JWT token.");
  }
  try {
    return jwt.verify(token, config.server.passportSecret);
  } catch (_e) {
    throw new AuthenticationError(
      `Failed to verify JWT. (${JSON.stringify(jwt.decode(token))})`,
    );
  }
};

export async function lookupEntity(jwtDecoded: DecodedJWTToken) {
  switch (jwtDecoded._type) {
    case "user":
      return User.findByPk(jwtDecoded.id);
    case "device":
      return Device.findByPk(jwtDecoded.id);
    case "fileDownload":
      return jwtDecoded;
    default:
      return null;
  }
}

/*
 * Authenticate a JWT in the 'Authorization' header of the given type
 */
const authenticate = (types: string[] | null) => {
  return async (request: Request, response: Response, next: NextFunction) => {
    let jwtDecoded: DecodedJWTToken;
    try {
      jwtDecoded = getVerifiedJWT(request) as DecodedJWTToken;
    } catch (e: unknown) {
      let message = "unknown error";
      if (e instanceof Error) {
        message = e.message;
      }
      return response
        .status(HttpStatusCode.AuthorizationError)
        .json({ messages: [message] });
    }

    if (types && !types.includes(jwtDecoded._type)) {
      response.status(HttpStatusCode.AuthorizationError).json({
        messages: [
          `Invalid JWT access type '${jwtDecoded._type}', must be ${
            types.length > 1 ? "one of " : ""
          }${types.map((t) => `'${t}'`).join(", ")}`,
        ],
      });
      return;
    }
    const result = await lookupEntity(jwtDecoded);
    if (!result) {
      response.status(HttpStatusCode.AuthorizationError).json({
        messages: [
          `Could not find entity '${jwtDecoded.id}' of type '${jwtDecoded._type}' referenced by JWT.`,
        ],
      });
      return;
    }
    response.locals[jwtDecoded._type] = result;
    next();
  };
};

export const authenticateUser = () => authenticate(["user"]);
