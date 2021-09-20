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
import { modelTypeName } from "./middleware";
import { format } from "util";
import { Location } from "express-validator";
import { AuthorizationError, ClientError } from "./customErrors";
import { User } from "models/User";

export const extractValidJWT = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    response.locals.token = getVerifiedJWT(request) as DecodedJWTToken;

    response.locals.viewAsSuperUser = false;
    if (request.query["view-mode"] !== "user") {
      const globalPermissions = (response.locals.requestUser as User)
        .globalPermission;
      response.locals.viewAsSuperUser = globalPermissions !== "off";
    }

    return next();
  } catch (e) {
    return next(e);
  }
};

const upperFirst = (str: string): string =>
  str.slice(0, 1).toUpperCase() + str.slice(1);

const extractAuthenticatedEntity =
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
      return next(e);
    }
  };

export const extractAuthorisedUser = extractAuthenticatedEntity(["user"]);
export const extractAuthorisedAdminUser = extractAuthenticatedEntity(["user"], undefined, true);
export const extractAuthorisedDevice = extractAuthenticatedEntity(["device"]);

const extractModel =
  <T>(
    modelType: ModelStaticCommon<T>,
    location: Location,
    key: string,
    stopOnFailure = true,
    forRequestUser = false
  ) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const id = request[location][key];
    if (!id) {
      if (stopOnFailure) {
        return next(
          new ClientError(
            format(
              "Could not find a %s with an id of '%s'",
              modelType.name,
              id
            ),
            400
          )
        );
      } else {
        return next();
      }
    }
    const modelName = modelTypeName(modelType);
    logger.info("Get id %s for %s", id, modelName);

    // FIXME - Since we have the users' jwt token, in theory we don't even need to extract the user first, right?
    //  Except to see if they have global read permission etc.  But we could fallback to that, or incorporate it into the
    //  query.

    const { requestUser } = response.locals;
    let options;
    const accessTypeIsReadonly = request.method === "GET";
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
          // Then check that the user can access the device.
          if (modelName === "device") {
            options = {
              include: [
                {
                  model: models.Group,
                  attributes: [],
                  required: false,
                  include: [
                    {
                      model: models.User,
                      attributes: [],
                      where: { id: requestUser.id },
                    },
                  ],
                },
                {
                  model: models.User,
                  attributes: [],
                  required: false,
                  where: { id: requestUser.id },
                },
              ],
            };
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
    const model = await modelType.findByPk(id, options);
    if (model === null) {
      // NOTE: If the device doesn't exist, call it an authorization error too, so that users
      //  can't infer the existence of resources by id.
      const accessType = accessTypeIsReadonly ? "read" : "write";
      log.info(
        `Attempted unauthorized ${accessType} attempt of ${modelName} ${id} by ${requestUser.username}`
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
export const extractOptionalDevice = (location: Location, key: string) =>
  extractDevice(location, key, false);
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
  return extractModelByName(
      models.User,
      location,
      nameKey,
      stopOnFailure
  );
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
