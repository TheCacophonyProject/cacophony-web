import type { NextFunction, Request, Response } from "express";
import { ExtractJwt } from "passport-jwt";
import jwt from "jsonwebtoken";
import type { DecodedJWTToken } from "./auth.js";
import { getVerifiedJWTFromBody } from "./auth.js";
import {
  checkAccess,
  getDecodedToken,
  getVerifiedJWT,
  lookupEntity,
} from "./auth.js";
import type { ModelStaticCommon } from "@models";
import modelsInit from "../models/index.js";
import log from "../logging.js";
import { createHash } from "crypto";
import { modelTypeName, modelTypeNamePlural } from "./middleware.js";
import type { ValidationChain } from "express-validator";
import { validationResult } from "express-validator";
import {
  AuthenticationError,
  AuthorizationError,
  ClientError,
} from "./customErrors.js";
import type { User } from "models/User.js";
import { Op } from "sequelize";
import type { Device } from "models/Device.js";
import type { RecordingId, ScheduleId, UserId } from "@typedefs/api/common.js";
import type { Group } from "models/Group.js";
import type { Recording } from "models/Recording.js";
import type { Station } from "@/models/Station.js";
import type { Schedule } from "@/models/Schedule.js";
import { RecordingType, UserGlobalPermission } from "@typedefs/api/consts.js";
import { urlNormaliseName } from "@/emails/htmlEmailUtils.js";
import { SuperUsers } from "@/Globals.js";
import type { Alert } from "@models/Alert.js";
import type { Event } from "@models/Event.js";
import config from "@/config.js";
import { delayMs, userShouldBeRateLimited } from "@/Server.js";
import { getTrackData } from "@models/Track.js";

const models = await modelsInit();

const upperFirst = (str: string): string =>
  str.slice(0, 1).toUpperCase() + str.slice(1);

const extractJwtAuthenticatedEntityCommon = async (
  jwtDecoded: DecodedJWTToken,
  types: string[],
  request: Request,
  response: Response,
  next: NextFunction,
  reqAccess?: { devices?: any },
  requireSuperAdmin = false,
  requireActivatedUser = false
): Promise<void> => {
  const type = jwtDecoded._type;

  if (types && !types.includes(jwtDecoded._type)) {
    return next(
      new AuthenticationError(
        `Invalid JWT access type '${type}', must be ${
          types.length > 1 ? "one of " : ""
        }${types.map((t) => `'${t}'`).join(", ")}`
      )
    );
  }

  if (
    jwtDecoded._type === "user" &&
    requireActivatedUser &&
    jwtDecoded.activated === false
  ) {
    return next(
      new AuthorizationError(
        "You must have confirmed your email address to activate your account in order to access this API."
      )
    );
  }

  const hasAccess = checkAccess(reqAccess, jwtDecoded);
  if (!hasAccess) {
    return next(new AuthenticationError("JWT does not have access."));
  }

  if (requireSuperAdmin && type !== "user") {
    return next(new AuthorizationError("Admin has to be a user"));
  }

  if (type === "user" || type === "device") {
    if (type === "user") {
      const superUserPermissions = SuperUsers.get(jwtDecoded.id);
      if (!superUserPermissions) {
        response.locals.requestUser = {
          id: jwtDecoded.id,
          hasGlobalRead: () => false,
          hasGlobalWrite: () => false,
          globalPermission: UserGlobalPermission.Off,
        };
      } else {
        response.locals.requestUser = {
          id: jwtDecoded.id,
          userName: superUserPermissions.userName,
          hasGlobalRead: () => true,
          hasGlobalWrite: () =>
            superUserPermissions.globalPermission ===
            UserGlobalPermission.Write,
          globalPermission: superUserPermissions.globalPermission,
        };
      }
      // NOTE: See if we'd like to rate limit this user request.
      // If this request user has used more than 20% of user cpu time in the past minute,
      // Add a delay to rate limit the requester.
      if (userShouldBeRateLimited(response.locals.requestUser.id)) {
        response.locals.requestUser.wasRateLimited = true;
        // Stagger the amount of rate-limiting to try and spread out repeat requests
        await delayMs(3000 + Math.floor(Math.random() * 4000));
      }
    } else if (type === "device") {
      response.locals.requestDevice = { id: jwtDecoded.id };
    }
  } else {
    let result: DecodedJWTToken | User | null;
    try {
      result = await lookupEntity(models, jwtDecoded);
    } catch (e) {
      return next(e);
    }
    if (result === null) {
      return next(
        new AuthorizationError(
          `Could not find entity '${jwtDecoded.id}' of type '${type}' referenced by JWT.`
        )
      );
    }
    response.locals[`request${upperFirst(type)}`] = result;
  }

  response.locals.viewAsSuperUser = false;
  if (request.query["view-mode"] !== "user" && response.locals.requestUser) {
    const globalPermissions = (response.locals.requestUser as User)
      .globalPermission;
    response.locals.viewAsSuperUser =
      globalPermissions !== UserGlobalPermission.Off;
  }

  if (requireSuperAdmin && !response.locals.viewAsSuperUser) {
    return next(new AuthorizationError("User is not an admin."));
  }
};

const extractJwtAuthenticatedEntity =
  (
    types: string[],
    reqAccess?: { devices?: any },
    requireSuperAdmin = false,
    requireActivatedUser = false
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.locals.token = getVerifiedJWT(request) as DecodedJWTToken;
      const jwtDecoded = response.locals.token;
      await extractJwtAuthenticatedEntityCommon(
        jwtDecoded,
        types,
        request,
        response,
        next,
        reqAccess,
        requireSuperAdmin,
        requireActivatedUser
      );
      return next();
    } catch (e) {
      // We might need to rate limit this.
      const token = ExtractJwt.fromAuthHeaderWithScheme("jwt")(request);
      const user = token._type === "user";
      if (!token) {
        // User IP address for rate limiting
        let ip =
          request.headers["x-forwarded-for"] || request.socket.remoteAddress;
        if (Array.isArray(ip)) {
          ip = ip.join("");
        }
        if (ip) {
          const hashedIp = createHash("sha1")
            .update(ip, "utf8")
            .digest("hex")
            .substring(0, 10);
          response.locals.requestUser = {
            id: hashedIp,
            hasGlobalRead: () => false,
            hasGlobalWrite: () => false,
            globalPermission: UserGlobalPermission.Off,
          };
        }
      }
      if (user) {
        response.locals.requestUser = {
          id: token.id,
          hasGlobalRead: () => false,
          hasGlobalWrite: () => false,
          globalPermission: UserGlobalPermission.Off,
        };
        if (userShouldBeRateLimited(response.locals.requestUser.id)) {
          response.locals.requestUser.wasRateLimited = true;
          // Stagger the amount of rate-limiting to try and spread out repeat requests
          await delayMs(3000 + Math.floor(Math.random() * 4000));
        }
      }
      return next(e);
    }
  };

const extractJwtAuthenticatedEntityFromBody =
  (
    tokenField: string,
    types: string[],
    reqAccess?: { devices?: any },
    requireSuperAdmin = false,
    requireActivatedUser = false
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const jwtDecoded = getVerifiedJWTFromBody(
        tokenField,
        request
      ) as DecodedJWTToken;
      response.locals.tokenInfo = jwtDecoded;
      await extractJwtAuthenticatedEntityCommon(
        jwtDecoded,
        types,
        request,
        response,
        next,
        reqAccess,
        requireSuperAdmin,
        requireActivatedUser
      );
      return next();
    } catch (e) {
      return next(e);
    }
  };
export const extractJwtAuthorizedUser = extractJwtAuthenticatedEntity(["user"]);
export const extractJwtAuthorizedActivatedUser = extractJwtAuthenticatedEntity(
  ["user"],
  undefined,
  false,
  true
);
export const extractJwtAuthorizedUserOrDevice = extractJwtAuthenticatedEntity([
  "user",
  "device",
]);
export const extractJwtAuthorisedSuperAdminUser = extractJwtAuthenticatedEntity(
  ["user"],
  undefined,
  true
);
export const extractJwtAuthorisedDevice = extractJwtAuthenticatedEntity([
  "device",
]);

export const extractJwtAuthorizedUserFromBody = (tokenField: string) =>
  extractJwtAuthenticatedEntityFromBody(tokenField, ["user"]);
const deviceAttributes = [
  "id",
  "deviceName",
  "location",
  "saltId",
  "uuid",
  "GroupId",
  "lastConnectionTime",
  "lastRecordingTime",
  "public",
  "active",
  "kind",
  "ScheduleId",
  "password", // Needed for auth, but not passed through when mapping to response.
  "heartbeat",
  "nextHeartbeat",
];

const getGroupInclude = (
  useAdminAccess: { admin: true } | {},
  requestUserId: UserId
) => ({
  include: [
    {
      model: models.User,
      attributes: ["id"],
      through: {
        where: {
          ...useAdminAccess,
          removedAt: { [Op.eq]: null },
        },
        attributes: ["admin", "settings", "owner", "pending"],
      },
      where: { id: requestUserId },
    },
  ],
});

const getDeviceInclude =
  (deviceWhere: any, groupWhere: any) =>
  (useAdminAccess: { admin: true } | {}, requestUserId: UserId) => ({
    where: {
      ...deviceWhere,
      [Op.or]: [{ "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } }],
    },
    attributes: deviceAttributes,
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupName"],
        required:
          Object.keys(groupWhere).length !== 0 &&
          Object.keys(deviceWhere).length === 0,
        where: groupWhere,
        include: [
          {
            model: models.User,
            attributes: ["id"],
            required: false,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: { [Op.eq]: null },
                pending: { [Op.eq]: null },
              },
              attributes: ["admin", "UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
    ],
  });

const getStationInclude =
  (stationWhere: any, groupWhere: any) =>
  (useAdminAccess: { admin: true } | {}, requestUserId: UserId) => ({
    where: {
      ...stationWhere,
    },
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupName"],
        required: true,
        where: groupWhere,
        include: [
          {
            model: models.User,
            attributes: ["id"],
            required: true,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: { [Op.eq]: null },
                pending: { [Op.eq]: null },
              },
              attributes: ["UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
    ],
  });

const getScheduleInclude =
  (groupWhere: any) =>
  (useAdminAccess: { admin: true } | {}, requestUserId: UserId) => ({
    where: {
      [Op.and]: [{ "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } }],
    },
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupName"],
        required: Object.keys(groupWhere).length !== 0,
        where: groupWhere,
        include: [
          {
            model: models.User,
            attributes: ["id"],
            required: false,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: { [Op.eq]: null },
                pending: { [Op.eq]: null },
              },
              attributes: ["admin", "UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
    ],
  });

const getRecordingInclude =
  (recordingsWhere: any, groupWhere: any, deviceWhere: any) =>
  (useAdminAccess: { admin: true } | {}, requestUserId: UserId) => ({
    where: {
      ...recordingsWhere,
      [Op.or]: [{ "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } }],
    },
    // TODO - RecordingAttributes
    //attributes: deviceAttributes,
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupName"],
        required: false,
        where: groupWhere,
        include: [
          {
            model: models.User,
            attributes: ["id"],
            required: false,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: { [Op.eq]: null },
                pending: { [Op.eq]: null },
              },
              attributes: ["admin", "UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
      {
        model: models.Device,
        attributes: ["id", "deviceName"],
        required: false,
        where: deviceWhere,
      },
    ],
  });

export const parseJSONField =
  (field: ValidationChain) =>
  (request: Request, response: Response, next: NextFunction) => {
    let value = extractValFromRequest(request, field);
    const location = extractFieldLocationFromRequest(request, field);
    const key = extractFieldNameFromRequest(request, field);
    if (value) {
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch (e) {
          return next(
            new ClientError(`Malformed JSON for '${location}.${key}'`)
          );
        }
      }
      if (typeof value !== "object") {
        throw new ClientError(`Malformed json`);
      }
      response.locals[key] = value;
    }
    next();
  };

export const extractValFromRequest = (
  request: Request,
  valGetter?: ValidationChain
): string | undefined => {
  if (valGetter) {
    const location = (valGetter.builder as any).locations[0];
    // If fields is an array, take the first one that exists.
    for (const field of (valGetter.builder as any).fields) {
      if (request[location][field]) {
        return request[location][field];
      }
    }
  }
};

const extractFieldNameFromRequest = (
  request: Request,
  valGetter?: ValidationChain
): string | undefined => {
  if (valGetter) {
    const location = (valGetter.builder as any).locations[0];
    // If fields is an array, take the first one that exists.
    for (const field of (valGetter.builder as any).fields) {
      if (request[location][field]) {
        return field;
      }
    }
  }
};

const extractFieldLocationFromRequest = (
  request: Request,
  valGetter?: ValidationChain
): string | undefined => {
  if (valGetter) {
    return (valGetter.builder as any).locations[0];
  }
};

type ModelGetter<T> = (
  id: string,
  id2: string,
  context?: any
) => Promise<ModelStaticCommon<T> | ClientError | null>;

type ModelsGetter<T> = (
  id: string,
  id2: string,
  context?: any
) => Promise<ModelStaticCommon<T>[] | ClientError | null>;

export const fetchModel =
  <T>(
    modelType: ModelStaticCommon<T>,
    required: boolean,
    byName: boolean,
    byId: boolean,
    modelGetter: ModelGetter<T> | ModelsGetter<T>,
    primary: ValidationChain | number | string,
    secondary?: ValidationChain | number | string
  ) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const modelName = modelTypeName(modelType);

    let id;
    if (typeof primary === "number" || typeof primary === "string") {
      id = primary;
    } else {
      id = extractValFromRequest(request, primary) as string;
    }
    if (!id && !required) {
      return next();
    }
    let id2;
    if (typeof secondary === "number" || typeof secondary === "string") {
      id2 = secondary;
    } else {
      id2 = extractValFromRequest(request, secondary) as string;
    }
    response.locals.onlyActive = true; // Default to only showing active devices.
    response.locals.withRecordings = false; // Default to showing stations without any recordings.
    if (
      ("onlyActive" in request.query &&
        Boolean(request.query.onlyActive) === false) ||
      ("only-active" in request.query &&
        Boolean(request.query["only-active"]) === false)
    ) {
      response.locals.onlyActive = false;
    }
    if (
      "with-recordings" in request.query &&
      Boolean(request.query["with-recordings"]) === true
    ) {
      response.locals.withRecordings = true;
    }
    if ("deleted" in request.query) {
      response.locals.deleted = Boolean(request.query.deleted);
    }

    let model;
    try {
      model = await modelGetter(id, id2, response.locals);
    } catch (e) {
      log.error("%s", e.sql);
      return next(e);
    }
    if (model instanceof ClientError) {
      return next(model);
    } else if (model === null) {
      if (required) {
        const forUser = !!response.locals.requestUser;
        if (byName && byId) {
          // TODO - provide better error messages in the case the group (id2) doesn't exist?
          return next(
            new AuthorizationError(
              `Could not find a ${modelName} with a name or id of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`
            )
          );
        } else if (byId) {
          return next(
            new AuthorizationError(
              `Could not find a ${modelName} with an id of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`
            )
          );
        } else if (byName) {
          return next(
            new AuthorizationError(
              `Could not find a ${modelName} with a name of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`
            )
          );
        } else {
          return next(
            new AuthorizationError(
              `Could not find any ${modelTypeNamePlural(modelType)}${
                forUser ? " for user" : ""
              }`
            )
          );
        }
      }
    } else {
      if (Array.isArray(model)) {
        response.locals[modelTypeNamePlural(modelType)] = model;
      } else {
        response.locals[modelName] = model;
      }
    }
    next();
  };

export const fetchRequiredModel = <T>(
  modelType: ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelGetter: ModelGetter<T>,
  primary: ValidationChain | number,
  secondary?: ValidationChain
) => fetchModel(modelType, true, byName, byId, modelGetter, primary, secondary);

export const fetchRequiredModels = <T>(
  modelType: ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelsGetter: ModelsGetter<T>,
  primary?: ValidationChain,
  secondary?: ValidationChain
) =>
  fetchModel(modelType, true, byName, byId, modelsGetter, primary, secondary);

export const fetchOptionalModel = <T>(
  modelType: ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelGetter: ModelGetter<T>,
  primary: ValidationChain | string | number,
  secondary?: ValidationChain | string | number
) =>
  fetchModel(modelType, false, byName, byId, modelGetter, primary, secondary);

const getDevices =
  (forRequestUser: boolean = false, asAdmin: boolean) =>
  (
    groupNameOrId?: string,
    unused2?: string,
    context?: any
  ): Promise<ModelStaticCommon<Device>[] | ClientError | null> => {
    let getDeviceOptions;
    let groupWhere = {};

    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);
    if (groupNameOrId) {
      if (groupIsId) {
        groupWhere = { id: parseInt(groupNameOrId) };
      } else {
        groupWhere = { groupName: groupNameOrId };
      }
    }

    const allDevicesOptions = {
      where: {},
      include: [
        {
          model: models.Group,
          required: true,
          where: groupWhere,
        },
      ],
    };

    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getDeviceOptions = getIncludeForUser(
          context,
          getDeviceInclude({}, groupWhere),
          asAdmin
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getDeviceOptions = allDevicesOptions;
    }

    if (!getDeviceOptions.where) {
      getDeviceOptions = allDevicesOptions;
    }

    if (context.onlyActive) {
      (getDeviceOptions as any).where = (getDeviceOptions as any).where || {};
      (getDeviceOptions as any).where.active = true;
    }
    getDeviceOptions.subQuery = false;
    return models.Device.findAll({
      ...getDeviceOptions,
      order: ["deviceName"],
    });
  };

const getStations =
  (forRequestUser: boolean = false, asAdmin: boolean) =>
  (
    groupNameOrId?: string,
    unused2?: string,
    context?: any
  ): Promise<ModelStaticCommon<Station>[] | ClientError | null> => {
    let getStationsOptions;
    let groupWhere = {};

    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);
    if (groupNameOrId) {
      if (groupIsId) {
        groupWhere = { id: parseInt(groupNameOrId) };
      } else {
        groupWhere = { groupName: groupNameOrId };
      }
    }
    const allStationsOptions = {
      where: {},
      include: [
        {
          model: models.Group,
          required: true,
          where: groupWhere,
          attributes: ["id", "groupName"],
        },
      ],
    };

    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getStationsOptions = getIncludeForUser(
          context,
          getStationInclude({}, groupWhere),
          asAdmin
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getStationsOptions = allStationsOptions;
    }

    if (!getStationsOptions.where) {
      getStationsOptions = allStationsOptions;
    }

    if (context.onlyActive) {
      (getStationsOptions as any).where =
        (getStationsOptions as any).where || {};
      (getStationsOptions as any).where.retiredAt = { [Op.eq]: null };
    }
    if (context.withRecordings) {
      (getStationsOptions as any).where =
        (getStationsOptions as any).where || {};
      (getStationsOptions as any).where[Op.and] = [
        {
          [Op.or]: [
            {
              lastThermalRecordingTime: { [Op.ne]: null },
              lastAudioRecordingTime: { [Op.ne]: null },
              automatic: true,
            },
            {
              automatic: false,
            },
          ],
        },
      ];
    }

    return models.Station.findAll({
      ...getStationsOptions,
      order: ["name"],
      subQuery: false,
    });
  };

const getStation =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
  (
    stationNameOrId: string,
    groupNameOrId?: string,
    context?: any
  ): Promise<ModelStaticCommon<Station> | ClientError | null> => {
    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);

    const stationIsId =
      !isNaN(parseInt(stationNameOrId)) &&
      parseInt(stationNameOrId).toString() === String(stationNameOrId);

    let stationWhere;
    let groupWhere = {};

    let groupNameMatch: any = groupNameOrId;
    if (!groupIsId && groupNameOrId !== urlNormaliseName(groupNameOrId)) {
      groupNameMatch = {
        [Op.in]: [groupNameOrId, urlNormaliseName(groupNameOrId)],
      };
    }
    let stationNameMatch: any = stationNameOrId;
    if (!stationIsId && stationNameOrId !== urlNormaliseName(stationNameOrId)) {
      stationNameMatch = {
        [Op.in]: [stationNameOrId, urlNormaliseName(stationNameOrId)],
      };
    }

    if (groupIsId && stationIsId) {
      stationWhere = {
        id: parseInt(stationNameOrId),
        GroupId: parseInt(groupNameOrId),
      };
    } else if (stationIsId && groupNameOrId) {
      stationWhere = {
        id: parseInt(stationNameOrId),
        "$Group.groupName$": groupNameMatch,
      };
    } else if (stationIsId && !groupNameOrId) {
      stationWhere = {
        id: parseInt(stationNameOrId),
      };
    } else if (groupIsId) {
      stationWhere = {
        name: stationNameOrId,
        GroupId: parseInt(groupNameOrId),
      };
    } else {
      stationWhere = {
        name: stationNameMatch,
        "$Group.groupName$": groupNameMatch,
      };
    }
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else if (groupNameOrId) {
      groupWhere = { groupName: groupNameMatch };
    }

    let getStationOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints

        getStationOptions = getIncludeForUser(
          context,
          getStationInclude(stationWhere, groupWhere),
          asAdmin
        );
        if (!getStationOptions.where && stationWhere) {
          getStationOptions = {
            where: stationWhere,
            include: [
              {
                model: models.Group,
                required: true,
                attributes: ["groupName"],
                where: groupWhere,
              },
            ],
          };
        }
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getStationOptions = {
        where: stationWhere,
        include: [
          {
            model: models.Group,
            required: true,
            attributes: ["groupName"],
            where: groupWhere,
          },
        ],
      };
    }

    if (context.onlyActive || !stationIsId) {
      (getStationOptions as any).where = (getStationOptions as any).where || {};
      (getStationOptions as any).where.retiredAt = { [Op.eq]: null };
    }
    getStationOptions.subQuery = false;
    return models.Station.findOne(getStationOptions);
  };

const getSchedules =
  (forRequestUser: boolean = false, asAdmin: boolean) =>
  (
    groupNameOrId?: string,
    unused2?: string,
    context?: any
  ): Promise<ModelStaticCommon<Schedule>[] | ClientError | null> => {
    let getScheduleOptions;
    let groupWhere = {};

    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);
    if (groupNameOrId) {
      if (groupIsId) {
        groupWhere = { id: parseInt(groupNameOrId) };
      } else {
        groupWhere = { groupName: groupNameOrId };
      }
    }

    const allSchedulesOptions = {
      where: {},
      include: [
        {
          model: models.Group,
          required: true,
          where: groupWhere,
        },
      ],
    };

    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getScheduleOptions = getIncludeForUser(
          context,
          getScheduleInclude(groupWhere),
          asAdmin
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getScheduleOptions = allSchedulesOptions;
    }

    if (!getScheduleOptions.where) {
      getScheduleOptions = allSchedulesOptions;
    }
    return models.Schedule.findAll(getScheduleOptions);
  };

const getGroups =
  (forRequestUser: boolean = false, asAdmin: boolean) =>
  (
    unused1?: string,
    unused2?: string,
    context?: any
  ): Promise<ModelStaticCommon<Group>[] | ClientError | null> => {
    let getGroupOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getGroupOptions = getIncludeForUser(context, getGroupInclude, asAdmin);
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getGroupOptions = {
        where: {},
      };
    }
    return models.Group.findAll({
      ...getGroupOptions,
      order: ["groupName"],
      subQuery: false,
    });
  };

const getRecordingRelationships = (
  recordingQuery: any,
  includeRelationships: boolean
): any => {
  recordingQuery.attributes = [
    "id",
    "DeviceId",
    "type",
    "duration",
    "recordingDateTime",
    "location",
    "cacophonyIndex",
    "relativeToDawn",
    "airplaneModeOn",
    "relativeToDusk",
    "public",
    "rawMimeType",
    "fileMimeType",
    "processingState",
    "processing",
    "comment",
    "GroupId",
    "StationId",
    "rawFileKey",
    "fileKey",
    "additionalMetadata",
    "batteryLevel",
    "batteryCharging",
    "version",
    "processingStartTime",
    "processingEndTime",
    "redacted",
  ];
  recordingQuery.include = recordingQuery.include || [];
  if (includeRelationships) {
    recordingQuery.include.push({
      model: models.Tag,
      order: ["createdAt"],
      attributes: [
        "id",
        "detail",
        "comment",
        "taggerId",
        "automatic",
        "confidence",
        "startTime",
        "duration",
        "createdAt",
      ],
      include: [
        {
          model: models.User,
          as: "tagger",
          required: false,
          attributes: ["userName"],
        },
      ],
      required: false,
    });
    recordingQuery.include.push({
      model: models.Track,
      where: { archivedAt: null },
      attributes: [
        "id",
        "startSeconds",
        "endSeconds",
        "minFreqHz",
        "maxFreqHz",
        "filtered",
      ],
      required: false,
      include: [
        {
          model: models.TrackTag,
          required: false,
          where: { archivedAt: null },
          order: ["createdAt"],
          attributes: [
            "id",
            "what",
            "path",
            "automatic",
            "confidence",
            "model",
            "TrackId",
            "UserId",
            "createdAt",
            "updatedAt",
          ],
          include: [
            {
              model: models.User,
              required: false,
              attributes: ["userName"],
            },
          ],
        },
      ],
    });
    recordingQuery.include.push({
      model: models.Station,
      attributes: ["name"],
      required: false,
    });
  }
  return recordingQuery;
};

const getRecording =
  (
    forRequestUser: boolean = false,
    asAdmin: boolean = false,
    includeTrackMetadata = false,
    includeRelationships = false
  ) =>
  (
    recordingId: string,
    unused: string,
    context?: any
  ): Promise<ModelStaticCommon<Recording> | ClientError | null> => {
    const recordingWhere = {
      id: parseInt(recordingId),
    };
    if ("deleted" in context) {
      if (context.deleted === true) {
        (recordingWhere as any).deletedAt = { [Op.ne]: null };
      } else if (context.deleted === false) {
        (recordingWhere as any).deletedAt = { [Op.eq]: null };
      }
    }

    let getRecordingOptions;
    const groupWhere = {};
    const deviceWhere = {};
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getRecordingOptions = getIncludeForUser(
          context,
          getRecordingInclude(recordingWhere, groupWhere, deviceWhere),
          asAdmin
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    }
    if (
      !getRecordingOptions ||
      (getRecordingOptions && !getRecordingOptions.include)
    ) {
      if (!getRecordingOptions) {
        getRecordingOptions = {};
      }
      if (includeRelationships) {
        getRecordingOptions.include = [
          {
            model: models.Group,
            required: true,
            where: groupWhere,
          },
          {
            model: models.Device,
            required: true,
            where: deviceWhere,
          },
        ];
      }
    }
    getRecordingOptions.where = getRecordingOptions.where || recordingWhere;
    getRecordingOptions = getRecordingRelationships(
      getRecordingOptions,
      includeRelationships
    );
    return models.Recording.findOne(getRecordingOptions).then((rec) => {
      if (includeTrackMetadata) {
        // TODO: M Fetch all the metadata for tracks.
        if (rec) {
          const trackMetas = [];
          for (const track of rec.Tracks) {
            trackMetas.push(getTrackData(track.id));
          }
          return Promise.all(trackMetas).then((trackMetadatas) => {
            for (let i = 0; i < trackMetadatas.length; i++) {
              if (Object.keys(trackMetadatas[i]).length > 0) {
                rec.Tracks[i].data = trackMetadatas[i];
              }
            }
            return rec;
          });
        }
      }
      return rec;
    });
  };

const getRecordings =
  (
    forRequestUser: boolean = false,
    asAdmin: boolean = false,
    includeRelationships = false
  ) =>
  (
    recordingIds: string,
    unused: string,
    context?: any
  ): Promise<ModelStaticCommon<Recording>[] | ClientError> => {
    const recordingWhere = {
      id: { [Op.in]: recordingIds },
    };
    if ("deleted" in context) {
      if (context.deleted === true) {
        (recordingWhere as any).deletedAt = { [Op.ne]: null };
      } else if (context.deleted === false) {
        (recordingWhere as any).deletedAt = { [Op.eq]: null };
      }
    }
    let getRecordingOptions;
    const groupWhere = {};
    const deviceWhere = {};
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getRecordingOptions = getIncludeForUser(
          context,
          getRecordingInclude(recordingWhere, groupWhere, deviceWhere),
          asAdmin
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getRecordingOptions = {
        where: recordingWhere,
        include: [
          {
            model: models.Group,
            required: true,
            where: groupWhere,
          },
          {
            model: models.Device,
            required: true,
            where: deviceWhere,
          },
        ],
      };
    }
    getRecordingOptions = getRecordingRelationships(
      getRecordingOptions,
      includeRelationships
    );
    return models.Recording.findAll({
      ...getRecordingOptions,
      order: ["recordingDateTime"],
    });
  };

const getDevice =
  (
    forRequestUser: boolean = false,
    asAdmin: boolean = false,
    forDevice: boolean = false
  ) =>
  (
    deviceNameOrId: string,
    groupNameOrId?: string,
    context?: any
  ): Promise<ModelStaticCommon<Device> | ClientError | null> => {
    const deviceIsId =
      !isNaN(parseInt(deviceNameOrId)) &&
      parseInt(deviceNameOrId).toString() === String(deviceNameOrId);
    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);

    let deviceWhere;
    let groupWhere = {};

    let groupNameMatch: any = groupNameOrId;
    if (!groupIsId && groupNameOrId !== urlNormaliseName(groupNameOrId)) {
      groupNameMatch = {
        [Op.in]: [groupNameOrId, urlNormaliseName(groupNameOrId)],
      };
    }
    let deviceNameMatch: any = deviceNameOrId;
    if (!deviceIsId && deviceNameOrId !== urlNormaliseName(deviceNameOrId)) {
      deviceNameMatch = {
        [Op.in]: [deviceNameOrId, urlNormaliseName(deviceNameOrId)],
      };
    }

    if (deviceIsId && groupIsId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
        GroupId: parseInt(groupNameOrId),
      };
    } else if (deviceIsId && groupNameOrId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
        "$Group.groupName$": groupNameMatch,
      };
    } else if (deviceIsId && !groupNameOrId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
      };
    } else if (groupIsId) {
      deviceWhere = {
        deviceName: deviceNameMatch,
        GroupId: parseInt(groupNameOrId),
      };
    } else {
      deviceWhere = {
        deviceName: deviceNameMatch,
        "$Group.groupName$": groupNameMatch,
      };
    }
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else if (groupNameOrId) {
      groupWhere = { groupName: groupNameMatch };
    }

    let getDeviceOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getDeviceOptions = getIncludeForUser(
          context,
          getDeviceInclude(deviceWhere, groupWhere),
          asAdmin
        );
        if (!getDeviceOptions.where && deviceWhere) {
          getDeviceOptions = {
            where: deviceWhere,
            attributes: deviceAttributes,
            include: [
              {
                model: models.Group,
                required: true,
                where: groupWhere,
              },
            ],
          };
        }
      } else if (!forDevice) {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    }
    if (!getDeviceOptions) {
      getDeviceOptions = {
        where: deviceWhere,
        attributes: deviceAttributes,
        include: [
          {
            model: models.Group,
            required: true,
            where: groupWhere,
          },
        ],
      };
    }

    // FIXME(ManageStations) - When re-registering we can actually have two devices in the same group with the same name - but one
    //  will be inactive.  Maybe we should change the name of the inactive device to disambiguate it?
    if (context.onlyActive) {
      (getDeviceOptions as any).where = (getDeviceOptions as any).where || {};
      (getDeviceOptions as any).where.active = true;
    }
    getDeviceOptions.subQuery = false;
    return models.Device.findOne(getDeviceOptions);
  };

const getIncludeForUser = (
  context: any,
  includeFn: (
    asAdmin: { admin: true } | {},
    userId: UserId,
    additionalWhere?: any
  ) => any,
  asAdmin: boolean = false
) => {
  const requestingWithSuperAdminPermissions =
    context.viewAsSuperUser &&
    context.requestUser[!asAdmin ? "hasGlobalRead" : "hasGlobalWrite"]();

  if (!requestingWithSuperAdminPermissions) {
    // Then check that the user can access the device.
    return includeFn(asAdmin ? { admin: true } : {}, context.requestUser.id);
  } else {
    // Don't add any permission constraints when getting the resource
    log.info(
      `Accessing model by user #${context.requestUser.id} (${context.requestUser.userName}) as super-admin`
    );
    return {};
  }
};

const getGroup =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
  (
    groupNameOrId?: string,
    unusedParam?: string,
    context?: any
  ): Promise<ModelStaticCommon<Group> | ClientError | null> => {
    // @ts-ignore
    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);
    let groupWhere;
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else {
      let groupNameMatch: any = groupNameOrId;
      if (groupNameOrId !== urlNormaliseName(groupNameOrId)) {
        groupNameMatch = {
          [Op.in]: [groupNameOrId, urlNormaliseName(groupNameOrId)],
        };
      }
      groupWhere = { groupName: groupNameMatch };
    }
    let getGroupOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getGroupOptions = getIncludeForUser(context, getGroupInclude, asAdmin);
        getGroupOptions.where = groupWhere;
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getGroupOptions = {
        where: groupWhere,
      };
    }
    getGroupOptions.subQuery = false;
    return models.Group.findOne(getGroupOptions);
  };

const getEvent =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
  (
    eventDetailId?: string,
    unusedParam?: string,
    context?: any
  ): Promise<ModelStaticCommon<Event> | ClientError | null> => {
    let eventWhere;
    if (eventDetailId) {
      eventWhere = {
        id: parseInt(eventDetailId),
      };
    }
    let getEventOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getEventOptions = getIncludeForUser(
          context,
          (asAdmin, userId) => {
            return {
              attributes: ["dateTime", "id"],
              include: [
                {
                  model: models.DetailSnapshot,
                  as: "EventDetail",
                  required: true,
                  attributes: ["type", "details"],
                },
                {
                  model: models.Device,
                  attributes: [],
                  required: true,
                  include: [
                    {
                      model: models.Group,
                      attributes: [],
                      required: true,
                      where: {},
                      include: [
                        {
                          model: models.User,
                          attributes: [],
                          required: true,
                          through: {
                            where: {
                              ...asAdmin,
                              removedAt: { [Op.eq]: null },
                              pending: { [Op.eq]: null },
                            },
                            attributes: [],
                          },
                          where: { id: userId },
                        },
                      ],
                    },
                  ],
                },
              ],
            };
          },
          asAdmin
        );
        getEventOptions.where = eventWhere;
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getEventOptions = {
        where: eventWhere,
      };
    }
    return models.Event.findOne(getEventOptions);
  };

const getUser =
  () =>
  (
    userEmailOrId: string
  ): Promise<ModelStaticCommon<User> | ClientError | null> => {
    // @ts-ignore
    const userIsId =
      !isNaN(parseInt(userEmailOrId)) &&
      parseInt(userEmailOrId).toString() === String(userEmailOrId);
    let userWhere;
    if (userIsId) {
      userWhere = {
        id: parseInt(userEmailOrId),
      };
    } else {
      userWhere = {
        email: userEmailOrId.toLowerCase(),
      };
    }
    return models.User.findOne({
      where: userWhere,
    });
  };

const getAlert =
  (forRequestUser: boolean = false) =>
  (
    alertId: string,
    unusedParam?: string,
    context?: any
  ): Promise<ModelStaticCommon<Alert> | ClientError | null> => {
    if (forRequestUser) {
      return models.Alert.findOne({
        where: { id: parseInt(alertId), UserId: context.requestUser.id },
      });
    }
    {
      return models.Alert.findOne({
        where: { id: parseInt(alertId) },
      });
    }
  };

const getUnauthorizedGenericModelById =
  <T>(modelType: ModelStaticCommon<T>) =>
  <T>(id: string): Promise<T | ClientError | null> => {
    return modelType.findByPk(id) as unknown as Promise<T | null>;
  };

const getDeviceUnauthenticated = getDevice();
const getDeviceForRequestUser = getDevice(true);
const getDeviceForUserOrDevice = getDevice(true, false, true);

const getDeviceForRequestUserAsAdmin = getDevice(true, true);
const getDevicesForRequestUser = getDevices(true, false);

// NOTE: Some applications don't even care about tracks
//  or track positions, we just want to see if a user has access to a recording.
const getLimitedRecordingForRequestUserAsAdmin = getRecording(
  true,
  true,
  false,
  true
);
const getLimitedRecordingForRequestUser = getRecording(
  true,
  false,
  false,
  true
);
const getLimitedRecordingsForRequestUserAsAdmin = getRecordings(
  true,
  true,
  true
);
const getLimitedRecordingsForRequestUser = getRecordings(true, false, true);

const getFlatRecordingsForRequestUser = getRecordings(true, false, false);

const getFlatRecordingForRequestUser = getRecording(true, false, false, false);

const getFullRecordingForRequestUser = async (a, b, c) => {
  const result = await getRecording(true, false, true, true)(a, b, c);
  if (result === null || result instanceof ClientError) {
    return result;
  }
  // Get all track data for recording
  for (const track of (result as any).Tracks) {
    track.data = await getTrackData(track.id);
  }
  return result;
};

const getGroupUnauthenticated = getGroup();
const getGroupForRequestUser = getGroup(true);
const getGroupForRequestUserAsAdmin = getGroup(true, true);

export const fetchAuthorizedRequiredDeviceInGroup = (
  deviceNameOrId: ValidationChain,
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Device,
    true,
    true,
    getDeviceForRequestUser,
    deviceNameOrId,
    groupNameOrId
  );

export const fetchAuthorizedRequiredDevicesInGroup = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModels(
    models.Device,
    true,
    true,
    getDevicesForRequestUser,
    groupNameOrId
  );

export const extractUnauthenticatedRequiredDeviceById = (
  deviceId: ValidationChain
) =>
  fetchRequiredModel(
    models.Device,
    false,
    true,
    getDeviceUnauthenticated,
    deviceId
  );
export const extractUnauthenticatedRequiredDeviceInGroup = (
  deviceNameOrId: ValidationChain,
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Device,
    true,
    true,
    getDeviceUnauthenticated,
    deviceNameOrId,
    groupNameOrId
  );
export const extractUnauthenticatedOptionalDeviceInGroup = (
  deviceNameOrId: ValidationChain,
  groupNameOrId: ValidationChain
) =>
  fetchOptionalModel(
    models.Device,
    true,
    true,
    getDeviceUnauthenticated,
    deviceNameOrId,
    groupNameOrId
  );
export const extractUnauthenticatedOptionalDeviceById = (
  deviceId: ValidationChain
) =>
  fetchOptionalModel(
    models.Device,
    false,
    true,
    getDeviceUnauthenticated,
    deviceId
  );
export const fetchAuthorizedRequiredDeviceById = (deviceId: ValidationChain) =>
  fetchRequiredModel(
    models.Device,
    false,
    true,
    getDeviceForUserOrDevice,
    deviceId
  );

export const fetchAdminAuthorizedRequiredDeviceById = (
  deviceId: ValidationChain
) =>
  fetchRequiredModel(
    models.Device,
    false,
    true,
    getDeviceForRequestUserAsAdmin,
    deviceId
  );

export const fetchAuthorizedOptionalDeviceById = (deviceId: ValidationChain) =>
  fetchOptionalModel(
    models.Device,
    false,
    true,
    getDeviceForRequestUser,
    deviceId
  );

export const fetchAuthorizedOptionalDeviceByNameOrId = (
  deviceNameOrId: ValidationChain
) =>
  fetchOptionalModel(
    models.Device,
    true,
    true,
    getDeviceForRequestUser,
    deviceNameOrId
  );

export const fetchUnauthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Group,
    true,
    true,
    getGroupUnauthenticated,
    groupNameOrId
  );

export const fetchUnauthorizedOptionalGroupByNameOrId = (
  groupNameOrId: ValidationChain | string | number
) =>
  fetchOptionalModel(
    models.Group,
    true,
    true,
    getGroupUnauthenticated,
    groupNameOrId
  );

export const fetchAuthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Group,
    true,
    true,
    getGroupForRequestUser,
    groupNameOrId
  );

export const fetchAdminAuthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain | number
) =>
  fetchRequiredModel(
    models.Group,
    true,
    true,
    getGroupForRequestUserAsAdmin,
    groupNameOrId
  );

export const fetchUnauthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Group,
    false,
    true,
    getGroupUnauthenticated,
    groupNameOrId
  );

export const fetchUnauthorizedRequiredInvitationById = (
  invitationId: ValidationChain
) =>
  fetchRequiredModel(
    models.GroupInvites,
    false,
    true,
    getUnauthorizedGenericModelById(models.GroupInvites),
    invitationId
  );

export const fetchAuthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Group,
    false,
    true,
    getGroupForRequestUser,
    groupNameOrId
  );

export const fetchAdminAuthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Group,
    false,
    true,
    getGroupForRequestUserAsAdmin,
    groupNameOrId
  );

export const extractJWTInfo =
  (field: ValidationChain) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const token = extractValFromRequest(request, field) as string;
    let tokenInfo;
    try {
      tokenInfo = getDecodedToken(token);
    } catch (e) {
      return next(e);
    }
    response.locals.tokenInfo = tokenInfo;
    next();
  };

export const extractOptionalJWTInfo =
  (field: ValidationChain) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const token = extractValFromRequest(request, field) as string;
    if (!token) {
      return next();
    }
    let tokenInfo;
    try {
      tokenInfo = getDecodedToken(token, false);
    } catch (e) {
      return next(e);
    }
    response.locals.tokenInfo = tokenInfo;
    next();
  };

export const fetchUnauthorizedRequiredUserByResetToken =
  (field: ValidationChain) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const token = extractValFromRequest(request, field) as string;
    let resetInfo;
    try {
      resetInfo = getDecodedToken(token);
    } catch (e) {
      return next(e);
    }
    response.locals.resetInfo = resetInfo;
    const user = await models.User.findByPk(response.locals.resetInfo.id);
    if (!user) {
      return next(
        new AuthorizationError(
          `Could not find a user with id '${response.locals.resetInfo.id}'`
        )
      );
    }
    response.locals.user = user;
    next();
  };

export const fetchUnauthorizedRequiredUserByEmailOrId = (
  userEmailOrId: ValidationChain
) => fetchRequiredModel(models.User, true, true, getUser(), userEmailOrId);

export const fetchUnauthorizedOptionalUserByEmailOrId = (
  userEmailOrId: ValidationChain
) => fetchOptionalModel(models.User, true, true, getUser(), userEmailOrId);

// export const fetchUnauthorizedRequiredUserByEmailOrId = (
//   userEmailOrId: ValidationChain
// ) => fetchRequiredModel(models.User, true, true, getUser(), userEmailOrId);

export const fetchUnauthorizedRequiredUserById = (userId: ValidationChain) =>
  fetchRequiredModel(models.User, false, true, getUser(), userId);

export const fetchUnauthorizedOptionalUserById = (userId: ValidationChain) =>
  fetchOptionalModel(models.User, false, true, getUser(), userId);

export const fetchAdminAuthorizedRequiredLimitedRecordingById = (
  recordingId: ValidationChain
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getLimitedRecordingForRequestUserAsAdmin,
    recordingId
  );

// export const fetchAdminAuthorizedRequiredFullRecordingById = (
//   recordingId: ValidationChain
// ) =>
//   fetchRequiredModel(
//     models.Recording,
//     false,
//     true,
//     getFullRecordingForRequestUserAsAdmin,
//     recordingId
//   );

export const fetchAuthorizedRequiredLimitedRecordingById = (
  recordingId: ValidationChain | RecordingId
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getLimitedRecordingForRequestUser,
    recordingId
  );

export const fetchAuthorizedRequiredFlatRecordingById = (
  recordingId: ValidationChain | RecordingId
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getFlatRecordingForRequestUser,
    recordingId
  );

export const fetchUnauthorizedRequiredFlatRecordingById = (
  recordingId: ValidationChain | RecordingId
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getRecording(false, false, false, false),
    recordingId
  );

export const fetchAuthorizedRequiredFullRecordingById = (
  recordingId: ValidationChain | RecordingId
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getFullRecordingForRequestUser,
    recordingId
  );

export const fetchUnauthorizedRequiredLimitedRecordingById = (
  recordingId: ValidationChain
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getRecording(false, false, false, true),
    recordingId
  );

export const fetchUnauthorizedRequiredFullRecordingById = (
  recordingId: ValidationChain
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getRecording(false, false, true, true),
    recordingId
  );

export const fetchAdminAuthorizedRequiredLimitedRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  fetchRequiredModels(
    models.Recording,
    false,
    true,
    getLimitedRecordingsForRequestUserAsAdmin,
    recordingIds
  );

export const fetchAuthorizedRequiredLimitedRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  fetchRequiredModels(
    models.Recording,
    false,
    true,
    getLimitedRecordingsForRequestUser,
    recordingIds
  );

export const fetchAuthorizedRequiredFlatRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  fetchRequiredModels(
    models.Recording,
    false,
    true,
    getFlatRecordingsForRequestUser,
    recordingIds
  );

export const fetchAuthorizedRequiredDevices = fetchRequiredModels(
  models.Device,
  false,
  false,
  getDevices(true, false)
);

export const fetchAuthorizedRequiredStations = fetchRequiredModels(
  models.Station,
  false,
  false,
  getStations(true, false)
);

export const fetchAuthorizedRequiredStationsForGroup = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModels(
    models.Station,
    true,
    true,
    getStations(true, false),
    groupNameOrId
  );

export const fetchAuthorizedRequiredStationById = (
  stationId: ValidationChain
) =>
  fetchRequiredModel(
    models.Station,
    false,
    true,
    getStation(true, false),
    stationId
  );

export const fetchAuthorizedRequiredAlertById = (alertId: ValidationChain) =>
  fetchRequiredModel(models.Alert, false, true, getAlert(true), alertId);

export const fetchAdminAuthorizedRequiredStationById = (
  stationId: ValidationChain
) =>
  fetchRequiredModel(
    models.Station,
    false,
    true,
    getStation(true, true),
    stationId
  );

export const fetchAdminAuthorizedRequiredStationByNameInGroup = (
  groupNameOrId: ValidationChain,
  stationNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Station,
    true,
    true,
    getStation(true, true),
    stationNameOrId,
    groupNameOrId
  );

export const fetchAuthorizedRequiredStationByNameInGroup = (
  groupNameOrId: ValidationChain,
  stationNameOrId: ValidationChain
) =>
  fetchRequiredModel(
    models.Station,
    true,
    true,
    getStation(true, false),
    stationNameOrId,
    groupNameOrId
  );

export const fetchAuthorizedRequiredEventById = (eventId: ValidationChain) =>
  fetchRequiredModel(models.Event, false, true, getEvent(true, false), eventId);

export const fetchAuthorizedRequiredSchedulesForGroup = (
  groupNameOrId: ValidationChain
) =>
  fetchRequiredModels(
    models.Schedule,
    false,
    false,
    getSchedules(true, false),
    groupNameOrId
  );

export const fetchAuthorizedRequiredGroups = fetchRequiredModels(
  models.Group,
  false,
  false,
  getGroups(true, false)
);

export const fetchAdminAuthorizedRequiredGroups = fetchRequiredModels(
  models.Group,
  false,
  false,
  getGroups(true, true)
);

export const fetchUnAuthorizedOptionalEventDetailSnapshotById = (
  detailId: ValidationChain
) =>
  fetchOptionalModel(
    models.DetailSnapshot,
    false,
    true,
    getUnauthorizedGenericModelById(models.DetailSnapshot),
    detailId
  );

export const fetchUnauthorizedRequiredEventDetailSnapshotById = (
  detailId: ValidationChain
) =>
  fetchRequiredModel(
    models.DetailSnapshot,
    false,
    true,
    getUnauthorizedGenericModelById(models.DetailSnapshot),
    detailId
  );

export const fetchUnauthorizedRequiredEventById = (eventId: ValidationChain) =>
  fetchRequiredModel(
    models.Event,
    false,
    true,
    getUnauthorizedGenericModelById(models.Event),
    eventId
  );

export const fetchUnauthorizedRequiredTrackById = (trackId: ValidationChain) =>
  fetchRequiredModel(
    models.Track,
    false,
    true,
    getUnauthorizedGenericModelById(models.Track),
    trackId
  );

export const fetchUnauthorizedRequiredTrackTagById = (tagId: ValidationChain) =>
  fetchRequiredModel(
    models.TrackTag,
    false,
    true,
    getUnauthorizedGenericModelById(models.TrackTag),
    tagId
  );

export const fetchUnauthorizedRequiredFileById = (fileId: ValidationChain) =>
  fetchRequiredModel(
    models.File,
    false,
    true,
    getUnauthorizedGenericModelById(models.File),
    fileId
  );

export const fetchUnauthorizedRequiredRecordingTagById = (
  tagId: ValidationChain
) =>
  fetchRequiredModel(
    models.Tag,
    false,
    true,
    getUnauthorizedGenericModelById(models.Tag),
    tagId
  );

export const fetchUnauthorizedRequiredScheduleById = (
  scheduleId: ValidationChain | ScheduleId
) =>
  fetchRequiredModel(
    models.Schedule,
    false,
    true,
    getUnauthorizedGenericModelById(models.Schedule),
    scheduleId
  );
