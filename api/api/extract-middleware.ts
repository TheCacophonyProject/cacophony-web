import { NextFunction, Request, Response } from "express";
import {
  checkAccess,
  DecodedJWTToken,
  getVerifiedJWT,
  lookupEntity,
} from "./auth";
import models, { ModelStaticCommon } from "../models";
import logger from "../logging";
import log from "../logging";
import { modelTypeName, modelTypeNamePlural } from "./middleware";
import { format } from "util";
import { Location, ValidationChain } from "express-validator";
import { AuthorizationError, ClientError } from "./customErrors";
import { User } from "models/User";
import { Op } from "sequelize";
import { Device } from "models/Device";
import { UserId } from "@typedefs/api/common";
import { Group } from "models/Group";
import { Recording } from "models/Recording";

const upperFirst = (str: string): string =>
  str.slice(0, 1).toUpperCase() + str.slice(1);

const extractJwtAuthenticatedEntity =
  (types: string[], reqAccess?: { devices?: any }, requireSuperAdmin = false) =>
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

      if (requireSuperAdmin && type !== "user") {
        return next(new ClientError("Admin has to be a user", 403));
      }

      let result;
      try {
        result = await lookupEntity(jwtDecoded);
      } catch (e) {
        return next(e);
      }
      if (result === null) {
        return next(
          new ClientError(
            `Could not find entity '${jwtDecoded.id}' of type '${type}' referenced by JWT.`,
            401
          )
        );
      }
      response.locals[`request${upperFirst(type)}`] = result;

      response.locals.viewAsSuperUser = false;
      if (
        request.query["view-mode"] !== "user" &&
        response.locals.requestUser
      ) {
        const globalPermissions = (response.locals.requestUser as User)
          .globalPermission;
        response.locals.viewAsSuperUser = globalPermissions !== "off";
      }

      if (requireSuperAdmin && !response.locals.viewAsSuperUser) {
        return next(new ClientError("User is not an admin.", 403));
      }

      return next();
    } catch (e) {
      logger.error("HERE %s", e);
      return next(e);
    }
  };

export const extractJwtAuthorizedUser = extractJwtAuthenticatedEntity(["user"]);
export const extractJwtAuthorisedSuperAdminUser = extractJwtAuthenticatedEntity(
  ["user"],
  undefined,
  true
);
export const extractJwtAuthorisedDevice = extractJwtAuthenticatedEntity([
  "device",
]);

const extractModel =
  <T>(
    modelType: ModelStaticCommon<T>,
    location: Location,
    key: string,
    stopOnFailure = true,
    forRequestUser = false,
    requiresAdminPermissions = false,
    byName = false
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const id = request[location][key];
    const byNameOrId = byName ? "name" : "id";
    if (!id) {
      if (stopOnFailure) {
        return next(
          new ClientError(
            `Could not find a ${modelType.name} with ${byNameOrId} of '${id}'`,
            400
          )
        );
      } else {
        return next();
      }
    }
    const modelName = modelTypeName(modelType);
    logger.info("Get %s %s for %s", byNameOrId, id, modelName);

    // FIXME - Since we have the users' jwt token, in theory we don't even need to extract the user first, right?
    //  Except to see if they have global read permission etc.  But we could fallback to that, or incorporate it into the
    //  query.

    const { requestUser } = response.locals;
    let options;
    const accessTypeIsReadonly = !requiresAdminPermissions; //request.method === "GET";
    const accessType = accessTypeIsReadonly ? "read" : "write";
    if (forRequestUser) {
      if (requestUser) {
        const hasAccess = accessTypeIsReadonly
          ? "hasGlobalRead"
          : "hasGlobalWrite";

        // If we're a regular user, and we're doing something other than a GET, we really should be an admin
        // of the resource we're grabbing?

        const requestingWithSuperAdminPermissions =
          response.locals.viewAsSuperUser && requestUser[hasAccess]();

        if (!requestingWithSuperAdminPermissions) {
          const useAdminAccess = accessType === "write" ? { admin: true } : {};
          // Then check that the user can access the device.
          if (modelName === "device") {
            options = getDeviceInclude(useAdminAccess, requestUser.id);
          } else {
            return next(
              new ClientError(`Unhandled model for user ${modelName}`)
            );
          }
        } else {
          // Don't add any permission constraints when getting the resource
          log.info(
            `Accessing ${modelName} ${id} by ${requestUser.username} as super-admin`
          );
        }
      } else {
        return next(
          new ClientError(`No user specified for ${modelName}.`, 422)
        );
      }
    }
    let model = null;
    try {
      if (!byName) {
        if (modelName === "device") {
          model = await modelType.findOne({
            where: {
              id,
              [Op.or]: [
                { "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } },
                { "$Users.DeviceUsers.UserId$": { [Op.ne]: null } },
              ],
            },
            ...options,
          });
        } else {
          model = await modelType.findByPk(id, options);
        }
      } else {
        if (modelName === "device") {
          model = await models.Device.findOne({
            where: {
              devicename: id,
              GroupId: response.locals.group.id,
              [Op.or]: [
                { "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } },
                { "$Users.DeviceUsers.UserId$": { [Op.ne]: null } },
              ],
            },
            ...options,
          });
        } else {
          // FIXME - permissions for user?
          if (!modelType.getFromName) {
            return next(
              new Error(`${modelName} does not support 'getFromName'`)
            );
          }
          model = await modelType.getFromName(id);
        }
      }
    } catch (e) {
      return next(e);
    }
    if (model === null) {
      // NOTE: If the device doesn't exist, call it an authorization error too, so that users
      //  can't infer the existence of resources by id.
      log.info(
        `Attempted unauthorized ${accessType} attempt of ${modelName} ${id} by ${requestUser.username} (${requestUser.id})`
      );
      return next(
        new AuthorizationError(
          `User is not authorized to ${accessType} ${modelName} ${id}`
        )
      );
    }
    response.locals[modelTypeName(modelType)] = model;
    next();
  };

const deviceAttributes = [
  "id",
  "devicename",
  "location",
  "saltId",
  "GroupId",
  // FIXME - Use lastConnectionTime column.
  "active",
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
      [Op.or]: [
        { "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } },
        { "$Users.DeviceUsers.UserId$": { [Op.ne]: null } },
      ],
    },
    attributes: deviceAttributes,
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupname"],
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
        model: models.User,
        attributes: ["id"],
        through: {
          where: {
            ...useAdminAccess,
          },
          attributes: ["admin", "UserId"],
        },
        required: false,
        where: { id: requestUserId },
      },
    ],
  });

const getRecordingInclude =
  (recordingsWhere: any, groupWhere: any, deviceWhere: any) =>
  (useAdminAccess: { admin: true } | {}, requestUserId: UserId) => ({
    where: {
      ...recordingsWhere,
      [Op.or]: [
        { "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } },
        { "$Device.Users.DeviceUsers.UserId$": { [Op.ne]: null } },
      ],
    },
    // TODO - RecordingAttributes
    //attributes: deviceAttributes,
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupname"],
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
        attributes: ["id", "devicename"],
        required: false,
        where: deviceWhere,
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

const extractModels =
  <T>(
    modelType: ModelStaticCommon<T>,
    forRequestUser = false,
    requiresAdminPermissions = false
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const onlyActive =
      request.query.onlyActive && Boolean(request.query.onlyActive) !== false;
    const modelName = modelTypeName(modelType);
    // FIXME - Since we have the users' jwt token, in theory we don't even need to extract the user first, right?
    //  Except to see if they have global read permission etc.  But we could fallback to that, or incorporate it into the
    //  query.

    const { requestUser } = response.locals;
    let options: any = {
      include: [
        {
          model: models.Group,
          attributes: ["groupname"],
        },
      ],
    };
    const accessTypeIsReadonly = !requiresAdminPermissions; //request.method === "GET";
    const accessType = accessTypeIsReadonly ? "read" : "write";
    if (forRequestUser) {
      if (requestUser) {
        const hasAccess = accessTypeIsReadonly
          ? "hasGlobalRead"
          : "hasGlobalWrite";

        // If we're a regular user, and we're doing something other than a GET, we really should be an admin
        // of the resource we're grabbing?

        const requestingWithSuperAdminPermissions =
          response.locals.viewAsSuperUser && requestUser[hasAccess]();

        if (!requestingWithSuperAdminPermissions) {
          const useAdminAccess = accessType === "write" ? { admin: true } : {};
          // Then check that the user can access the device.
          if (modelName === "device") {
            options = getDeviceInclude(useAdminAccess, requestUser.id);
          } else {
            return next(
              new ClientError(`Unhandled model for user ${modelName}`)
            );
          }
        } else {
          // Don't add any permission constraints when getting the resource
          log.info(
            `Accessing ${modelName} by ${requestUser.username} as super-admin`
          );
        }
      } else {
        return next(
          new ClientError(`No user specified for ${modelName}.`, 422)
        );
      }
    }

    if (onlyActive) {
      options.where = { active: true };
    }
    if (modelName === "device") {
      options.where = options.where || {};
      options.where[Op.or] = [
        { "$Group.Users.GroupUsers.UserId$": { [Op.ne]: null } },
        { "$Users.DeviceUsers.UserId$": { [Op.ne]: null } },
      ];
    }

    let model = [];
    try {
      model = await modelType.findAll(options);
    } catch (e) {
      return next(e);
    }
    response.locals[modelTypeNamePlural(modelType)] = model;
    next();
  };

const extractModelByName =
  <T>(
    modelType: ModelStaticCommon<T>,
    location: Location,
    key: string,
    stopOnFailure = true
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const name = request[location][key];
    if (!name) {
      if (stopOnFailure) {
        return next(
          new ClientError(
            format(
              "Could not find a %s with a name of '%s'",
              modelType.name,
              name
            ),
            400
          )
        );
      } else {
        return next();
      }
    }
    const modelName = modelTypeName(modelType);
    logger.info("Get name %s for %s", name, modelName);
    if (!modelType.getFromName) {
      return next(new Error(`${modelName} does not support 'getFromName'`));
    }
    const model = await modelType.getFromName(name);
    if (model === null) {
      if (stopOnFailure) {
        return next(
          new ClientError(
            format(
              "Could not find a %s with a name of '%s'",
              modelType.name,
              name
            ),
            400
          )
        );
      } else {
        return next();
      }
    }
    response.locals[modelName] = model;
    next();
  };

export const extractRecording = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModel(models.Recording, location, key, stopOnFailure);
export const extractDevice = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModel(models.Device, location, key, stopOnFailure);
export const extractDeviceForRequestingUser = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModel(models.Device, location, key, stopOnFailure, true);

export const extractDevicesForRequestingUser = extractModels(
  models.Device,
  true
);

export const extractDeviceForRequestingUserWithAdminPermissions = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModel(models.Device, location, key, stopOnFailure, true, true);

export const extractDeviceByNameForRequestingUserWithAdminPermissions = (
  location: Location,
  key: string,
  stopOnFailure = true
) =>
  extractModel(models.Device, location, key, stopOnFailure, true, true, true);

export const extractDeviceByNameForRequestingUser = (
  location: Location,
  key: string,
  stopOnFailure = true
) =>
  extractModel(models.Device, location, key, stopOnFailure, true, false, true);

export const extractOptionalDeviceForRequestingUser = (
  location: Location,
  key: string
) => extractModel(models.Device, location, key, false, true);
export const extractUser = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModel(models.User, location, key, stopOnFailure);
export const extractGroupByName = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModelByName(models.Group, location, key, stopOnFailure);

export const extractDeviceByName =
  (location: Location, key: string, stopOnFailure = true) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const name = request[location][key];
    if (!name) {
      if (stopOnFailure) {
        return next(
          new ClientError(
            format("Could not find a %s with a name of '%s'", "device", name),
            400
          )
        );
      } else {
        return next();
      }
    }
    if (!response.locals.group) {
      return next(
        new ClientError(`No group specified for device with name ${name}`, 400)
      );
    }
    const device = await models.Device.findOne({
      where: {
        devicename: request.params.deviceName,
        GroupId: response.locals.group.id,
      },
      // include: [
      //   {
      //     model: models.User,
      //     attributes: ["id", "username"],
      //   },
      // ],
    });
    if (device === null) {
      if (stopOnFailure) {
        return next(
          new ClientError(
            format("Could not find a device with a name of '%s'", name),
            400
          )
        );
      } else {
        return next();
      }
    }
    response.locals.device = device;
    next();
  };

export const extractEventDetailSnapshot = (
  location: Location,
  key: string,
  stopOnFailure = true
) => extractModel(models.DetailSnapshot, location, key, stopOnFailure);
export const extractOptionalEventDetailSnapshot = (
  location: Location,
  key: string
) => extractModel(models.DetailSnapshot, location, key, false);
export const parseJSONField =
  (location: Location, key: string) =>
  (request: Request, response: Response, next: NextFunction) => {
    if (request[location][key]) {
      let value = request[location][key];
      if (typeof value === "string") {
        try {
          value = JSON.parse(request[location][key]);
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

export const extractViewMode = (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  // This only makes sense if the user is a super-user, which we can check
  response.locals.viewAsSuperUser = false;
  if (request.query["view-mode"] !== "user") {
    const globalPermissions = (response.locals.requestUser as User)
      .globalPermission;
    response.locals.viewAsSuperUser = globalPermissions !== "off";
  }
  next();
};

export const extractGroupByNameOrId = (
  location: Location,
  nameKey: string,
  idKey: string | number,
  stopOnFailure = true
) => {
  return extractModelNameOrId(
    models.Group,
    location,
    nameKey,
    idKey,
    stopOnFailure
  );
};

export const extractUserByNameOrId = (
  location: Location,
  nameKey: string,
  idKey: string | number,
  stopOnFailure = true
) => {
  return extractModelNameOrId(
    models.User,
    location,
    nameKey,
    idKey,
    stopOnFailure
  );
};

export const extractUserByName = (
  location: Location,
  nameKey: string,
  stopOnFailure = true
) => {
  return extractModelByName(models.User, location, nameKey, stopOnFailure);
};

export const extractModelNameOrId =
  <T>(
    modelType: ModelStaticCommon<T>,
    location: Location,
    nameKey: string,
    idKey: string | number,
    stopOnFailure
  ) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const id = request[location][idKey];
    const name = request[location][nameKey];
    if (!id && !name) {
      if (!id) {
        return next(
          new ClientError(
            `Could not find a ${modelType.name} with an id of '${id}'`
          )
        );
      }
      if (!name) {
        return next(
          new ClientError(
            `Could not find a ${modelType.name} with a name of '${name}'`
          )
        );
      }
    }
    let model;
    const modelName = modelTypeName(modelType);
    if (id && Number(id) == id) {
      logger.info("Get id %s for %s", id, modelName);
      model = await modelType.findByPk(id);
    }
    if (!model && name) {
      logger.info("Get name %s for %s", name, modelName);
      if (!modelType.getFromName) {
        logger.info(`${modelName} does not support 'getFromName'`);
        return next(new Error(`${modelName} does not support 'getFromName'`));
      }
      model = await modelType.getFromName(name);
    }
    if (model === null) {
      if (stopOnFailure) {
        if (id) {
          return next(
            new ClientError(
              `Could not find a ${modelType.name} with an id of '${name}'`
            )
          );
        } else if (name) {
          return next(
            new ClientError(
              `Could not find a ${modelType.name} with a name of '${name}'`
            )
          );
        }
      } else {
        return next();
      }
    }
    response.locals[modelName] = model;
    next();
  };

// extractModelByName
// extractModelById
// extractModelsByNameOrId

// extractModelForRequestUserByNameOrId
// extractModelsForRequestUserByNameOrId

// extractDeviceInGroupForRequestUserByNameOrId
// extractDevicesForRequestUserByNameOrId

// extractModel
// extractOptionalModel
//type ModelGetter<T> = (id: string, id2: string, forRequestUser: boolean) => Promise<ModelStaticCommon<T> | null>;

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

export const extractTheModel =
  <T>(
    modelType: ModelStaticCommon<T>,
    required: boolean,
    byName: boolean,
    byId: boolean,
    modelGetter: ModelGetter<T> | ModelsGetter<T>,
    primary: ValidationChain,
    secondary?: ValidationChain
  ) =>
  async (request: Request, response: Response, next: NextFunction) => {
    const modelName = modelTypeName(modelType);
    const id = extractValFromRequest(request, primary) as string;
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

    let model;
    try {
      model = await modelGetter(id, id2, response.locals);
    } catch (e) {
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
            new ClientError(
              `Could not find a ${modelName} with an name or id of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`,
              403
            )
          );
        } else if (byId) {
          return next(
            new ClientError(
              `Could not find a ${modelName} with an id of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`,
              403
            )
          );
        } else if (byName) {
          return next(
            new ClientError(
              `Could not find a ${modelName} with a name of '${id}'${
                id2 ? ` in ${id2}` : ""
              }${forUser ? " for user" : ""}`,
              403
            )
          );
        } else {
          return next(
            new ClientError(
              `Could not find any ${modelTypeNamePlural(modelType)}${
                forUser ? " for user" : ""
              }`,
              403
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

export const extractRequiredModel = <T>(
  modelType: ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelGetter: ModelGetter<T>,
  primary: ValidationChain,
  secondary?: ValidationChain
) =>
  extractTheModel(
    modelType,
    true,
    byName,
    byId,
    modelGetter,
    primary,
    secondary
  );

export const extractRequiredModels = <T>(
  modelType: ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelsGetter: ModelsGetter<T>,
  primary?: ValidationChain,
  secondary?: ValidationChain
) =>
  extractTheModel(
    modelType,
    true,
    byName,
    byId,
    modelsGetter,
    primary,
    secondary
  );

export const extractOptionalModel = <T>(
  modelType: ModelStaticCommon<T>,
  byName: boolean,
  byId: boolean,
  modelGetter: ModelGetter<T>,
  primary: ValidationChain,
  secondary?: ValidationChain
) =>
  extractTheModel(
    modelType,
    false,
    byName,
    byId,
    modelGetter,
    primary,
    secondary
  );

const getDevices =
  (forRequestUser: boolean = false, asAdmin: boolean) =>
  (
    unused1?: string,
    unused2?: string,
    context?: any
  ): Promise<ModelStaticCommon<Device>[] | ClientError | null> => {
    let getDeviceOptions;

    const allDevicesOptions = {
      where: {},
      include: [
        {
          model: models.Group,
          required: true,
          where: {},
        },
      ],
    };

    if (forRequestUser) {
      if (context && context.requestUser) {
        // Insert request user constraints
        getDeviceOptions = getIncludeForUser(
          context,
          getDeviceInclude({}, {}),
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
    //console.dir(getDeviceOptions, {depth: 5});
    return models.Device.findAll(getDeviceOptions);
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
        getGroupOptions = getIncludeForUser(
          context,
          getGroupInclude,
          asAdmin
        );
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
    return models.Group.findAll(getGroupOptions);
  };

const getRecording =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
  (
    recordingId: string,
    usused: string,
    context?: any
  ): Promise<ModelStaticCommon<Recording> | ClientError | null> => {
    const recordingWhere = {
      id: parseInt(recordingId),
    };

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
    return models.Recording.findOne(getRecordingOptions);
  };

const getRecordings =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
  (
    recordingIds: string,
    usused: string,
    context?: any
  ): Promise<ModelStaticCommon<Recording>[] | ClientError> => {
    const recordingWhere = {
      id: { [Op.in]: recordingIds },
    };

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
    return models.Recording.findAll(getRecordingOptions);
  };

const getDevice =
  (forRequestUser: boolean = false, asAdmin: boolean = false) =>
  (
    deviceNameOrId: string,
    groupNameOrId?: string,
    context?: any
  ): Promise<ModelStaticCommon<Device> | ClientError | null> => {
    const deviceIsId = !isNaN(parseInt(deviceNameOrId)) && parseInt(deviceNameOrId).toString() === String(deviceNameOrId);
    const groupIsId = groupNameOrId && !isNaN(parseInt(groupNameOrId)) && parseInt(groupNameOrId).toString() === String(groupNameOrId);

    let deviceWhere;
    let groupWhere = {};
    if (deviceIsId && groupIsId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
        GroupId: parseInt(groupNameOrId),
      };
    } else if (deviceIsId && groupNameOrId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
        "$Group.groupname$": groupNameOrId,
      };
    } else if (deviceIsId && !groupNameOrId) {
      deviceWhere = {
        id: parseInt(deviceNameOrId),
      };
    } else if (groupIsId) {
      deviceWhere = {
        devicename: deviceNameOrId,
        GroupId: parseInt(groupNameOrId),
      };
    } else {
      deviceWhere = {
        devicename: deviceNameOrId,
        "$Group.groupname$": groupNameOrId,
      };
    }
    if (groupIsId) {
      groupWhere = {
        id: parseInt(groupNameOrId),
      };
    } else if (groupNameOrId) {
      groupWhere = { groupname: groupNameOrId };
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
      } else {
        return Promise.resolve(
          new ClientError("No authorizing user specified")
        );
      }
    } else {
      getDeviceOptions = {
        where: deviceWhere,
        include: [
          {
            model: models.Group,
            required: true,
            where: groupWhere,
          },
        ],
      };
    }

    // FIXME - When re-registering we can actually have two devices in the same group with the same name - but one
    //  will be inactive.  Maybe we should change the name of the inactive device to disambiguate it?
    if (context.onlyActive) {
      (getDeviceOptions as any).where.active = true;
    }
    //console.dir(getDeviceOptions, {depth: 5});
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
      `Accessing model by ${context.requestUser.username} as super-admin`
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
    const groupCouldBeNameOrId = groupNameOrId == parseInt(groupNameOrId);
    let groupWhere;
    if (groupCouldBeNameOrId) {
      groupWhere = {
        [Op.or]: [
          { id: parseInt(groupNameOrId) },
          { groupname: groupNameOrId },
        ],
      };
    } else {
      groupWhere = { groupname: groupNameOrId };
    }

    // FIXME - Return whether or not the current requesting user is an admin of this group.

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
    return models.Group.findOne(getGroupOptions);
  };

const getUser =
  () =>
  (
    userNameOrEmailOrId: string
  ): Promise<ModelStaticCommon<User> | ClientError | null> => {
    // @ts-ignore
    const userIsId = !isNaN(parseInt(userNameOrEmailOrId)) && parseInt(userNameOrEmailOrId).toString() === String(userNameOrEmailOrId);
    let userWhere;
    if (userIsId) {
      userWhere = {
        id: parseInt(userNameOrEmailOrId)
      };
    } else {
      userWhere = {
        [Op.or]: [
          { username: userNameOrEmailOrId },
          { email: userNameOrEmailOrId },
        ],
      };
    }
    return models.User.findOne({
      where: userWhere,
    });
  };

const getUnauthorizedGenericModelById =
  <T>(modelType: ModelStaticCommon<T>) =>
  <T>(id: string): Promise<ModelStaticCommon<T> | ClientError | null> => {
    return modelType.findByPk(id);
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
  extractRequiredModel(
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
  extractRequiredModels(
    models.Device,
    true,
    true,
    getDevicesForRequestUser,
    groupNameOrId
  );

export const extractUnauthenticatedRequiredDeviceById = (
  deviceId: ValidationChain
) =>
  extractRequiredModel(
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
  extractRequiredModel(
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
  extractOptionalModel(
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
  extractOptionalModel(
    models.Device,
    false,
    true,
    getDeviceUnauthenticated,
    deviceId
  );
export const fetchAuthorizedRequiredDeviceById = (deviceId: ValidationChain) =>
  extractRequiredModel(
    models.Device,
    false,
    true,
    getDeviceForRequestUser,
    deviceId
  );

export const fetchAdminAuthorizedRequiredDeviceById = (
  deviceId: ValidationChain
) =>
  extractRequiredModel(
    models.Device,
    false,
    true,
    getDeviceForRequestUserAsAdmin,
    deviceId
  );

export const fetchAuthorizedOptionalDeviceById = (deviceId: ValidationChain) =>
  extractOptionalModel(
    models.Device,
    false,
    true,
    getDeviceForRequestUser,
    deviceId
  );

// TODO Check this with the 2040 group...
export const fetchUnauthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain
) =>
  extractRequiredModel(
    models.Group,
    true,
    true,
    getGroupUnauthenticated,
    groupNameOrId
  );

export const fetchUnauthorizedOptionalGroupByNameOrId = (
  groupNameOrId: ValidationChain
) =>
  extractOptionalModel(
    models.Group,
    true,
    true,
    getGroupUnauthenticated,
    groupNameOrId
  );

export const fetchAuthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain
) =>
  extractRequiredModel(
    models.Group,
    true,
    true,
    getGroupForRequestUser,
    groupNameOrId
  );

export const fetchAdminAuthorizedRequiredGroupByNameOrId = (
  groupNameOrId: ValidationChain
) =>
  extractRequiredModel(
    models.Group,
    true,
    true,
    getGroupForRequestUserAsAdmin,
    groupNameOrId
  );

export const fetchUnauthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain
) =>
  extractRequiredModel(
    models.Group,
    false,
    true,
    getGroupUnauthenticated,
    groupNameOrId
  );

export const fetchAuthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain
) =>
  extractRequiredModel(
    models.Group,
    false,
    true,
    getGroupForRequestUser,
    groupNameOrId
  );

export const fetchAdminAuthorizedRequiredGroupById = (
  groupNameOrId: ValidationChain
) =>
  extractRequiredModel(
    models.Group,
    false,
    true,
    getGroupForRequestUserAsAdmin,
    groupNameOrId
  );

export const extractRequiredUserByNameOrEmailOrId = (
  userNameOrEmailOrId: ValidationChain
) =>
  extractRequiredModel(models.User, true, true, getUser(), userNameOrEmailOrId);

export const extractOptionalUserByNameOrEmailOrId = (
  userNameOrEmailOrId: ValidationChain
) =>
  extractOptionalModel(models.User, true, true, getUser(), userNameOrEmailOrId);

export const fetchUnauthorizedOptionalUserByNameOrId = (
  userNameOrId: ValidationChain
) => extractOptionalModel(models.User, true, true, getUser(), userNameOrId);

export const fetchUnauthorizedRequiredUserByNameOrId = (
  userNameOrId: ValidationChain
) => extractRequiredModel(models.User, true, true, getUser(), userNameOrId);

export const fetchUnauthorizedOptionalUserById = (userId: ValidationChain) =>
  extractOptionalModel(models.User, false, true, getUser(), userId);

export const extractRequiredUserById = (userId: ValidationChain) =>
  extractRequiredModel(models.User, false, true, getUser(), userId);

export const fetchAdminAuthorizedRequiredRecordingById = (
  recordingId: ValidationChain
) =>
  extractRequiredModel(
    models.Recording,
    false,
    true,
    getRecordingForRequestUserAsAdmin,
    recordingId
  );

export const fetchAuthorizedRequiredRecordingById = (
  recordingId: ValidationChain
) =>
  extractRequiredModel(
    models.Recording,
    false,
    true,
    getRecordingForRequestUser,
    recordingId
  );

export const fetchAdminAuthorizedRequiredRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  extractRequiredModels(
    models.Recording,
    false,
    true,
    getRecordingsForRequestUserAsAdmin,
    recordingIds
  );

export const fetchAuthorizedRequiredRecordingsByIds = (
  recordingIds: ValidationChain
) =>
  extractRequiredModels(
    models.Recording,
    false,
    true,
    getRecordingsForRequestUser,
    recordingIds
  );

export const fetchAuthorizedRequiredDevices = extractRequiredModels(
  models.Device,
  false,
  false,
  getDevices(true, false)
);
export const fetchAuthorizedRequiredGroups = extractRequiredModels(
  models.Group,
  false,
  false,
  getGroups(true, false)
);

export const extractOptionalEventDetailSnapshotById = (
  detailId: ValidationChain
) =>
  extractOptionalModel(
    models.DetailSnapshot,
    false,
    true,
    getUnauthorizedGenericModelById(models.DetailSnapshot),
    detailId
  );
