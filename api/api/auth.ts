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
import jwt from "jsonwebtoken";
import { ExtractJwt } from "passport-jwt";
import customErrors from "./customErrors";
import models, { ModelCommon } from "../models";
import { Request } from "express";
import { User } from "@models/User";
/*
 * Create a new JWT for a user or device.
 */
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

export const getResetToken = (user: User, password: string): string => {
  // expires in a day
  return jwt.sign(
    { id: user.id, password: password },
    config.server.passportSecret,
    { expiresIn: 60 * 60 * 24 }
  );
};

export const getDecodedResetToken = (token: string): ResetInfo => {
  try {
    return jwt.verify(token, config.server.passportSecret) as ResetInfo;
  } catch (e) {
    throw new customErrors.AuthenticationError("Failed to verify JWT.");
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
    throw new customErrors.AuthenticationError("Could not find JWT token.");
  }
  try {
    return jwt.verify(token, config.server.passportSecret);
  } catch (e) {
    throw new customErrors.AuthenticationError("Failed to verify JWT.");
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
      .status(403)
      .json({ messages: ["Could not find JWT token in query params."] });
  }
  let jwtDecoded;
  try {
    jwtDecoded = jwt.verify(jwtParam, config.server.passportSecret);
  } catch (e) {
    return res.status(403).json({ messages: ["Failed to verify JWT."] });
  }

  if (jwtDecoded._type !== "fileDownload") {
    return res.status(403).json({ messages: ["Incorrect JWT type."] });
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
      return res.status(401).json({ messages: [e.message] });
    }

    if (types && !types.includes(jwtDecoded._type)) {
      res.status(401).json({
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
      res.status(401).json({ messages: ["JWT does not have access."] });
      return;
    }
    const result = await lookupEntity(jwtDecoded);
    if (!result) {
      res.status(401).json({
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
