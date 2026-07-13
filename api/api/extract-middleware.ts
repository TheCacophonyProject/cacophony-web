import type { NextFunction, Request, Response } from "express";
import { ExtractJwt } from "passport-jwt";
import type { DecodedJWTToken } from "./auth.js";
import { getVerifiedJWTFromBody } from "./auth.js";
import { getDecodedToken, getVerifiedJWT, lookupEntity } from "./auth.js";
import type { ModelStaticCommon } from "@models";
import log from "../logging.js";
import { createHash } from "crypto";
import { modelTypeName, modelTypeNamePlural } from "./middleware.js";
import type { ValidationChain } from "express-validator";
import {
  AuthenticationError,
  AuthorizationError,
  ClientError,
} from "./customErrors.js";
import { User } from "@models/User.js";
import Sequelize, {
  FindOptions,
  Includeable,
  Model,
  Op,
  WhereOptions,
} from "sequelize";
import { Device } from "@models/Device.js";
import type { RecordingId, ScheduleId, UserId } from "@typedefs/api/common.js";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";
import { Station } from "@models/Station.js";
import { Schedule } from "@models/Schedule.js";
import { UserGlobalPermission } from "@typedefs/api/consts.js";
import { urlNormaliseName } from "@/emails/htmlEmailUtils.js";
import { SuperUsers } from "@/Globals.js";
import { Alert } from "@models/Alert.js";
import { Event } from "@models/Event.js";
import { delayMs, userShouldBeRateLimited } from "@/Server.js";
import { Track } from "@models/Track.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import { TrackTag } from "@models/TrackTag.js";
import { Tag } from "@models/Tag.js";
import { File } from "@models/File.js";
import { GroupInvites } from "@models/GroupInvites.js";
import { TrackTagUserData } from "@models/TrackTagUserData.js";
import { GroupUsers } from "@models/GroupUsers.js";
import jwt from "jsonwebtoken";
import config from "@config";
import { MinimalTrackRequestData } from "@typedefs/api/fileProcessing.js";

export interface RequestContext {
  requestUser?:
    | User
    | {
        id: number;
        userName: string;
        hasGlobalRead: () => boolean;
        hasGlobalWrite: () => boolean;
      };
  onlyActive?: boolean;
  withRecordings?: boolean;
  viewAsSuperUser?: boolean;
  group?: Group;
  station?: Station;
}

const upperFirst = (str: string): string =>
  str.slice(0, 1).toUpperCase() + str.slice(1);

const extractJwtAuthenticatedEntityCommon = async (
  jwtDecoded: DecodedJWTToken,
  types: string[],
  request: Request,
  response: Response,
  next: NextFunction,
  requireSuperAdmin = false,
  requireActivatedUser = false,
): Promise<void> => {
  const type = jwtDecoded._type;

  if (types && !types.includes(jwtDecoded._type)) {
    return next(
      new AuthenticationError(
        `Invalid JWT access type '${type}', must be ${
          types.length > 1 ? "one of " : ""
        }${types.map((t) => `'${t}'`).join(", ")}`,
      ),
    );
  }

  if (
    jwtDecoded._type === "user" &&
    requireActivatedUser &&
    jwtDecoded.activated === false
  ) {
    return next(
      new AuthorizationError(
        "You must have confirmed your email address to activate your account in order to access this API.",
      ),
    );
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
      const isCiRequest =
        "user-agent" in request.headers &&
        request.headers["user-agent"].includes("Cypress");
      if (
        !isCiRequest &&
        userShouldBeRateLimited(response.locals.requestUser.id)
      ) {
        response.locals.requestUser.wasRateLimited = true;
        // Stagger the amount of rate-limiting to try and spread out repeat requests
        await delayMs(3000 + Math.floor(Math.random() * 4000));
      }
    } else if (type === "device") {
      response.locals.requestDevice = { id: jwtDecoded.id };
    }
  } else {
    let result: DecodedJWTToken | User | Device | null;
    try {
      result = await lookupEntity(jwtDecoded);
    } catch (e) {
      return next(e);
    }
    if (result === null) {
      return next(
        new AuthorizationError(
          `Could not find entity '${jwtDecoded.id}' of type '${type}' referenced by JWT.`,
        ),
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
    return next(new AuthorizationError("User is not a super admin."));
  }
};

const extractJwtAuthenticatedEntity =
  (types: string[], requireSuperAdmin = false, requireActivatedUser = false) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction,
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
        requireSuperAdmin,
        requireActivatedUser,
      );
      return next();
    } catch (e) {
      // We might need to rate limit this.
      const token = ExtractJwt.fromAuthHeaderWithScheme("jwt")(request);
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
      } else {
        const decodedToken = jwt.verify(token, config.server.passportSecret);
        if (
          typeof decodedToken !== "string" &&
          decodedToken._type &&
          decodedToken._type === "user"
        ) {
          response.locals.requestUser = {
            id: decodedToken.id || -1,
            hasGlobalRead: () => false,
            hasGlobalWrite: () => false,
            globalPermission: UserGlobalPermission.Off,
          };
          const isCiRequest =
            "user-agent" in request.headers &&
            request.headers["user-agent"].includes("Cypress");
          if (
            !isCiRequest &&
            userShouldBeRateLimited(response.locals.requestUser.id)
          ) {
            response.locals.requestUser.wasRateLimited = true;
            // Stagger the amount of rate-limiting to try and spread out repeat requests
            await delayMs(3000 + Math.floor(Math.random() * 4000));
          }
        }
      }
      return next(e);
    }
  };

const extractJwtAuthenticatedEntityFromBody =
  (
    tokenField: string,
    types: string[],
    requireSuperAdmin = false,
    requireActivatedUser = false,
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const jwtDecoded = getVerifiedJWTFromBody(
        tokenField,
        request,
      ) as DecodedJWTToken;
      response.locals.tokenInfo = jwtDecoded;
      await extractJwtAuthenticatedEntityCommon(
        jwtDecoded,
        types,
        request,
        response,
        next,
        requireSuperAdmin,
        requireActivatedUser,
      );
      return next();
    } catch (e) {
      return next(e);
    }
  };
export const extractJwtAuthorizedUser = extractJwtAuthenticatedEntity(["user"]);
export const extractJwtAuthorizedActivatedUser = extractJwtAuthenticatedEntity(
  ["user"],
  false,
  true,
);
export const extractJwtAuthorizedUserOrDevice = extractJwtAuthenticatedEntity([
  "user",
  "device",
]);
export const extractJwtAuthorisedSuperAdminUser = extractJwtAuthenticatedEntity(
  ["user"],
  true,
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
  "lastThermalRecordingTime",
  "lastAudioRecordingTime",
  "earliestThermalRecordingTime",
  "earliestAudioRecordingTime",
  "public",
  "active",
  "ScheduleId",
  "password", // Needed for auth, but not passed through when mapping to response.
];

const getGroupInclude = (
  useAdminAccess: { admin?: true },
  requestUserId: UserId,
) => ({
  include: [
    {
      model: User,
      attributes: ["id"],
      through: {
        where: {
          ...useAdminAccess,
          removedAt: null,
        } as WhereOptions<GroupUsers>,
        attributes: ["admin", "settings", "owner", "pending"],
      },
      where: { id: requestUserId },
    },
  ],
});

const getDeviceInclude =
  (deviceWhere: Sequelize.WhereOptions, groupWhere: Sequelize.WhereOptions) =>
  (useAdminAccess: { admin?: true }, requestUserId: UserId) => ({
    where: {
      ...deviceWhere,
      [Op.or]: [
        Sequelize.where(
          Sequelize.col("Group.Users.GroupUsers.UserId"),
          Op.ne,
          null,
        ),
      ],
    },
    attributes: deviceAttributes,
    include: [
      {
        model: Group,
        attributes: ["id", "groupName"],
        required:
          Object.keys(groupWhere).length !== 0 &&
          Object.keys(deviceWhere).length === 0,
        where: groupWhere,
        include: [
          {
            model: User,
            attributes: ["id"],
            required: false,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: null,
                pending: null,
              } as WhereOptions<GroupUsers>,
              attributes: ["admin", "UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
    ],
  });

const getStationInclude =
  (stationWhere: Sequelize.WhereOptions, groupWhere: Sequelize.WhereOptions) =>
  (useAdminAccess: { admin?: true }, requestUserId: UserId) => ({
    where: {
      ...stationWhere,
    },
    include: [
      {
        model: Group,
        attributes: ["id", "groupName"],
        required: true,
        where: groupWhere,
        include: [
          {
            model: User,
            attributes: ["id"],
            required: true,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: null,
                pending: null,
              } as WhereOptions<GroupUsers>,
              attributes: ["UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
    ],
  });

const getScheduleInclude =
  (groupWhere: Sequelize.WhereOptions) =>
  (useAdminAccess: { admin?: true }, requestUserId: UserId) => ({
    where: {
      [Op.and]: [
        Sequelize.where(
          Sequelize.col("Group.Users.GroupUsers.UserId"),
          Op.ne,
          null,
        ),
      ],
    },
    include: [
      {
        model: Group,
        attributes: ["id", "groupName"],
        required: Object.keys(groupWhere).length !== 0,
        where: groupWhere,
        include: [
          {
            model: User,
            attributes: ["id"],
            required: false,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: null,
                pending: null,
              } as WhereOptions<GroupUsers>,
              attributes: ["admin", "UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
    ],
  });

const getRecordingInclude =
  (
    recordingsWhere: Sequelize.WhereOptions,
    groupWhere: Sequelize.WhereOptions,
    deviceWhere: Sequelize.WhereOptions,
  ) =>
  (useAdminAccess: { admin?: true }, requestUserId: UserId) => ({
    where: {
      ...recordingsWhere,
      [Op.or]: [
        Sequelize.where(
          Sequelize.col("Group.Users.GroupUsers.UserId"),
          Op.ne,
          null,
        ),
      ],
    },
    // TODO - RecordingAttributes
    //attributes: deviceAttributes,
    include: [
      {
        model: Group,
        attributes: ["id", "groupName"],
        required: false,
        where: groupWhere,
        include: [
          {
            model: User,
            attributes: ["id"],
            required: false,
            through: {
              where: {
                ...useAdminAccess,
                removedAt: null,
                pending: null,
              } as WhereOptions<GroupUsers>,
              attributes: ["admin", "UserId"],
            },
            where: { id: requestUserId },
          },
        ],
      },
      {
        model: Device,
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
        } catch (_e) {
          return next(
            new ClientError(`Malformed JSON for '${location}.${key}'`),
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
  valGetter?: ValidationChain,
): string | undefined => {
  if (valGetter) {
    // NOTE: Accessing private field 'locations'
    const location = valGetter.builder["locations"][0] as
      | "query"
      | "body"
      | "params";
    // If fields is an array, take the first one that exists.
    // NOTE: Accessing private field 'fields'
    for (const field of valGetter.builder["fields"] as string[]) {
      if (request[location][field]) {
        return request[location][field];
      }
    }
  }
};

const extractFieldNameFromRequest = (
  request: Request,
  valGetter?: ValidationChain,
): string | undefined => {
  if (valGetter) {
    // NOTE: Accessing private field 'locations'
    const location = valGetter.builder["locations"][0] as
      | "body"
      | "query"
      | "params"
      | undefined;
    // If fields is an array, take the first one that exists.
    // NOTE: Accessing private field 'fields'
    for (const field of valGetter.builder["fields"]) {
      if (location in request && request[location][field]) {
        return field;
      }
    }
  }
};

const extractFieldLocationFromRequest = (
  _request: Request,
  valGetter?: ValidationChain,
): "body" | "query" | "params" | undefined => {
  if (valGetter) {
    // NOTE: Accessing private field 'locations'
    return valGetter.builder["locations"][0];
  }
};

type ModelGetter<T extends ModelStaticCommon<Model>> = (
  id: string,
  id2: string,
  context?: object,
) => Promise<ModelStaticCommon<T> | ClientError | null>;

type ModelsGetter<T extends ModelStaticCommon<Model>> = (
  id: string,
  id2: string,
  context?: object,
) => Promise<ModelStaticCommon<T>[] | ClientError | null>;

export const fetchModel =
  <T extends ModelStaticCommon<Model>>(
    modelType: typeof ModelStaticCommon<T>,
    required: boolean,
    byName: boolean,
    byId: boolean,
    modelGetter: ModelGetter<T> | ModelsGetter<T>,
    primary: ValidationChain | number | string,
    secondary?: ValidationChain | number | string,
  ) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const modelName = modelTypeName(modelType);

    let id: string;
    if (typeof primary === "number" || typeof primary === "string") {
      id = primary.toString();
    } else {
      id = extractValFromRequest(request, primary) as string;
    }
    if (!id && !required) {
      return next();
    }
    let id2: string;
    if (typeof secondary === "number" || typeof secondary === "string") {
      id2 = secondary.toString();
    } else if (secondary) {
      id2 = extractValFromRequest(request, secondary) as string;
    }
    response.locals.onlyActive = true; // Default to only showing active devices.
    response.locals.withRecordings = false; // Default to showing stations without any recordings.
    if (
      ("onlyActive" in request.query &&
        (request.query.onlyActive as unknown as boolean) === false) ||
      ("only-active" in request.query &&
        (request.query["only-active"] as unknown as boolean) === false)
    ) {
      response.locals.onlyActive = false;
    }
    if (
      "with-recordings" in request.query &&
      (request.query["with-recordings"] as unknown as boolean) === true
    ) {
      response.locals.withRecordings = true;
    }
    if ("deleted" in request.query) {
      response.locals.deleted =
        (request.query.deleted as unknown as boolean) === true;
    }

    let model;
    try {
      model = await modelGetter(id, id2, response.locals);
    } catch (e: unknown) {
      if ("sql" in (e as object)) {
        log.error("%s", (e as { sql: string }).sql);
      }
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
              }${forUser ? " for user" : ""}`,
            ),
          );
        } else if (byId) {
          return next(
            new AuthorizationError(
              `Could not find a ${modelName} with an id of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`,
            ),
          );
        } else if (byName) {
          return next(
            new AuthorizationError(
              `Could not find a ${modelName} with a name of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`,
            ),
          );
        } else {
          return next(
            new AuthorizationError(
              `Could not find any ${modelTypeNamePlural(modelType)}${
                forUser ? " for user" : ""
              }`,
            ),
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

export const fetchRequiredModel = <T extends ModelStaticCommon<Model>>(
  modelType: typeof ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelGetter: ModelGetter<T>,
  primary: ValidationChain | number,
  secondary?: ValidationChain,
) => fetchModel(modelType, true, byName, byId, modelGetter, primary, secondary);

export const fetchRequiredModels = <T extends ModelStaticCommon<Model>>(
  modelType: typeof ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelsGetter: ModelsGetter<T>,
  primary?: ValidationChain,
  secondary?: ValidationChain,
) =>
  fetchModel(modelType, true, byName, byId, modelsGetter, primary, secondary);

export const fetchOptionalModel = <T extends ModelStaticCommon<Model>>(
  modelType: typeof ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelGetter: ModelGetter<T>,
  primary: ValidationChain | string | number,
  secondary?: ValidationChain | string | number,
) =>
  fetchModel(modelType, false, byName, byId, modelGetter, primary, secondary);

const getDevices =
  (forRequestUser = false, asAdmin: boolean) =>
  (
    groupNameOrId?: string,
    unused2?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Device>[] | ClientError | null> => {
    let getDeviceOptions: Sequelize.FindOptions;
    let groupWhere: Sequelize.WhereOptions = {};

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
          model: Group,
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
          asAdmin,
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getDeviceOptions = allDevicesOptions;
    }

    if (!getDeviceOptions.where) {
      getDeviceOptions = allDevicesOptions;
    }
    if (context.onlyActive) {
      getDeviceOptions.where = {
        ...(getDeviceOptions.where || {}),
        active: true,
      };
    }
    getDeviceOptions.subQuery = false;
    return Device.findAll({
      ...getDeviceOptions,
      order: ["deviceName"],
    });
  };

const getStations =
  (forRequestUser = false, asAdmin: boolean) =>
  (
    groupNameOrId?: string,
    unused2?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Station>[] | ClientError | null> => {
    let getStationsOptions: Sequelize.FindOptions;
    let groupWhere: Sequelize.WhereOptions = {};

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
          model: Group,
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
          asAdmin,
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getStationsOptions = allStationsOptions;
    }

    if (!getStationsOptions.where) {
      getStationsOptions = allStationsOptions;
    }

    if (context.onlyActive) {
      getStationsOptions.where = {
        ...(getStationsOptions.where || {}),
        retiredAt: null,
      };
    }
    if (context.withRecordings) {
      getStationsOptions.where = {
        ...(getStationsOptions.where || {}),
        [Op.and]: [
          {
            [Op.or]: [
              {
                earliestThermalRecordingTime: { [Op.ne]: null },
              },
              {
                earliestAudioRecordingTime: { [Op.ne]: null },
              },
            ],
          },
        ],
      };
    }

    return Station.findAll({
      ...getStationsOptions,
      order: ["name"],
      subQuery: false,
    });
  };

const getStation =
  (forRequestUser = false, asAdmin = false) =>
  (
    stationNameOrId: string,
    groupNameOrId?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Station> | ClientError | null> => {
    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);

    const stationIsId =
      !isNaN(parseInt(stationNameOrId)) &&
      parseInt(stationNameOrId).toString() === String(stationNameOrId);

    let stationWhere: WhereOptions<Station>;
    let groupWhere = {};

    let groupNameMatch: Sequelize.WhereOptions | string = groupNameOrId;
    if (!groupIsId && groupNameOrId !== urlNormaliseName(groupNameOrId)) {
      groupNameMatch = {
        [Op.in]: [groupNameOrId, urlNormaliseName(groupNameOrId)],
      } as Sequelize.WhereOptions;
    }
    let stationNameMatch: Sequelize.WhereOptions | string = stationNameOrId;
    if (!stationIsId && stationNameOrId !== urlNormaliseName(stationNameOrId)) {
      stationNameMatch = {
        [Op.in]: [stationNameOrId, urlNormaliseName(stationNameOrId)],
      } as Sequelize.WhereOptions;
    }

    if (groupIsId && stationIsId) {
      stationWhere = {
        id: parseInt(stationNameOrId),
        GroupId: parseInt(groupNameOrId),
      };
    } else if (stationIsId && groupNameOrId) {
      stationWhere = {
        id: parseInt(stationNameOrId),
        [Op.and]: Sequelize.where(
          Sequelize.col("Group.groupName"),
          Op.eq,
          groupNameMatch,
        ),
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
        [Op.and]: Sequelize.where(
          Sequelize.col("Group.groupName"),
          Op.eq,
          groupNameMatch,
        ),
      } as WhereOptions<Station>;
    }
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else if (groupNameOrId) {
      groupWhere = { groupName: groupNameMatch };
    }

    let getStationOptions: Sequelize.FindOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints

        getStationOptions = getIncludeForUser(
          context,
          getStationInclude(stationWhere, groupWhere),
          asAdmin,
        );
        if (!getStationOptions.where && stationWhere) {
          getStationOptions = {
            where: stationWhere,
            include: [
              {
                model: Group,
                required: true,
                attributes: ["groupName"],
                where: groupWhere,
              },
            ],
          };
        }
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getStationOptions = {
        where: stationWhere,
        include: [
          {
            model: Group,
            required: true,
            attributes: ["groupName"],
            where: groupWhere,
          },
        ],
      };
    }

    if (context.onlyActive || !stationIsId) {
      getStationOptions.where = {
        ...(getStationOptions.where || {}),
        retiredAt: null,
      };
    }
    getStationOptions.subQuery = false;
    return Station.findOne(getStationOptions);
  };

const getSchedules =
  (forRequestUser = false, asAdmin: boolean) =>
  (
    groupNameOrId?: string,
    unused2?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Schedule>[] | ClientError | null> => {
    let getScheduleOptions: Sequelize.FindOptions;
    let groupWhere: Sequelize.WhereOptions = {};

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
          model: Group,
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
          asAdmin,
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getScheduleOptions = allSchedulesOptions;
    }

    if (!getScheduleOptions.where) {
      getScheduleOptions = allSchedulesOptions;
    }
    return Schedule.findAll(getScheduleOptions);
  };

const getGroups =
  (forRequestUser = false, asAdmin: boolean) =>
  (
    unused1?: string,
    unused2?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Group>[] | ClientError | null> => {
    let getGroupOptions: Sequelize.FindOptions;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getGroupOptions = getIncludeForUser(context, getGroupInclude, asAdmin);
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getGroupOptions = {
        where: {},
      };
    }
    return Group.findAll({
      ...getGroupOptions,
      order: ["groupName"],
      subQuery: false,
    });
  };

const getRecordingRelationships = (
  recordingQuery: Sequelize.FindOptions,
  includeRelationships: boolean,
): Sequelize.FindOptions => {
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
    "rawFileSize",
    "fileSize",
    "fileKey",
    "additionalMetadata",
    "batteryLevel",
    "batteryCharging",
    "version",
    "processingStartTime",
    "processingEndTime",
    "redacted",
  ];
  recordingQuery.include = (recordingQuery.include as Includeable[]) || [];
  if (includeRelationships) {
    recordingQuery.include.push({
      model: Tag,
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
          model: User,
          as: "tagger",
          required: false,
          attributes: ["userName"],
        },
      ],
      required: false,
    });
    recordingQuery.include.push({
      model: Track,
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
          model: TrackTag,
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
              model: User,
              required: false,
              attributes: ["userName"],
            },
            {
              model: TrackTagUserData,
              required: false,
              attributes: ["gender", "maturity"],
            },
          ],
        },
      ],
    });
    recordingQuery.include.push({
      model: Station,
      attributes: ["name"],
      required: false,
    });
  }
  return recordingQuery;
};

const getRecording =
  (
    forRequestUser = false,
    asAdmin = false,
    includeTrackMetadata = false,
    includeRelationships = false,
  ) =>
  (
    recordingId: string,
    unused: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Recording> | ClientError | null> => {
    const recordingWhere: Sequelize.WhereOptions = {
      id: parseInt(recordingId),
    };
    if ("deleted" in context) {
      if (context.deleted === true) {
        recordingWhere.deletedAt = { [Op.ne]: null };
      } else if (context.deleted === false) {
        recordingWhere.deletedAt = { [Op.eq]: null };
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
          asAdmin,
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
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
            model: Group,
            required: true,
            where: groupWhere,
          },
          {
            model: Device,
            required: true,
            where: deviceWhere,
          },
        ];
      }
    }
    getRecordingOptions.where = getRecordingOptions.where || recordingWhere;
    getRecordingOptions = getRecordingRelationships(
      getRecordingOptions,
      includeRelationships,
    );
    return Recording.findOne(getRecordingOptions).then((rec) => {
      if (includeTrackMetadata) {
        if (rec) {
          const trackMetas: Promise<MinimalTrackRequestData>[] = [];
          for (const track of rec.Tracks) {
            trackMetas.push(
              Track.getTrackData(track.id) as Promise<MinimalTrackRequestData>,
            );
          }
          return Promise.all(trackMetas).then((trackMetadatas) => {
            for (let i = 0; i < trackMetadatas.length; i++) {
              if (Object.keys(trackMetadatas[i]).length > 0) {
                rec.Tracks[i].data = trackMetadatas[
                  i
                ] as MinimalTrackRequestData;
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
  (forRequestUser = false, asAdmin = false, includeRelationships = false) =>
  (
    recordingIds: string,
    unused: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Recording>[] | ClientError> => {
    const recordingWhere: Sequelize.WhereOptions = {
      id: { [Op.in]: recordingIds },
    };
    if ("deleted" in context) {
      if (context.deleted === true) {
        recordingWhere.deletedAt = { [Op.ne]: null };
      } else if (context.deleted === false) {
        recordingWhere.deletedAt = { [Op.eq]: null };
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
          asAdmin,
        );
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getRecordingOptions = {
        where: recordingWhere,
        include: [
          {
            model: Group,
            required: true,
            where: groupWhere,
          },
          {
            model: Device,
            required: true,
            where: deviceWhere,
          },
        ],
      };
    }
    getRecordingOptions.where = getRecordingOptions.where || recordingWhere;
    getRecordingOptions = getRecordingRelationships(
      getRecordingOptions,
      includeRelationships,
    );
    return Recording.findAll({
      ...getRecordingOptions,
      order: ["recordingDateTime"],
    });
  };

const getDevice =
  (forRequestUser = false, asAdmin = false, forDevice = false) =>
  (
    deviceNameOrId: string,
    groupNameOrId?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Device> | ClientError | null> => {
    const deviceIsId =
      !isNaN(parseInt(deviceNameOrId)) &&
      parseInt(deviceNameOrId).toString() === String(deviceNameOrId);
    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);

    let deviceWhere: WhereOptions<Device>;
    let groupWhere = {};

    let groupNameMatch: string | Sequelize.WhereOptions = groupNameOrId;
    if (!groupIsId && groupNameOrId !== urlNormaliseName(groupNameOrId)) {
      groupNameMatch = {
        [Op.in]: [groupNameOrId, urlNormaliseName(groupNameOrId)],
      } as Sequelize.WhereOptions;
    }
    let deviceNameMatch: string | Sequelize.WhereOptions = deviceNameOrId;
    if (!deviceIsId && deviceNameOrId !== urlNormaliseName(deviceNameOrId)) {
      deviceNameMatch = {
        [Op.in]: [deviceNameOrId, urlNormaliseName(deviceNameOrId)],
      } as Sequelize.WhereOptions;
    }

    if (deviceIsId && groupIsId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
        GroupId: parseInt(groupNameOrId),
      };
    } else if (deviceIsId && groupNameOrId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
        [Op.and]: Sequelize.where(
          Sequelize.col("Group.groupName"),
          Op.eq,
          groupNameMatch,
        ),
      };
    } else if (deviceIsId && !groupNameOrId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
      };
    } else if (groupIsId) {
      deviceWhere = {
        deviceName: deviceNameMatch,
        GroupId: parseInt(groupNameOrId),
      } as WhereOptions<Device>;
    } else {
      deviceWhere = {
        deviceName: deviceNameMatch,
        [Op.and]: Sequelize.where(
          Sequelize.col("Group.groupName"),
          Op.eq,
          groupNameMatch,
        ),
      } as WhereOptions<Device>;
    }
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else if (groupNameOrId) {
      groupWhere = { groupName: groupNameMatch };
    }

    let getDeviceOptions: Sequelize.FindOptions<Device>;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getDeviceOptions = getIncludeForUser(
          context,
          getDeviceInclude(deviceWhere, groupWhere),
          asAdmin,
        );
        if (!getDeviceOptions.where && deviceWhere) {
          getDeviceOptions = {
            where: deviceWhere,
            attributes: deviceAttributes,
            include: [
              {
                model: Group,
                required: true,
                where: groupWhere,
              },
            ],
          };
        }
      } else if (!forDevice) {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    }
    if (!getDeviceOptions) {
      getDeviceOptions = {
        where: deviceWhere,
        attributes: deviceAttributes,
        include: [
          {
            model: Group,
            required: true,
            where: groupWhere,
          },
        ],
      };
    }

    // FIXME(ManageStations) - When re-registering we can actually have two devices in the same group with the same name - but one
    //  will be inactive.  Maybe we should change the name of the inactive device to disambiguate it?
    if (context.onlyActive) {
      getDeviceOptions.where = {
        ...(getDeviceOptions.where || {}),
        active: true,
      };
    }
    getDeviceOptions.subQuery = false;
    return Device.findOne(getDeviceOptions);
  };

const getIncludeForUser = (
  context: RequestContext,
  includeFn: (
    asAdmin: { admin?: true },
    userId: UserId,
    additionalWhere?: Sequelize.WhereOptions,
  ) => Sequelize.FindOptions,
  asAdmin = false,
) => {
  const requestingWithSuperAdminPermissions =
    context.viewAsSuperUser &&
    context.requestUser[!asAdmin ? "hasGlobalRead" : "hasGlobalWrite"]();

  if (!requestingWithSuperAdminPermissions) {
    // Then check that the user can access the device.
    return includeFn(asAdmin ? { admin: true } : {}, context.requestUser.id);
  } else {
    // Don't add any permission constraints when getting the resource
    return {};
  }
};

const getGroup =
  (forRequestUser = false, asAdmin = false) =>
  (
    groupNameOrId?: string,
    unusedParam?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Group> | ClientError | null> => {
    const groupIsId =
      groupNameOrId &&
      !isNaN(parseInt(groupNameOrId)) &&
      parseInt(groupNameOrId).toString() === String(groupNameOrId);
    let groupWhere: WhereOptions<Group>;
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else {
      let groupNameMatch: string | Sequelize.WhereOptions = groupNameOrId;
      if (groupNameOrId !== urlNormaliseName(groupNameOrId)) {
        groupNameMatch = {
          [Op.in]: [groupNameOrId, urlNormaliseName(groupNameOrId)],
        } as Sequelize.WhereOptions;
      }
      groupWhere = { groupName: groupNameMatch } as WhereOptions<Group>;
    }
    let getGroupOptions: FindOptions<Group>;
    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getGroupOptions = getIncludeForUser(context, getGroupInclude, asAdmin);
        getGroupOptions.where = groupWhere;
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getGroupOptions = {
        where: groupWhere,
      };
    }
    getGroupOptions.subQuery = false;
    return Group.findOne(getGroupOptions);
  };

const getEvent =
  (forRequestUser = false, asAdmin = false) =>
  (
    eventDetailId?: string,
    unusedParam?: string,
    context?: RequestContext,
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
                  model: DetailSnapshot,
                  as: "EventDetail",
                  required: true,
                  attributes: ["type", "details"],
                },
                {
                  model: Device,
                  attributes: [],
                  required: true,
                  include: [
                    {
                      model: Group,
                      attributes: [],
                      required: true,
                      where: {},
                      include: [
                        {
                          model: User,
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
          asAdmin,
        );
        getEventOptions.where = eventWhere;
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified"),
        );
      }
    } else {
      getEventOptions = {
        where: eventWhere,
      };
    }
    return Event.findOne(getEventOptions);
  };

const getUser =
  () =>
  (
    userEmailOrId: string,
  ): Promise<ModelStaticCommon<User> | ClientError | null> => {
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
    return User.findOne({
      where: userWhere,
    });
  };

const getAlert =
  (forRequestUser = false) =>
  (
    alertId: string,
    unusedParam?: string,
    context?: RequestContext,
  ): Promise<ModelStaticCommon<Alert> | ClientError | null> => {
    if (forRequestUser) {
      return Alert.findOne({
        where: { id: parseInt(alertId), UserId: context.requestUser.id },
      });
    }
    {
      return Alert.findOne({
        where: { id: parseInt(alertId) },
      });
    }
  };

const getUnauthorizedGenericModelById =
  <T extends Model>(modelType: typeof ModelStaticCommon<T>) =>
  <T extends ModelStaticCommon<Model>>(
    id: string,
  ): Promise<T | ClientError | null> => {
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
  true,
);
const getLimitedRecordingForRequestUser = getRecording(
  true,
  false,
  false,
  true,
);
const getLimitedRecordingsForRequestUserAsAdmin = getRecordings(
  true,
  true,
  true,
);
const getLimitedRecordingsForRequestUser = getRecordings(true, false, true);

const getFlatRecordingsForRequestUser = getRecordings(true, false, false);

const getFlatRecordingForRequestUser = getRecording(true, false, false, false);

const getFullRecordingForRequestUser = async (
  a: string,
  b: string,
  c?: object,
) => {
  const result = await getRecording(true, false, true, true)(a, b, c);
  if (result === null || result instanceof ClientError) {
    return result;
  }
  // Get all track data for recording
  for (const track of (result as Recording).Tracks) {
    track.data = (await Track.getTrackData(
      track.id,
    )) as MinimalTrackRequestData;
  }
  return result;
};

const getGroupUnauthenticated = getGroup();
const getGroupForRequestUser = getGroup(true);
const getGroupForRequestUserAsAdmin = getGroup(true, true);

export const fetchAuthorizedRequiredDeviceInGroup = (
  deviceNameOrId: ValidationChain,
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(
    Device,
    true,
    true,
    getDeviceForRequestUser,
    deviceNameOrId,
    groupNameOrId,
  );

export const fetchAuthorizedRequiredDevicesInGroup = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModels(
    Device,
    true,
    true,
    getDevicesForRequestUser,
    groupNameOrId,
  );

export const extractUnauthenticatedRequiredDeviceById = (
  deviceId: ValidationChain,
) =>
  fetchRequiredModel(Device, false, true, getDeviceUnauthenticated, deviceId);
export const extractUnauthenticatedRequiredDeviceInGroup = (
  deviceNameOrId: ValidationChain,
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(
    Device,
    true,
    true,
    getDeviceUnauthenticated,
    deviceNameOrId,
    groupNameOrId,
  );
export const extractUnauthenticatedOptionalDeviceInGroup = (
  deviceNameOrId: ValidationChain,
  groupNameOrId: ValidationChain,
) =>
  fetchOptionalModel(
    Device,
    true,
    true,
    getDeviceUnauthenticated,
    deviceNameOrId,
    groupNameOrId,
  );
export const extractUnauthenticatedOptionalDeviceById = (
  deviceId: ValidationChain,
) =>
  fetchOptionalModel(Device, false, true, getDeviceUnauthenticated, deviceId);
export const fetchAuthorizedRequiredDeviceById = (deviceId: ValidationChain) =>
  fetchRequiredModel(Device, false, true, getDeviceForUserOrDevice, deviceId);

export const fetchAdminAuthorizedRequiredDeviceById = (
  deviceId: ValidationChain,
) =>
  fetchRequiredModel(
    Device,
    false,
    true,
    getDeviceForRequestUserAsAdmin,
    deviceId,
  );

export const fetchAuthorizedOptionalDeviceById = (deviceId: ValidationChain) =>
  fetchOptionalModel(Device, false, true, getDeviceForRequestUser, deviceId);

export const fetchAuthorizedOptionalDeviceByNameOrId = (
  deviceNameOrId: ValidationChain,
) =>
  fetchOptionalModel(
    Device,
    true,
    true,
    getDeviceForRequestUser,
    deviceNameOrId,
  );

export const fetchUnauthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(Group, true, true, getGroupUnauthenticated, groupNameOrId);

export const fetchUnauthorizedOptionalGroupByNameOrId = (
  groupNameOrId: ValidationChain | string | number,
) =>
  fetchOptionalModel(Group, true, true, getGroupUnauthenticated, groupNameOrId);

export const fetchAuthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(Group, true, true, getGroupForRequestUser, groupNameOrId);

export const fetchAdminAuthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain | number,
) =>
  fetchRequiredModel(
    Group,
    true,
    true,
    getGroupForRequestUserAsAdmin,
    groupNameOrId,
  );

export const fetchUnauthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(
    Group,
    false,
    true,
    getGroupUnauthenticated,
    groupNameOrId,
  );

export const fetchUnauthorizedRequiredInvitationById = (
  invitationId: ValidationChain,
) =>
  fetchRequiredModel(
    GroupInvites,
    false,
    true,
    getUnauthorizedGenericModelById(GroupInvites),
    invitationId,
  );

export const fetchAuthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(Group, false, true, getGroupForRequestUser, groupNameOrId);

export const fetchAdminAuthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModel(
    Group,
    false,
    true,
    getGroupForRequestUserAsAdmin,
    groupNameOrId,
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
    const user = await User.findByPk(response.locals.resetInfo.id);
    if (!user) {
      return next(
        new AuthorizationError(
          `Could not find a user with id '${response.locals.resetInfo.id}'`,
        ),
      );
    }
    response.locals.user = user;
    next();
  };

export const fetchUnauthorizedRequiredUserByEmailOrId = (
  userEmailOrId: ValidationChain,
) => fetchRequiredModel(User, true, true, getUser(), userEmailOrId);

export const fetchUnauthorizedOptionalUserByEmailOrId = (
  userEmailOrId: ValidationChain,
) => fetchOptionalModel(User, true, true, getUser(), userEmailOrId);

// export const fetchUnauthorizedRequiredUserByEmailOrId = (
//   userEmailOrId: ValidationChain
// ) => fetchRequiredModel(models.User, true, true, getUser(), userEmailOrId);

export const fetchUnauthorizedRequiredUserById = (userId: ValidationChain) =>
  fetchRequiredModel(User, false, true, getUser(), userId);

export const fetchUnauthorizedOptionalUserById = (userId: ValidationChain) =>
  fetchOptionalModel(User, false, true, getUser(), userId);

export const fetchAdminAuthorizedRequiredLimitedRecordingById = (
  recordingId: ValidationChain,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getLimitedRecordingForRequestUserAsAdmin,
    recordingId,
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
  recordingId: ValidationChain | RecordingId,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getLimitedRecordingForRequestUser,
    recordingId,
  );

export const fetchAuthorizedRequiredFlatRecordingById = (
  recordingId: ValidationChain | RecordingId,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getFlatRecordingForRequestUser,
    recordingId,
  );

export const fetchUnauthorizedRequiredFlatRecordingById = (
  recordingId: ValidationChain | RecordingId,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getRecording(false, false, false, false),
    recordingId,
  );

export const fetchAuthorizedRequiredFullRecordingById = (
  recordingId: ValidationChain | RecordingId,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getFullRecordingForRequestUser,
    recordingId,
  );

export const fetchUnauthorizedRequiredLimitedRecordingById = (
  recordingId: ValidationChain,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getRecording(false, false, false, true),
    recordingId,
  );

export const fetchUnauthorizedRequiredFullRecordingById = (
  recordingId: ValidationChain,
) =>
  fetchRequiredModel(
    Recording,
    false,
    true,
    getRecording(false, false, true, true),
    recordingId,
  );

export const fetchAdminAuthorizedRequiredLimitedRecordingsByIds = (
  recordingIds: ValidationChain,
) =>
  fetchRequiredModels(
    Recording,
    false,
    true,
    getLimitedRecordingsForRequestUserAsAdmin,
    recordingIds,
  );

export const fetchAuthorizedRequiredLimitedRecordingsByIds = (
  recordingIds: ValidationChain,
) =>
  fetchRequiredModels(
    Recording,
    false,
    true,
    getLimitedRecordingsForRequestUser,
    recordingIds,
  );

export const fetchAuthorizedRequiredFlatRecordingsByIds = (
  recordingIds: ValidationChain,
) =>
  fetchRequiredModels(
    Recording,
    false,
    true,
    getFlatRecordingsForRequestUser,
    recordingIds,
  );

export const fetchAuthorizedRequiredDevices = fetchRequiredModels(
  Device,
  false,
  false,
  getDevices(true, false),
);

export const fetchAuthorizedRequiredStations = fetchRequiredModels(
  Station,
  false,
  false,
  getStations(true, false),
);

export const fetchAuthorizedRequiredStationsForGroup = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModels(
    Station,
    true,
    true,
    getStations(true, false),
    groupNameOrId,
  );

export const fetchAuthorizedRequiredStationById = (
  stationId: ValidationChain,
) =>
  fetchRequiredModel(Station, false, true, getStation(true, false), stationId);

export const fetchAuthorizedRequiredAlertById = (alertId: ValidationChain) =>
  fetchRequiredModel(Alert, false, true, getAlert(true), alertId);

export const fetchAdminAuthorizedRequiredStationById = (
  stationId: ValidationChain,
) =>
  fetchRequiredModel(Station, false, true, getStation(true, true), stationId);

export const fetchAdminAuthorizedRequiredStationByNameInGroup = (
  groupNameOrId: ValidationChain,
  stationNameOrId: ValidationChain,
) =>
  fetchRequiredModel(
    Station,
    true,
    true,
    getStation(true, true),
    stationNameOrId,
    groupNameOrId,
  );

export const fetchAuthorizedRequiredStationByNameInGroup = (
  groupNameOrId: ValidationChain,
  stationNameOrId: ValidationChain,
) =>
  fetchRequiredModel(
    Station,
    true,
    true,
    getStation(true, false),
    stationNameOrId,
    groupNameOrId,
  );

export const fetchAuthorizedRequiredEventById = (eventId: ValidationChain) =>
  fetchRequiredModel(Event, false, true, getEvent(true, false), eventId);

export const fetchAuthorizedRequiredSchedulesForGroup = (
  groupNameOrId: ValidationChain,
) =>
  fetchRequiredModels(
    Schedule,
    false,
    false,
    getSchedules(true, false),
    groupNameOrId,
  );

export const fetchAuthorizedRequiredGroups = fetchRequiredModels(
  Group,
  false,
  false,
  getGroups(true, false),
);

export const fetchAdminAuthorizedRequiredGroups = fetchRequiredModels(
  Group,
  false,
  false,
  getGroups(true, true),
);

export const fetchUnAuthorizedOptionalEventDetailSnapshotById = (
  detailId: ValidationChain,
) =>
  fetchOptionalModel(
    DetailSnapshot,
    false,
    true,
    getUnauthorizedGenericModelById(DetailSnapshot),
    detailId,
  );

export const fetchUnauthorizedRequiredEventDetailSnapshotById = (
  detailId: ValidationChain,
) =>
  fetchRequiredModel(
    DetailSnapshot,
    false,
    true,
    getUnauthorizedGenericModelById(DetailSnapshot),
    detailId,
  );

export const fetchUnauthorizedRequiredEventById = (eventId: ValidationChain) =>
  fetchRequiredModel(
    Event,
    false,
    true,
    getUnauthorizedGenericModelById(Event),
    eventId,
  );

export const fetchUnauthorizedRequiredTrackById = (trackId: ValidationChain) =>
  fetchRequiredModel(
    Track,
    false,
    true,
    getUnauthorizedGenericModelById(Track),
    trackId,
  );

export const fetchUnauthorizedRequiredTrackTagById = (tagId: ValidationChain) =>
  fetchRequiredModel(
    TrackTag,
    false,
    true,
    getUnauthorizedGenericModelById(TrackTag),
    tagId,
  );

export const fetchUnauthorizedRequiredFileById = (fileId: ValidationChain) =>
  fetchRequiredModel(
    File,
    false,
    true,
    getUnauthorizedGenericModelById(File),
    fileId,
  );

export const fetchUnauthorizedRequiredRecordingTagById = (
  tagId: ValidationChain,
) =>
  fetchRequiredModel(
    Tag,
    false,
    true,
    getUnauthorizedGenericModelById(Tag),
    tagId,
  );

export const fetchUnauthorizedRequiredScheduleById = (
  scheduleId: ValidationChain | ScheduleId,
) =>
  fetchRequiredModel(
    Schedule,
    false,
    true,
    getUnauthorizedGenericModelById(Schedule),
    scheduleId,
  );
