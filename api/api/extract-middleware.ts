import { NextFunction, Request, Response } from "express";
import { DecodedJWTToken, getVerifiedJWT } from "./auth";
import models, { ModelStaticCommon } from "../models";
import logger from "../logging";
import { modelTypeName } from "./middleware";
import { format } from "util";
import { Location } from "express-validator";

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
      return next(new Error(format("Could not find a %s with an id of '%s'", modelType.name, id)));
    } else {
      return next();
    }
  }
  logger.info("Get id %s for %s", id, modelTypeName(modelType));
  const model = await modelType.findByPk(id);
  if (model === null) {
    if (stopOnFailure) {
      return next(new Error(format("Could not find a %s with an id of '%s'", modelType.name, id)));
    } else {
      return next();
    }
  }
  response.locals[modelTypeName(modelType)] = model;
  next();
};

const extractModelByName = <T>(modelType: ModelStaticCommon<T>, location: Location, key: string, stopOnFailure = true) => async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const id = request[location][key];
  if (!id) {
    if (stopOnFailure) {
      return next(new Error(format("Could not find a %s with a name of '%s'", modelType.name, id)));
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
      return next(new Error(format("Could not find a %s with a name of '%s'", modelType.name, id)));
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

export const extractGroupByNameOrId = (location: Location, nameKey: string, idKey: string | number) => {
  return extractModelNameOrId(models.Group, location, nameKey, idKey);
};

export const extractUserByNameOrId = (location: Location, nameKey: string, idKey: string | number) => {
  return extractModelNameOrId(models.User, location, nameKey, idKey);
};

export const extractModelNameOrId = <T>(model: ModelStaticCommon<T>, location: Location, nameKey: string, idKey: string | number) => async (request: Request, response: Response, next: NextFunction) => {
  // One of these next functions should always be called.
  await extractModel(model, location, idKey as string, false)(request, response, next);
  await extractModelByName(model, location, nameKey)(request, response, next);
};

