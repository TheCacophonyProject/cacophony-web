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
import customErrors, { ClientError } from "./customErrors";
import models, { ModelCommon } from "../models";
import logger from "../logging";
import { Request, Response, NextFunction } from "express";
import { Group } from "@models/Group";
import { User } from "@models/User";
import { Device } from "@models/Device";
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
  return jwt.sign({id: user.id, password: password},config.server.passportSecret);
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
    token = request.query.jwt;
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

const upperFirst = (str: string): string =>
  str.slice(0, 1).toUpperCase() + str.slice(1);

const authenticateAndExtractModelForJWT = (
  types: string[] | null,
  reqAccess?: Record<string, any>
): AuthenticateMiddleware => {
  return async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const jwtDecoded = response.locals.token;
    const type = jwtDecoded._type;
    if (types && !types.includes(jwtDecoded._type)) {
      return next(
        new ClientError(
          `Invalid JWT access type '${type}', must be ${
            types.length > 1 ? "one of " : ""
          }${types.map((t) => `'${t}'`).join(", ")}`,
          401
        )
      );
    }
    const hasAccess = checkAccess(reqAccess, jwtDecoded);
    if (!hasAccess) {
      return next(new ClientError("JWT does not have access.", 401));
    }
    const result = await lookupEntity(jwtDecoded);
    if (result === null) {
      return next(
        new ClientError(
          `Could not find entity '${jwtDecoded.id}' of type '${type}' referenced by JWT.`,
          401
        )
      );
    }
    response.locals[`request${upperFirst(type)}`] = result;
    next();
  };
};

export const extractJWT = (val, { req }) => {
  req.token = getVerifiedJWT(req) as DecodedJWTToken;
  return true;
};

export const authenticate2 = (types: string[] | null, reqAccess?) => {
  return async (val, { req }) => {
    const jwtDecoded: DecodedJWTToken = req.token;
    if (types && !types.includes(jwtDecoded._type)) {
      throw new ClientError(
        `Invalid JWT access type '${jwtDecoded._type}', must be ${
          types.length > 1 ? "one of " : ""
        }${types.map((t) => `'${t}'`).join(", ")}`,
        401
      );
    }
    if (!checkAccess(reqAccess, jwtDecoded)) {
      throw new ClientError("JWT does not have access.", 401);
    }
    const result = await lookupEntity(jwtDecoded);
    if (!result) {
      throw new ClientError(
        `Could not find entity '${jwtDecoded.id}' of type '${jwtDecoded._type}' referenced by JWT.`,
        401
      );
    }
    req[jwtDecoded._type] = result;
    return true;
  };
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

const authenticateUser: AuthenticateMiddleware = authenticate(["user"]);
const authenticateDevice: AuthenticateMiddleware = authenticate(["device"]);
const authenticateAny: AuthenticateMiddleware = authenticate(null);

const authenticateAndExtractUser: AuthenticateMiddleware =
  authenticateAndExtractModelForJWT(["user"]);
const authenticateAndExtractUserWithAccess = (access: {
  devices?: any;
}): AuthenticateMiddleware =>
  authenticateAndExtractModelForJWT(["user"], access);
const authenticateAndExtractDevice: AuthenticateMiddleware =
  authenticateAndExtractModelForJWT(["device"]);
authenticateAndExtractModelForJWT(null);
const authenticateAccess = function (
  type: string[],
  access: Record<string, "r" | "w">
) {
  return authenticate(type, access);
};
const authenticateAdmin = async (req, res, next) => {
  let jwtDecoded;
  try {
    jwtDecoded = getVerifiedJWT(req);
  } catch (e) {
    res.status(401).send(e.message);
  }
  if (jwtDecoded._type != "user") {
    return res.status(403).json({ messages: ["Admin has to be a user"] });
  }
  const user = await models.User.findByPk(jwtDecoded.id);
  if (!user) {
    return res
      .status(401)
      .json({ messages: ["Could not find user from JWT."] });
  }
  if (!user.hasGlobalWrite()) {
    return res.status(403).json({ messages: ["User is not an admin."] });
  }
  req.admin = user;
  next();
};

/*
 * Authenticate a request using a "jwt" query parameter, with fallback
 * to Authorization header. The JWT must of a "user" type.
 */
async function paramOrHeader(req, res, next) {
  let token = req.query["jwt"];

  if (!token) {
    token = ExtractJwt.fromAuthHeaderWithScheme("jwt")(req);
  }
  if (!token) {
    res.status(401).json({ messages: ["Could not find JWT token."] });
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.server.passportSecret);
  } catch (e) {
    res.status(401).json({ messages: ["Failed to verify JWT."] });
    return;
  }

  if (decoded._type !== "user") {
    res.status(401).json({ messages: ["Invalid JWT type."] });
    return;
  }

  // Ensure the user referenced by the JWT actually exists.
  const user = await lookupEntity(decoded);
  if (!user) {
    res.status(401).json({ messages: ["Invalid JWT entity."] });
    return;
  }

  req["user"] = user;
  next();
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

// A request wrapper that also checks if user should be playing around with the
// the named device before continuing.
const userCanAccessDevices = async (request, response, next) => {
  let devices = [];
  if ("device" in request.body && request.body.device) {
    request["device"] = request.body.device;
    devices = [request.body.device.id];
  } else if ("devices" in request.body) {
    devices = request.body.devices;
  } else {
    next(new customErrors.ClientError("No devices specified.", 422));
    return;
  }

  if (!("user" in request)) {
    next(new customErrors.ClientError("No user specified.", 422));
    return;
  }

  try {
    logger.info("Device %s", devices);
    await request.user.checkUserControlsDevices(
      devices,
      request.body.viewAsSuperAdmin
    );
  } catch (e) {
    return response.status(403).json({ messages: [e.message] });
  }
  next();
};

const userCanAccessExtractedDevicesInternal =
  (stopOnFailure = true) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const devices =
      response.locals.devices ||
      (response.locals.device && [response.locals.device]);
    if (!devices || (devices && devices.length === 0)) {
      if (stopOnFailure) {
        return next(new ClientError("No device(s) specified.", 422));
      } else {
        return next();
      }
    }
    const user = response.locals.requestUser;
    if (!user) {
      return next(new ClientError("No user specified.", 422));
    }
    const deviceIds = devices.map(({ id }) => id);
    try {
      logger.info("Device(s) %s", deviceIds);
      await user.checkUserControlsDevices(
        deviceIds,
        response.locals.viewAsSuperUser
      );
    } catch (e) {
      return next(new ClientError(e.message, 403));
    }
    next();
  };

const userCanAccessExtractedDevices = userCanAccessExtractedDevicesInternal();
const userCanAccessOptionalExtractedDevices =
  userCanAccessExtractedDevicesInternal(false);

const userCanAccessDevices3 = async (request, response, next) => {
  let devices = [];
  if ("device" in request && request.device) {
    devices = [request.device.id];
  } else if ("devices" in request) {
    devices = request.devices;
  } else {
    next(new customErrors.ClientError("No devices specified.", 422));
    return;
  }

  if (!("user" in request)) {
    next(new customErrors.ClientError("No user specified.", 422));
    return;
  }

  try {
    await request.user.checkUserControlsDevices(
      devices,
      request.body.viewAsSuperAdmin
    );
  } catch (e) {
    return next(new customErrors.ClientError(e.message, 403));
  }
  next();
};

export const userCanAccessDevices2 = async (val, { req }) => {
  let devices = [];
  if ("device" in req && req.device) {
    req["devices"] = [req.device];
    devices = [req.device.id];
  } else if ("devices" in req) {
    devices = req.devices;
  } else {
    throw new ClientError("No devices specified.", 422);
  }

  if (!("user" in req)) {
    throw new ClientError("No user specified.", 422);
  }

  await req.user.checkUserControlsDevices(devices, req.body.viewAsSuperAdmin);

  return true;
};

// A request middleware that also checks if user should be playing around with the
// the group before continuing.
const checkUserPermissionsForGroup =
  (permissions: "user" | "admin") =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const user: User = response.locals.requestUser;
    const group: Group = response.locals.group;
    if (!group) {
      return next(new ClientError("No group specified.", 422));
    }
    if (!user) {
      return next(new ClientError("No user specified.", 422));
    }

    if (
      (permissions === "user" &&
        (await user.canDirectlyOrIndirectlyAccessGroup(group))) ||
      (permissions === "admin" &&
        (await user.canDirectlyOrIndirectlyAdministrateGroup(group)))
    ) {
      next();
    } else {
      return next(
        new ClientError(
          `User ${user.username} (${user.id}) doesn't have permission to access group ${group.groupname} (${group.id})`,
          403
        )
      );
    }
  };

const checkUserPermissionsForDevice =
  (permissions: "user" | "admin") =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const user: User = response.locals.requestUser;
    const device: Device = response.locals.device;
    if (!device) {
      return next(new ClientError("No device specified.", 422));
    }
    if (!user) {
      return next(new ClientError("No user specified.", 422));
    }

    if (
      (permissions === "user" &&
        (await user.canDirectlyOrIndirectlyAccessDevice(device))) ||
      (permissions === "admin" &&
        (await user.canDirectlyOrIndirectlyAdministrateDevice(device)))
    ) {
      next();
    } else {
      return next(
        new ClientError(
          `User ${user.username} (${user.id}) doesn't have permission to access group ${device.groupname} (${device.id})`,
          403
        )
      );
    }
  };

const userHasAccessToGroup = checkUserPermissionsForGroup("user");
const userHasAdminAccessToGroup = checkUserPermissionsForGroup("admin");
const userHasAccessToDevice = checkUserPermissionsForDevice("user");
const userHasAdminAccessToDevice = checkUserPermissionsForDevice("admin");

export default {
  authenticate2,
  createEntityJWT,
  authenticateUser,
  authenticateAndExtractUser,
  authenticateAndExtractUserWithAccess,
  authenticateAndExtractDevice,
  authenticateDevice,
  authenticateAny,
  authenticateAccess,
  authenticateAdmin,
  paramOrHeader,
  signedUrl,
  userCanAccessDevices,
  userCanAccessDevices2,
  userCanAccessDevices3,
  userCanAccessExtractedDevices,
  userCanAccessOptionalExtractedDevices,

  userHasAccessToGroup,
  userHasAdminAccessToGroup,
  userHasAccessToDevice,
  userHasAdminAccessToDevice,
};
