/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import {
  CustomValidator,
  ValidationChain,
  ContextRunner,
  Meta,
} from "express-validator";
import { body, query } from "express-validator";
import { ModelStaticCommon } from "@/models/index.js";
import { format } from "util";
import log from "../logging.js";
import { ClientError, ValidationError } from "./customErrors.js";
import type { NextFunction, Request, Response } from "express";
import levenshteinEditDistance from "levenshtein-edit-distance";
import { User } from "@/models/User.js";
import { Recording } from "@models/Recording.js";
import { File } from "@/models/File.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import { Model } from "sequelize";
import {
  ErrorMessage,
  FieldInstance,
  FieldMessageFactory,
  FieldValidationError,
  UnknownFieldInstance,
  ValidationError as ExpressValidationError,
} from "express-validator/lib/base.js";
import { extractUnknownFields } from "@api/validation-middleware.js";
import { Context } from "express-validator/lib/context.js";
import { ResultWithContextImpl } from "express-validator/lib/chain/index.js";
import { Device } from "@models/Device.js";

export const getModelByIdChain = (
  modelType: typeof ModelStaticCommon<Model>,
  fieldName: string,
  checkFunc: ValidationMiddleware,
) => {
  return checkFunc(fieldName).custom(async (val, { req }) => {
    log.info("Get id %s for %s", val, modelTypeName(modelType));
    const model = await modelType.findByPk(val);
    if (model === null) {
      throw new Error(
        format("Could not find a %s with an id of %s.", modelType.name, val),
      );
    }
    req.body[modelTypeName(modelType)] = model;
    return true;
  });
};

export const getModelById = (
  modelType: typeof ModelStaticCommon<Model>,
): CustomValidator => {
  return async (id, { req }) => {
    log.info("Get model by id %s for %s", id, modelTypeName(modelType));
    const item = await modelType.findByPk(id);
    log.info("Returned %s", item);
    if (item === null) {
      throw new ClientError(
        `Could not find a ${modelType.name} with an id of ${id}`,
      );
    }
    req.body[modelTypeName(modelType)] = item;
    return true;
  };
};

type ValidationMiddleware = (
  fields?: string | string[] | undefined,
  message?: string,
) => ValidationChain;

export const getUserByEmail = function (
  checkFunc: ValidationMiddleware,
  fieldName = "email",
): ValidationChain {
  return checkFunc(fieldName)
    .isEmail()
    .custom(async (email: string, { req }) => {
      email = email.toLowerCase();
      const user = await User.getFromEmail(email);
      if (user === null) {
        throw new Error(`Could not find user with email: ${email}`);
      }
      req.body.user = user;
      return true;
    });
};

export function modelTypeName<T extends Model>(
  modelType: typeof ModelStaticCommon<T>,
): string {
  return modelType.options.name.singular.toLowerCase();
}

export function modelTypeNamePlural(
  modelType: typeof ModelStaticCommon<Model>,
): string {
  return modelType.options.name.plural.toLowerCase();
}

const ID_OR_ID_ARRAY_REGEXP = /^\[[0-9,]+\]$|^[0-9]+$/;
const ID_OR_ID_ARRAY_MESSAGE =
  "Must be an id, or an array of ids.  For example, '32' or '[32, 33, 34]'";

export const toIdArray = function (fieldName: string): ValidationChain {
  return query(fieldName, ID_OR_ID_ARRAY_MESSAGE)
    .matches(ID_OR_ID_ARRAY_REGEXP)
    .customSanitizer((value) => convertToIdArray(value));
};

export const convertToIdArray = function (idsAsString: string): number[] {
  if (idsAsString) {
    try {
      const val = JSON.parse(idsAsString);
      if (Array.isArray(val)) {
        return val;
      } else {
        return [val];
      }
    } catch (_error) {
      return [];
    }
  }
  return [];
};

export const isDateArray = function (
  fieldName: string,
  customError: FieldMessageFactory | ErrorMessage,
): ValidationChain {
  return body(fieldName, customError)
    .exists()
    .custom((value) => {
      if (Array.isArray(value)) {
        value.forEach((dateAsString) => {
          if (isNaN(Date.parse(dateAsString))) {
            throw new Error(
              format(
                "Cannot parse '%s' into a date.  Try formatting the date like '2017-11-13T00:47:51.160Z'.",
                dateAsString,
              ),
            );
          }
        });
        return true;
      } else {
        throw new Error("Value should be an array.");
      }
    });
};

export function getUserById(checkFunc: ValidationMiddleware): ValidationChain {
  return getModelByIdChain(User, "userId", checkFunc);
}

export const getDetailSnapshotById = (
  checkFunc: ValidationMiddleware,
  paramName: string,
): ValidationChain => getModelByIdChain(DetailSnapshot, paramName, checkFunc);

export const getFileById = (checkFunc: ValidationMiddleware): ValidationChain =>
  getModelByIdChain(File, "id", checkFunc);

export const getRecordingByIdChain = (
  checkFunc: ValidationMiddleware,
): ValidationChain => getModelByIdChain(Recording, "id", checkFunc);

export const isValidName = function (
  checkFunc: ValidationMiddleware,
  field: string,
): ValidationChain {
  return checkFunc(
    field,
    `${field} must only contain letters, numbers, dash, underscore and space.  It must contain at least one letter`,
  )
    .isLength({ min: 3 })
    .matches(/(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/);
};

export const checkNewPassword = function (field: string): ValidationChain {
  return body(field, "Password must be at least 8 characters long").isLength({
    min: 8,
  });
};

export const viewMode = function (): ValidationChain {
  // All api listing commands will automatically return all results if the user is a super-admin
  // There is now an optional "view-mode" query param to these APIs, which, if set to "user",
  // will restrict results to items only directly viewable by the super-admin user.
  // The default behaviour remains unchanged, and this will do nothing for non-admin users.
  return query("view-mode").custom((value, { req }) => {
    req.body.viewAsSuperAdmin = value !== "user";
    return true;
  });
};

/**
 * Extract and decode a JSON object from the request object.
 * If the entry is a string, it will be converted to a proper object,
 * if it is already an object, it will stay the same. Either is acceptable,
 * however clients should migrate to sending objects directly if it's in the body.
 * @param field The field in the JSON object to get
 * @param checkFunc The express-validator function, typically `body` or `query`
 */
export const parseJSON = function (
  field: string,
  checkFunc: ValidationMiddleware,
): ValidationChain {
  return checkFunc(field).custom(parseJSONInternal);
};

export const parseJSONInternal: CustomValidator = (
  value,
  { req, location, path },
) => {
  if (typeof req[location][path] === "string") {
    let result = value;
    while (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch (_e) {
        throw new Error(format("Could not parse JSON field %s.", path));
      }
    }
    if (typeof result !== "object") {
      throw new Error(format("JSON field %s is not an object", path));
    }
    req[location][path] = result;
  }
  return req[location][path] !== undefined;
};

/**
 * Extract and decode an array from the request object.
 * If the entry is a string, it will be converted to a proper array,
 * if it is already an array, it will stay the same. Either is acceptable,
 * however clients should migrate to sending arrays directly if it's in the body.
 * NOTE: We need to keep parsing the JSON string until it is an object;
 *  a double-stringified object parsed once is still a string!
 * @param field The field in the JSON object to get
 * @param checkFunc The express-validator function, typically `body` or `query`
 */
export const parseArray = function (
  field: string,
  checkFunc: ValidationMiddleware,
): ValidationChain {
  return checkFunc(field).custom((value, { req, location, path }) => {
    if (Array.isArray(value)) {
      return true;
    }
    let arr;
    try {
      arr = JSON.parse(value);
    } catch (_e) {
      throw new Error(format("Could not parse JSON field %s.", path));
    }
    if (Array.isArray(arr)) {
      req[location][path] = arr;
      return true;
    } else if (arr === null) {
      req[location][path] = [];
      return true;
    } else {
      throw new Error(format("%s was not an array", path));
    }
  });
};

export const parseBool = function (value: unknown): boolean {
  if (!value) {
    return false;
  }
  if (typeof value === "string" || typeof value === "object") {
    return value.toString().toLowerCase() === "true";
  }
  return false;
};

export const expectedTypeOf =
  (...type: string[]) =>
  (val: unknown, meta: Meta) => {
    let typeOf = typeof val as string;
    if (typeOf === "object" && Array.isArray(val)) {
      typeOf = "array";
    }
    if (type.length > 1) {
      return `${meta.location}.${meta.path}: Expected one of ${(
        type as string[]
      )
        .map((t) => `'${t}'`)
        .join(", ")}, got ${typeOf}`;
    }
    if (typeOf === "undefined" && val === undefined) {
      return `${meta.location}.${meta.path}: Expected ${type[0]}, got ${typeOf}`;
    }
    return `${meta.location}.${meta.path}: Expected ${type[0]}, got ${typeOf} : (${val})`;
  };

export const isIntArray = (val: unknown) => {
  if (Array.isArray(val)) {
    return !(val as string[]).some(
      (v) => isNaN(parseInt(v)) || parseInt(v).toString() !== String(v),
    );
  }
  return !(
    isNaN(parseInt(val as string)) ||
    parseInt(val as string).toString() !== String(val)
  );
};

const getSuggestionsForUnknownFields = (
  unusedKnownFields: FieldInstance[],
  unknownFields: UnknownFieldInstance[],
) => {
  const suggestions: Record<string, FieldInstance> = {};
  if (unusedKnownFields.length && unknownFields.length) {
    // We have unused allowed fields, see if any of our unknown fields is potentially a typo
    // of an allowed field.
    for (const unknownField of unknownFields) {
      let bestDistance = 3;
      for (const unusedField of unusedKnownFields) {
        const distance = levenshteinEditDistance(
          unknownField.path,
          unusedField.path,
          true,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          suggestions[unknownField.path] = unusedField;
        }
      }
    }
  }
  return suggestions;
};

export const validateFields = (validations: ContextRunner[]) => {
  return async (request: Request, response: Response, next: NextFunction) => {
    const validationPromises = [];
    for (const validation of validations) {
      validationPromises.push(validation.run(request));
    }
    const validationResults = await Promise.all(validationPromises);
    const knownFields = [];
    const context = new Context([], [], [], false, false);
    const errors: ExpressValidationError[] = [];
    for (const { result } of validationResults.map((result, index) => ({
      field: validations[index],
      result,
    }))) {
      knownFields.push(...result.context.getData());
      errors.push(...result.array());
    }
    const unknownFields = extractUnknownFields(request, knownFields);
    if (unknownFields.length !== 0) {
      const suggestions = getSuggestionsForUnknownFields(
        knownFields.filter((field) => field.value === undefined),
        unknownFields,
      );
      context.addError({
        type: "unknown_fields",
        req: request,
        message: `Unknown fields found: ${unknownFields
          .map((item) => {
            let field = `'${item.location}.${item.path}'`;
            if (suggestions[item.path]) {
              field += ` - did you mean '${suggestions[item.path].location}.${suggestions[item.path].path}'?`;
            }
            return field;
          })
          .join(", ")}`,
        fields: unknownFields,
      });
    }
    if (errors.length) {
      // NOTE: We want to take all the sub-resultWithContext fields and merge them into a single context.
      for (const error of errors) {
        switch (error.type) {
          case "field":
            context.addError({
              type: "field",
              message: error.msg,
              value: error.value,
              meta: {
                req: request,
                path: error.path,
                location: error.location,
                pathValues: [],
              },
            });
            break;
          case "alternative":
            context.addError({
              type: "alternative",
              message: error.msg,
              req: request,
              nestedErrors: error.nestedErrors as FieldValidationError[],
            });
            break;
          case "alternative_grouped":
            context.addError({
              type: "alternative_grouped",
              message: error.msg,
              req: request,
              nestedErrors: error.nestedErrors as FieldValidationError[][],
            });
            break;
          case "unknown_fields":
            // Already handled
            break;
        }
      }
    }
    const hasValidationErrors = context.errors.length !== 0;
    if (hasValidationErrors) {
      // Pull out full requester for logging at the end of the request.
      response.locals.hasValidationErrors = true;
      if (response.locals.user && !response.locals.user.userName) {
        const user = await User.findByPk(response.locals.user.id);
        if (user) {
          response.locals.user = user;
        }
      } else if (response.locals.device && !response.locals.device.deviceName) {
        const device = await Device.findByPk(response.locals.device.id);
        if (device) {
          response.locals.device = device;
        }
      }
    }

    if (hasValidationErrors) {
      return next(new ValidationError(new ResultWithContextImpl(context)));
    }
    return next();
  };
};

export default {
  getDetailSnapshotById,
  getFileById,
  getRecordingById: getRecordingByIdChain,
  isValidName,
  checkNewPassword,
  parseJSON,
  parseArray,
  parseBool,
  isDateArray,
  getUserByEmail,
  viewMode,
  validateSequentially: validateFields,
  typeError: expectedTypeOf,
};
