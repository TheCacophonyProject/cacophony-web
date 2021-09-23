import { ClientError } from "./customErrors";
import models from "../models";
import { Request, Response, NextFunction } from "express";
import {
  body,
  Location,
  oneOf,
  Result,
  ValidationChain,
} from "express-validator";
import { expectedTypeOf } from "./middleware";
import { Middleware } from "express-validator/src/base";
import exp from "constants";
import { extractValFromRequest } from "./extract-middleware";

export const checkDeviceNameIsUniqueInGroup =
  (device: ValidationChain) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const deviceName = extractValFromRequest(request, device);
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

export const idOf = (field: ValidationChain): ValidationChain =>
  field.isInt().toInt().withMessage(expectedTypeOf("integer"));

export const integerOf = idOf;

export const nameOf = (field: ValidationChain): ValidationChain =>
  field.isString().withMessage(expectedTypeOf("string"));

export const validNameOf = (field: ValidationChain): ValidationChain =>
  nameOf(field)
    .isLength({ min: 3 })
    .matches(/(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/)
    .withMessage(
      (val, { path }) =>
        `'${path}' must only contain letters, numbers, dash, underscore and space.  It must contain at least one letter`
    );

export const validPasswordOf = (field: ValidationChain): ValidationChain =>
  nameOf(field)
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long");

export const booleanOf = (field: ValidationChain): ValidationChain =>
  field.isBoolean().toBoolean().withMessage(expectedTypeOf("boolean"));

// Wrapping 'oneOf' with a useful error message.
export const anyOf = (
  ...fields: ValidationChain[] | ValidationChain[][]
): Middleware & { run: (req: Request) => Promise<Result> } => {
  if (Array.isArray(fields[0])) {
    fields = fields[0];
  }
  const fieldNames = (fields as ValidationChain[]).reduce((fields, rule) => {
    if (rule.builder) {
      // @ts-ignore - Accessing private field
      for (const field of rule.builder.fields) {
        if (!fields.includes(field)) {
          fields.push(field);
        }
      }
    }
    return fields;
  }, []);
  let message;
  if (fieldNames.length === 1) {
    message = `Missing required field '${fieldNames[0]}'`;
  } else if (fieldNames.length === 2) {
    message = `Either '${fieldNames[0]}' or '${fieldNames[1]}' is required`;
  } else {
    message = `Expected one of ${fieldNames.map((f) => `'${f}'`).join(", ")}`;
  }
  return oneOf(fields, message);
};

const intOrString = (val: number | string, { req, location, path }) => {
  const asInt = parseInt(val as string);
  if (isNaN(asInt)) {
    if (typeof val === "string") {
      return true;
    } else {
      throw new ClientError(expectedTypeOf("string", "integer")(val));
    }
  } else {
    req[location][path] = asInt;
    return true;
  }
};

export const nameOrIdOf = (
  field: ValidationChain
): Middleware & { run: (req: Request) => Promise<Result> } =>
  field.custom(intOrString);
