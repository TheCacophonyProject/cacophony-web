import { NextFunction, Request, Response } from "express";
import { DecodedJWTToken, getVerifiedJWT } from "./auth";
import models, { ModelStaticCommon } from "../models";
import logger from "../logging";
import { modelTypeName } from "./middleware";
import { format } from "util";
import { Location } from "express-validator";
import { ClientError } from "./customErrors";

export const extractValidJWT = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    response.locals.token = getVerifiedJWT(request) as DecodedJWTToken;
    return next();
  } catch (e) {
    return next(e);
  }
};

const extractModel = <T>(modelType: ModelStaticCommon<T>, location: Location, key: string, stopOnFailure = true) => async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const id = request[location][key];
  if (!id) {
    if (stopOnFailure) {
      return next(new ClientError(format("Could not find a %s with an id of '%s'", modelType.name, id), 400));
    } else {
      return next();
    }
  }
  logger.info("Get id %s for %s", id, modelTypeName(modelType));
  const model = await modelType.findByPk(id);
  if (model === null) {
    return next(new ClientError(format("Could not find a %s with an id of '%s'", modelType.name, id), 400));
  }
  response.locals[modelTypeName(modelType)] = model;
  next();
};

const extractModelByName = <T>(modelType: ModelStaticCommon<T>, location: Location, key: string, stopOnFailure = true) => async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const id = request[location][key];
  if (!id) {
    if (stopOnFailure) {
      return next(new ClientError(format("Could not find a %s with a name of '%s'", modelType.name, id), 400));
    } else {
      return next();
    }
  }
  const modelName = modelTypeName(modelType);
  logger.info("Get name %s for %s", id, modelName);
  if (!modelType.getFromName) {
    return next(new Error(`${modelName} does not support 'getFromName'`));
  }
  const model = await modelType.getFromName(id);
  if (model === null) {
    if (stopOnFailure) {
      return next(new ClientError(format("Could not find a %s with a name of '%s'", modelType.name, id), 400));
    } else {
      return next();
    }
  }
  response.locals[modelName] = model;
  next();
};

export const extractDevice = (location: Location, key: string, stopOnFailure = true) => extractModel(models.Device, location, key, stopOnFailure);
export const extractOptionalDevice = (location: Location, key: string) => extractDevice(location, key, false);
export const extractUser = (location: Location, key: string, stopOnFailure = true) => extractModel(models.User, location, key, stopOnFailure);
export const extractGroupByName = (location: Location, key: string, stopOnFailure = true) => extractModelByName(models.Group, location, key, stopOnFailure);
export const extractEventDetailSnapshot = (location: Location, key: string, stopOnFailure = true) => extractModel(models.DetailSnapshot, location, key, stopOnFailure);
export const extractOptionalEventDetailSnapshot = (location: Location, key: string) => extractModel(models.DetailSnapshot, location, key, false);
export const extractJSONField = (location: Location, key: string) => (request: Request, response: Response, next: NextFunction) => {
  if (request[location][key]) {
    let value = request[location][key];
    if (typeof value === "string") {
      try {
        value = JSON.parse(request[location][key]);
      } catch (e) {
        return next(new ClientError(`Malformed JSON for '${location}.${key}'`));
      }
    }
    if (typeof value !== "object") {
      throw new ClientError(`Malformed json`);
    }
    logger.warning("Extracted %s, %s", key, value);
    response.locals[key] = value;
  }
  next();
};


export const extractGroupByNameOrId = (location: Location, nameKey: string, idKey: string | number, stopOnFailure = true) => {
  return extractModelNameOrId(models.Group, location, nameKey, idKey, stopOnFailure);
};

export const extractUserByNameOrId = (location: Location, nameKey: string, idKey: string | number, stopOnFailure = true) => {
  return extractModelNameOrId(models.User, location, nameKey, idKey, stopOnFailure);
};

export const extractModelNameOrId = <T>(modelType: ModelStaticCommon<T>, location: Location, nameKey: string, idKey: string | number, stopOnFailure) => async (request: Request, response: Response, next: NextFunction) => {
  const id = request[location][idKey];
  const name = request[location][nameKey];
  if (!id && !name) {
    if (!id) {
      return next(new Error(format("Could not find a %s with an id of '%s'", modelType.name, id)));
    }
    if (!name) {
      return next(new Error(format("Could not find a %s with an name of '%s'", modelType.name, name)));
    }
  }
  let model;
  const modelName = modelTypeName(modelType);
  if (id) {
    logger.info("Get id %s for %s", id, modelName);
    model = await modelType.findByPk(id);
  } else if (name) {
    logger.info("Get name %s for %s", name, modelName);
    if (!modelType.getFromName) {
      logger.info(`${modelName} does not support 'getFromName'`);
      return next(new Error(`${modelName} does not support 'getFromName'`));
    }
    model = await modelType.getFromName(name);
    logger.info("Got model %s", model);
  }
  if (model === null) {
    if (stopOnFailure) {
      if (id) {
        return next(new Error(format("Could not find a %s with an id of '%s'", modelType.name, id)));
      } else if (name) {
        return next(new Error(format("Could not find a %s with an name of '%s'", modelType.name, name)));
      }
    } else {
      return next();
    }
  }
  response.locals[modelName] = model;
  next();
};

