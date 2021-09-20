import { NextFunction, Request, Response } from "express";
import { DecodedJWTToken, getVerifiedJWT } from "./auth";
import models, { ModelStaticCommon } from "../models";
import logger from "../logging";
import { modelTypeName } from "./middleware";
import { format } from "util";
import { Location } from "express-validator";
import { ClientError } from "./customErrors";
import { User } from "models/User";
import DeviceUsers from "../models/DeviceUsers";
import GroupUsers from "../models/GroupUsers";
import { Op } from "sequelize";

export const extractValidJWT = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    response.locals.token = getVerifiedJWT(request) as DecodedJWTToken;
    return next();
  } catch (e) {
    return next(e);
  }
};

const extractModel = <T>(modelType: ModelStaticCommon<T>, location: Location, key: string, stopOnFailure = true, forRequestUser = false) => async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const id = request[location][key];
  if (!id) {
    if (stopOnFailure) {
      return next(new ClientError(format("Could not find a %s with an id of '%s'", modelType.name, id), 400));
    } else {
      return next();
    }
  }
  logger.info("Get id %s for %s", id, modelTypeName(modelType));

  // FIXME/TODO: getModelForUser: first check if the user is a super-user, and is viewing as admin.
  // Then to a query through the resource type to the user, and throw an Authorization error if not authorised
  let options;
  let device;
  if (response.locals.requestUser) {
    const user = response.locals.requestUser;
    //const device = await user.getDevices({where: {id: id}});
    try {
      device = await modelType.findOne({
        where: {
          [Op.and]: [
            {id},
            [Op.or]: [{
            include: [
              // Make this a left outer join?
              {
                model: models.User,
                attributes: [],
                where: { id: user.id }
              }
            ]
        } as any,
            {
              include: [
                {
                  model: models.Group,
                  attributes: [],
                  include: [
                    {
                      model: models.User,
                      attributes: [],
                      where: { id: user.id }
                    }
                  ]
                }
              ]
            }
          ]
        }],
        // include: [
        //   {
        //     model: models.Group,
        //     attributes: [],
        //     include: [
        //       {
        //         model: models.User,
        //         attributes: [],
        //         where: { id: user.id }
        //       }
        //     ]
        //   },
        //   // Make this a left outer join?
        //   {
        //     model: models.User,
        //     attributes: [],
        //     where: { id: user.id }
        //   }
        // ]

        // where: {
        //   [Op.or]: [
        //     {
        //       include: [{
        //         model: models.User,
        //         where: {
        //           "id": user.id,
        //         }
        //       }]
        //     },
        //     {
        //       include: [{
        //         model: models.GroupUsers,
        //         where: { "UserId": user.id, "DeviceId": id}
        //       }]
        //     }
        //   ]
        // },
        // include: [
        //   {
        //     model: models.Group
        //   },
        //   {
        //     model: models.User,
        //     where: {
        //       "id": user.id,
        //     },
        //     include: [{
        //       model: models.GroupUsers,
        //       where: {
        //         "UserId": user.id,
        //         "GroupId":
        //       }
        //     }]
        //   }
        // ]
      });
    } catch (e) {
      logger.warning("%s", e);
    }
    logger.notice("Got user device %s", device);
  }
  //let options;
  const model = await modelType.findByPk(id, options);
  // if (response.locals.requestUser && model.hasUsers([response.locals.requestUser])) {
  //   logger.notice("model %s has user %s", model, response.locals.requestUser);
  // }

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

export const extractRecording = (location: Location, key: string, stopOnFailure = true) => extractModel(models.Recording, location, key, stopOnFailure);
export const extractDevice = (location: Location, key: string, stopOnFailure = true) => extractModel(models.Device, location, key, stopOnFailure);
export const extractOptionalDevice = (location: Location, key: string) => extractDevice(location, key, false);
export const extractUser = (location: Location, key: string, stopOnFailure = true) => extractModel(models.User, location, key, stopOnFailure);
export const extractGroupByName = (location: Location, key: string, stopOnFailure = true) => extractModelByName(models.Group, location, key, stopOnFailure);

export const extractDeviceByName = (location: Location, key: string, stopOnFailure = true) => async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const name = request[location][key];
  if (!name) {
    if (stopOnFailure) {
      return next(new ClientError(format("Could not find a %s with a name of '%s'", "device", name), 400));
    } else {
      return next();
    }
  }
  if (!response.locals.group) {
    return next(new ClientError(`No group specified for device with name ${name}`, 400));
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
      return next(new ClientError(format("Could not find a device with a name of '%s'", name), 400));
    } else {
      return next();
    }
  }
  response.locals.device = device;
  next();
};


export const extractEventDetailSnapshot = (location: Location, key: string, stopOnFailure = true) => extractModel(models.DetailSnapshot, location, key, stopOnFailure);
export const extractOptionalEventDetailSnapshot = (location: Location, key: string) => extractModel(models.DetailSnapshot, location, key, false);
export const parseJSONField = (location: Location, key: string) => (request: Request, response: Response, next: NextFunction) => {
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
    response.locals[key] = value;
  }
  next();
};

export const extractViewMode = (request: Request, response: Response, next: NextFunction) => {
  // This only makes sense if the user is a super-user, which we can check
  const globalPermissions = (response.locals.requestUser as User).globalPermission;
  const isSuperUser = globalPermissions !== "off";
  response.locals.viewAsSuperUser = isSuperUser && request.query["view-mode"] !== 'user';
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
      return next(new ClientError(`Could not find a ${modelType.name} with an id of '${name}'`));
    }
    if (!name) {
      return next(new ClientError(`Could not find a ${modelType.name} with a name of '${name}'`));
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
        return next(new ClientError(`Could not find a ${modelType.name} with an id of '${name}'`));
      } else if (name) {
        return next(new ClientError(`Could not find a ${modelType.name} with a name of '${name}'`));
      }
    } else {
      return next();
    }
  }
  response.locals[modelName] = model;
  next();
};

