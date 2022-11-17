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

import config from "../config";
import jwt, { JwtPayload } from "jsonwebtoken";
import { ExtractJwt } from "passport-jwt";
import { AuthenticationError } from "./customErrors";
import models, { ModelCommon } from "../models";
import { Request } from "express";
import { User } from "@models/User";
import { GroupId, GroupInvitationId, UserId } from "@typedefs/api/common";
import { randomUUID } from "crypto";
import { QueryTypes } from "sequelize";
import { HttpStatusCode } from "@typedefs/api/consts";
/*
 * Create a new JWT for a user or device.
 */

export const ttlTypes = Object.freeze({
  short: 60,
  medium: 5 * 60,
  long: 30 * 60,
});

function createEntityJWT<T>(
  entity: ModelCommon<T>,
  options?,
  access?: {}
): string {
  const payload: DecodedJWTToken = entity.getJwtDataValues();
  if (access) {
    payload.access = access;
  }
  return jwt.sign(payload, config.server.passportSecret, options);
}

export interface DecodedJWTToken {
  access?: Record<string, any>;
  _type: string;
  id: number;
}

export interface ResetInfo {
  password: string;
  id: number;
}

export const getPasswordResetToken = (
  userId: UserId,
  password: string
): string => {
  // expires in a day
  return jwt.sign(
    { id: userId, password, _type: "reset-password" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24,
    }
  );
};

export const getEmailConfirmationToken = (
  userId: UserId,
  email: string
): string => {
  // expires in a day
  return jwt.sign(
    { id: userId, email, _type: "confirm-email" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24,
    }
  );
};

export const getJoinGroupRequestToken = (
  userId: UserId,
  groupId: GroupId
): string => {
  // expires in a week
  return jwt.sign(
    { id: userId, group: groupId, _type: "join-group" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24 * 7,
    }
  );
};

export const getInviteToGroupToken = (
  inviteId: GroupInvitationId,
  groupId: GroupId
): string => {
  // expires in a week
  return jwt.sign(
    { id: inviteId, group: groupId, _type: "invite-new-user" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24 * 7,
    }
  );
};

export const getInviteToGroupTokenExistingUser = (
  userId: UserId,
  groupId: GroupId
): string => {
  // expires in a week
  return jwt.sign(
    { id: userId, group: groupId, _type: "invite-existing-user" },
    config.server.passportSecret,
    {
      expiresIn: 60 * 60 * 24 * 7,
    }
  );
};

export const generateAuthTokensForUser = async (
  user: User,
  viewport: string = "",
  userAgent: string = "unknown user agent",
  expires: boolean = true
): Promise<{ refreshToken: string; apiToken: string }> => {
  const now = new Date().toISOString();
  const refreshToken = randomUUID();
  await models.sequelize.query(
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
    }
  );
  const expiryOptions = expires ? { expiresIn: ttlTypes.medium } : {};
  const refreshTokenSigned = jwt.sign(
    { refreshToken, _type: "refresh" },
    config.server.passportSecret
  );
  return {
    refreshToken: refreshTokenSigned,
    apiToken: `JWT ${createEntityJWT(user, expiryOptions)}`,
  };
};

export const getDecodedToken = (
  token: string,
  enforceExpiry: boolean = true
): any => {
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
  } catch (e) {
    throw new AuthenticationError(
      `Failed to verify JWT for token ${token} - (${
        decodedToken && JSON.stringify(decodedToken)
      })`
    );
  }
};

export const getVerifiedJWT = (
  request: Request
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
  } catch (e) {
    throw new AuthenticationError(
      `Failed to verify JWT. (${JSON.stringify(jwt.decode(token))})`
    );
  }
};

/**
 * check requested auth access exists in jwt access object
 */
export const checkAccess = (
  reqAccess,
  jwtDecoded: DecodedJWTToken
): boolean => {
  if (!reqAccess && jwtDecoded.access) {
    return false;
  }
  if (!jwtDecoded.access) {
    return true;
  }

  const reqKeys = Object.keys(reqAccess);
  if (reqKeys.length == 0 && jwtDecoded.access) {
    return false;
  }
  for (const key of reqKeys) {
    if (
      !jwtDecoded.access[key] ||
      jwtDecoded.access[key].indexOf(reqAccess[key]) == -1
    ) {
      return false;
    }
  }
  return true;
};

export async function lookupEntity(jwtDecoded: DecodedJWTToken) {
  switch (jwtDecoded._type) {
    case "user":
      return models.User.findByPk(jwtDecoded.id);
    case "device":
      return models.Device.findByPk(jwtDecoded.id);
    case "fileDownload":
      return jwtDecoded;
    default:
      return null;
  }
}

function signedUrl(req, res, next) {
  const jwtParam = req.query["jwt"];
  if (jwtParam == null) {
    return res
      .status(HttpStatusCode.Forbidden)
      .json({ messages: ["Could not find JWT token in query params."] });
  }
  let jwtDecoded;
  try {
    jwtDecoded = jwt.verify(jwtParam, config.server.passportSecret);
  } catch (e) {
    return res
      .status(HttpStatusCode.Forbidden)
      .json({ messages: ["Failed to verify JWT."] });
  }

  if (jwtDecoded._type !== "fileDownload") {
    return res
      .status(HttpStatusCode.Forbidden)
      .json({ messages: ["Incorrect JWT type."] });
  }

  req.jwtDecoded = jwtDecoded;
  next();
}
type AuthenticateMiddleware = (req, res, next) => Promise<void>;

/*
 * Authenticate a JWT in the 'Authorization' header of the given type
 */
const authenticate = (
  types: string[] | null,
  reqAccess?: Record<string, any>
): AuthenticateMiddleware => {
  return async (req, res, next) => {
    let jwtDecoded: DecodedJWTToken;
    try {
      jwtDecoded = getVerifiedJWT(req) as DecodedJWTToken;
    } catch (e) {
      return res
        .status(HttpStatusCode.AuthorizationError)
        .json({ messages: [e.message] });
    }

    if (types && !types.includes(jwtDecoded._type)) {
      res.status(HttpStatusCode.AuthorizationError).json({
        messages: [
          `Invalid JWT access type '${jwtDecoded._type}', must be ${
            types.length > 1 ? "one of " : ""
          }${types.map((t) => `'${t}'`).join(", ")}`,
        ],
      });
      return;
    }
    const hasAccess = checkAccess(reqAccess, jwtDecoded);
    if (!hasAccess) {
      res
        .status(HttpStatusCode.AuthorizationError)
        .json({ messages: ["JWT does not have access."] });
      return;
    }
    const result = await lookupEntity(jwtDecoded);
    if (!result) {
      res.status(HttpStatusCode.AuthorizationError).json({
        messages: [
          `Could not find entity '${jwtDecoded.id}' of type '${jwtDecoded._type}' referenced by JWT.`,
        ],
      });
      return;
    }
    req[jwtDecoded._type] = result;
    next();
  };
};

const authenticateUser: AuthenticateMiddleware = authenticate(["user"]);

export default {
  createEntityJWT,
  signedUrl,
  authenticateUser,
};
