import { ClientError } from "./customErrors";
import models from "../models";
import {Request, Response, NextFunction} from "express";
import {Location} from "express-validator";

export const checkDeviceNameIsUniqueInGroup = (location: Location, key: string) => async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const deviceName = request[location][key];
  const group = response.locals.group;
  if (!group) {
    return next(new ClientError("No group specified"));
  }
  const nameIsFree = await models.Device.freeDevicename(
    request.body.devicename,
    response.locals.group.id
  );
  if (!nameIsFree) {
    return next(new ClientError(`Device name ${deviceName} in use`));
  }
  next();
};
