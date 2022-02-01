import { ClientError } from "./customErrors";
import models from "../models";
import { Request, Response, NextFunction } from "express";
import { oneOf, Result, ValidationChain } from "express-validator";
import { expectedTypeOf } from "./middleware";
import { Middleware } from "express-validator/src/base";
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
  field.exists().isInt().toInt().withMessage(expectedTypeOf("integer"));

export const deprecatedField = (field: ValidationChain): ValidationChain => {
  (field.builder as any).deprecated = true;
  return field;
};

export const integerOfWithDefault = (
  field: ValidationChain,
  defaultVal: number
): ValidationChain => integerOf(field, defaultVal);

export const integerOf = (
  field: ValidationChain,
  defaultVal?: number
): ValidationChain => {
  if (defaultVal) {
    return field
      .default(defaultVal)
      .isInt()
      .toInt()
      .withMessage(expectedTypeOf("integer"));
  }
  return field.exists().isInt().toInt().withMessage(expectedTypeOf("integer"));
};

export const nameOf = (field: ValidationChain): ValidationChain =>
  field.isString().withMessage(expectedTypeOf("string"));

export const stringOf = nameOf;

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
  field.toBoolean().isBoolean().withMessage(expectedTypeOf("boolean"));

type AnyOf = Middleware & { run: (req: Request) => Promise<Result> };
// Wrapping 'oneOf' with a useful error message.
export const anyOf = (
  ...fields:
    | (ValidationChain | AnyOf | AnyOf[])[]
    | (ValidationChain | AnyOf | AnyOf[])[][]
): AnyOf => {
  if (fields.length === 1 && Array.isArray(fields[0])) {
    fields = fields[0];
  }

  // Extracting all the field names from various combinations of nested anyOf calls.
  const fieldNames = [];
  for (const field of fields) {
    if (Array.isArray(field)) {
      for (const subField of field) {
        // Check to see if this is a ValidationChain or another anyOf
        if ((subField as any).isOneOf) {
          // process children
          for (const fieldName of (subField as any).fieldNames) {
            if (!fieldNames.includes(fieldName)) {
              fieldNames.push(fieldName);
            }
          }
        } else {
          // Get name from field.
          if ((subField as ValidationChain).builder) {
            // @ts-ignore - Accessing private field
            const subFields = (subField as ValidationChain).builder.fields;
            for (const fieldName of subFields) {
              if (!fieldNames.includes(fieldName)) {
                fieldNames.push(fieldName);
              }
            }
          }
        }
      }
    } else {
      if ((field as ValidationChain).builder) {
        // @ts-ignore - Accessing private field
        const fields = (field as ValidationChain).builder.fields;
        for (const fieldName of fields) {
          if (!fieldNames.includes(fieldName)) {
            fieldNames.push(fieldName);
          }
        }
      } else if ((field as any).isOneOf) {
        for (const fieldName of (field as any).fieldNames) {
          if (!fieldNames.includes(fieldName)) {
            fieldNames.push(fieldName);
          }
        }
      }
    }
  }

  let message;
  if (fieldNames.length === 1) {
    message = `Missing required field '${fieldNames[0]}'`;
  } else if (fieldNames.length === 2) {
    message = `Either '${fieldNames[0]}' or '${fieldNames[1]}' is required`;
  } else {
    message = `Expected one of ${fieldNames.map((f) => `'${f}'`).join(", ")}`;
  }
  const oneOfChain = oneOf(fields as ValidationChain[], message);
  // Make the fieldNames available so that they can be added to the list of known allowed field names
  Object.assign(oneOfChain, { fieldNames, isOneOf: true });
  return oneOfChain;
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
