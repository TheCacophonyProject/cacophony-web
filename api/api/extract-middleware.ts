import { NextFunction, Request, Response } from "express";
import {
  checkAccess,
  DecodedJWTToken,
  getDecodedResetToken,
  getDecodedToken,
  getVerifiedJWT,
  lookupEntity,
} from "./auth";
import models, { ModelStaticCommon } from "../models";
import logger from "../logging";
import log from "../logging";
import { modelTypeName, modelTypeNamePlural } from "./middleware";
import { ValidationChain } from "express-validator";
import {
  AuthenticationError,
  AuthorizationError,
  ClientError,
} from "./customErrors";
import { User } from "models/User";
import { Op } from "sequelize";
import { Device } from "models/Device";
import { RecordingId, ScheduleId, UserId } from "@typedefs/api/common";
import { Group } from "models/Group";
import { Recording } from "models/Recording";
import { Station } from "@/models/Station";
import { Schedule } from "@/models/Schedule";
import { UserGlobalPermission } from "@typedefs/api/consts";
import { urlNormaliseName } from "@/emails/htmlEmailUtils";
import { SuperUsers } from "@/Globals";

const upperFirst = (str: string): string =>
  str.slice(0, 1).toUpperCase() + str.slice(1);

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

      const short = true;
      if ((short && type === "user") || type === "device") {
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
              hasGlobalRead: () => true,
              hasGlobalWrite: () =>
                superUserPermissions === UserGlobalPermission.Write,
              globalPermission: superUserPermissions,
            };
          }
        } else if (type === "device") {
          response.locals.requestDevice = { id: jwtDecoded.id };
        }
      } else {
        let result;
        try {
          result = await lookupEntity(jwtDecoded);
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
      if (
        request.query["view-mode"] !== "user" &&
        response.locals.requestUser
      ) {
        const globalPermissions = (response.locals.requestUser as User)
          .globalPermission;
        response.locals.viewAsSuperUser =
          globalPermissions !== UserGlobalPermission.Off;
      }

      if (requireSuperAdmin && !response.locals.viewAsSuperUser) {
        return next(new AuthorizationError("User is not an admin."));
      }

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
  "password", // Needed for auth, but not passed through when mapping to response.
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
        },
        attributes: ["admin"],
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
    primary: ValidationChain | number,
    secondary?: ValidationChain
  ) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const modelName = modelTypeName(modelType);

    let id;
    if (typeof primary === "number") {
      id = primary;
    } else {
      id = extractValFromRequest(request, primary) as string;
    }
    if (!id && !required) {
      return next();
    }
    const id2 = extractValFromRequest(request, secondary);
    response.locals.onlyActive = true; // Default to only showing active devices.
    if (
      ("onlyActive" in request.query &&
        Boolean(request.query.onlyActive) === false) ||
      ("only-active" in request.query &&
        Boolean(request.query["only-active"]) === false)
    ) {
      response.locals.onlyActive = false;
    }
    if ("deleted" in request.query) {
      response.locals.deleted = Boolean(request.query.deleted);
    }

    let model;
    try {
      model = await modelGetter(id, id2, response.locals);
    } catch (e) {
      logger.error("%s", e.sql);
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
  primary: ValidationChain,
  secondary?: ValidationChain
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
        // include: [
        //   {
        //     model: models.Group,
        //     required: true,
        //     where: {},
        //   },
        // ],
      };
    }
    return models.Group.findAll({
      ...getGroupOptions,
      order: ["groupName"],
      subQuery: false,
    });
  };

const getRecordingRelationships = (recordingQuery: any): any => {
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
  ];
  recordingQuery.include = recordingQuery.include || [];
  recordingQuery.include.push({
    model: models.Tag,
    order: ["createdAt"],
    attributes: [
      "id",
      "what",
      "detail",
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
    attributes: ["id", "data", "filtered"],
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
          "automatic",
          "confidence",
          "data",
          "TrackId",
          "UserId",
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
  return recordingQuery;
};

const getRecording =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
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
    getRecordingOptions.where = getRecordingOptions.where || recordingWhere;
    getRecordingOptions = getRecordingRelationships(getRecordingOptions);
    return models.Recording.findOne(getRecordingOptions);
  };

const getRecordings =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
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
    getRecordingOptions = getRecordingRelationships(getRecordingOptions);
    return models.Recording.findAll({
      ...getRecordingOptions,
      order: ["recordingDateTime"],
    });
  };

const getDevice =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
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
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
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
      `Accessing model by user #${context.requestUser.id} as super-admin`
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
        email: userEmailOrId.toLowerCase()
      };
    }
    return models.User.findOne({
      where: userWhere,
    });
  };

const getUnauthorizedGenericModelById =
  <T>(modelType: ModelStaticCommon<T>) =>
  <T>(id: string): Promise<T | ClientError | null> => {
    return modelType.findByPk(id) as unknown as Promise<T | null>;
  };

const getDeviceUnauthenticated = getDevice();
const getDeviceForRequestUser = getDevice(true);

const getDeviceForRequestUserAsAdmin = getDevice(true, true);
const getDevicesForRequestUser = getDevices(true, false);
const getRecordingForRequestUserAsAdmin = getRecording(true, true);
const getRecordingForRequestUser = getRecording(true, false);
const getRecordingsForRequestUserAsAdmin = getRecordings(true, true);
const getRecordingsForRequestUser = getRecordings(true, false);
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
    getDeviceForRequestUser,
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
  groupNameOrId: ValidationChain
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
  groupNameOrId: ValidationChain
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

export const fetchUnauthorizedRequiredUserByResetToken =
  (field: ValidationChain) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const token = extractValFromRequest(request, field) as string;
    let resetInfo;
    try {
      resetInfo = getDecodedResetToken(token);
    } catch (e) {
      return next(new AuthenticationError(`Reset token expired`));
    }
    response.locals.resetInfo = resetInfo;
    const user = await models.User.findByPk(response.locals.resetInfo.id);
    if (!user) {
      // FIXME - Should this be an AuthenticationError?
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
) =>
  fetchRequiredModel(models.User, true, true, getUser(), userEmailOrId);

export const fetchUnauthorizedOptionalUserByEmailOrId = (
  userEmailOrId: ValidationChain
) =>
  fetchOptionalModel(models.User, true, true, getUser(), userEmailOrId);

// export const fetchUnauthorizedRequiredUserByEmailOrId = (
//   userEmailOrId: ValidationChain
// ) => fetchRequiredModel(models.User, true, true, getUser(), userEmailOrId);

export const fetchUnauthorizedRequiredUserById = (userId: ValidationChain) =>
    fetchRequiredModel(models.User, false, true, getUser(), userId);


export const fetchUnauthorizedOptionalUserById = (userId: ValidationChain) =>
  fetchOptionalModel(models.User, false, true, getUser(), userId);

export const fetchAdminAuthorizedRequiredRecordingById = (
  recordingId: ValidationChain
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getRecordingForRequestUserAsAdmin,
    recordingId
  );

export const fetchAuthorizedRequiredRecordingById = (
  recordingId: ValidationChain | RecordingId
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getRecordingForRequestUser,
    recordingId
  );

export const fetchUnauthorizedRequiredRecordingById = (
  recordingId: ValidationChain
) =>
  fetchRequiredModel(
    models.Recording,
    false,
    true,
    getRecording(false, false),
    recordingId
  );

export const fetchAdminAuthorizedRequiredRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  fetchRequiredModels(
    models.Recording,
    false,
    true,
    getRecordingsForRequestUserAsAdmin,
    recordingIds
  );

export const fetchAuthorizedRequiredRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  fetchRequiredModels(
    models.Recording,
    false,
    true,
    getRecordingsForRequestUser,
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
