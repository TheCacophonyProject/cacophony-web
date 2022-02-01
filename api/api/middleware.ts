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
  body,
  CustomValidator,
  matchedData,
  oneOf,
  query,
  Result,
  ValidationChain,
  validationResult,
} from "express-validator";
import models, { ModelStaticCommon } from "../models";
import { format } from "util";
import log from "../logging";
import customErrors, { ClientError, ValidationError } from "./customErrors";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { IsIntOptions } from "express-validator/src/options";
import logger from "../logging";
import { DecodedJWTToken } from "./auth";
import levenshteinEditDistance from "levenshtein-edit-distance";

export const getModelByIdChain = <T>(
  modelType: ModelStaticCommon<T>,
  fieldName: string,
  checkFunc
) => {
  return checkFunc(fieldName).custom(async (val, { req }) => {
    logger.info("Get id %s for %s", val, modelTypeName(modelType));
    const model = await modelType.findByPk(val);
    if (model === null) {
      throw new Error(
        format("Could not find a %s with an id of %s.", modelType.name, val)
      );
    }
    req.body[modelTypeName(modelType)] = model;
    return true;
  });
};

export const getModelById = <T>(
  modelType: ModelStaticCommon<T>
): CustomValidator => {
  return async (id, { req }) => {
    logger.info("Get model by id %s for %s", id, modelTypeName(modelType));
    const item = await modelType.findByPk(id);
    logger.info("Returned %s", item);
    if (item === null) {
      throw new ClientError(
        `Could not find a ${modelType.name} with an id of ${id}`
      );
    }
    req.body[modelTypeName(modelType)] = item;
    return true;
  };
};

type ValidationMiddleware = (
  fields?: string | string[] | undefined,
  message?: any
) => ValidationChain;

export const getModelByName = function <T>(
  modelType: ModelStaticCommon<T>,
  fieldName: string,
  checkFunc: ValidationMiddleware
): ValidationChain {
  return checkFunc(fieldName).custom(async (val, { req }) => {
    const model: T = await modelType.getFromName(val);
    if (model === null) {
      await Promise.reject(format("Could not find %s of %s.", fieldName, val));
      //throw new Error(format("Could not find %s of %s.", fieldName, val));
    }
    req.body[modelTypeName(modelType)] = model;
    logger.info(
      "req.body.%s = %s",
      modelTypeName(modelType),
      JSON.stringify(req.body[modelTypeName(modelType)])
    );
    return true;
  });
};

export const getUserByEmail = function (
  checkFunc: ValidationMiddleware,
  fieldName: string = "email"
): ValidationChain {
  return checkFunc(fieldName)
    .isEmail()
    .custom(async (email: string, { req }) => {
      email = email.toLowerCase();
      const user = await models.User.getFromEmail(email);
      if (user === null) {
        throw new Error(`Could not find user with email: ${email}`);
      }
      req.body.user = user;
      return true;
    });
};

export function modelTypeName(modelType: ModelStaticCommon<any>): string {
  return modelType.options.name.singular.toLowerCase();
}

export function modelTypeNamePlural(modelType: ModelStaticCommon<any>): string {
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
    } catch (error) {
      return [];
    }
  }
  return [];
};

export const isInteger = function (
  fieldName: string,
  range: IsIntOptions
): ValidationChain {
  // add an actually useful error to this isInt check
  const error = `Parameter '${fieldName}' must be an integer between ${range.min} and ${range.max}`;
  return query("page-size", error).isInt(range);
};

export const toDate = function (fieldName: string): ValidationChain {
  return query(fieldName, DATE_ERROR)
    .customSanitizer((value) => {
      return getAsDate(value);
    })
    .isInt();
};

export const getAsDate = function (dateAsString: string): number {
  try {
    return Date.parse(dateAsString);
  } catch (error) {
    return NaN;
  }
};

const DATE_ERROR =
  "Must be a date or timestamp.   For example, '2017-11-13' or '2017-11-13T00:47:51.160Z'.";

export const isDateArray = function (
  fieldName: string,
  customError
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
                dateAsString
              )
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
  return getModelByIdChain(models.User, "userId", checkFunc);
}

export function getUserByName(
  checkFunc: ValidationMiddleware,
  fieldName: string = "username"
): ValidationChain {
  return getModelByName(models.User, fieldName, checkFunc);
}

export function getUserByNameOrId(
  checkFunc: ValidationMiddleware
): RequestHandler {
  return oneOf(
    [getUserByName(checkFunc), getUserById(checkFunc)],
    "User doesn't exist or was not specified"
  );
}

export function getGroupById(checkFunc: ValidationMiddleware): ValidationChain {
  return getModelByIdChain(models.Group, "groupId", checkFunc);
}

export function getGroupByName(
  checkFunc: ValidationMiddleware,
  fieldName: string = "group"
) {
  return getModelByName(models.Group, fieldName, checkFunc);
}

export function getGroupByNameOrId(
  checkFunc: ValidationMiddleware
): RequestHandler {
  return oneOf(
    [getGroupById(checkFunc), getGroupByName(checkFunc)],
    "Group doesn't exist or hasn't been specified."
  );
}

export function getGroupByNameOrIdDynamic(
  checkFunc: ValidationMiddleware,
  fieldName: string
): RequestHandler {
  return oneOf(
    [
      getModelByIdChain(models.Group, fieldName, checkFunc),
      getModelByName(models.Group, fieldName, checkFunc),
    ],
    "Group doesn't exist or hasn't been specified."
  );
}

export function getDeviceById(
  checkFunc: ValidationMiddleware
): ValidationChain {
  return getModelByIdChain(models.Device, "deviceId", checkFunc);
}

export function setGroupName(checkFunc: ValidationMiddleware): ValidationChain {
  return checkFunc("groupname").custom(async (value, { req }) => {
    req.body["groupname"] = value;
    return true;
  });
}

export function getDevice(
  checkFunc: ValidationMiddleware,
  paramName: string = "devicename"
) {
  return checkFunc(paramName).custom(async (deviceName, { req }) => {
    const password = req.body["password"];
    const groupName = req.body["groupname"];
    const deviceID = req.body["deviceID"];
    const model = await models.Device.findDevice(
      deviceID,
      deviceName,
      groupName,
      password
    );
    if (model == null) {
      throw new Error(
        format("Could not find device %s in group %s.", deviceName, groupName)
      );
    }
    req.body["device"] = model;
    return true;
  });
}

export const getDetailSnapshotById = (
  checkFunc: ValidationMiddleware,
  paramName: string
): ValidationChain =>
  getModelByIdChain(models.DetailSnapshot, paramName, checkFunc);

export const getFileById = (checkFunc: ValidationMiddleware): ValidationChain =>
  getModelByIdChain(models.File, "id", checkFunc);

export const getRecordingByIdChain = (
  checkFunc: ValidationMiddleware
): ValidationChain => getModelByIdChain(models.Recording, "id", checkFunc);

export const getRecordingById = (): CustomValidator =>
  getModelById(models.Recording);

export const isValidName = function (
  checkFunc: ValidationMiddleware,
  field: string
): ValidationChain {
  return checkFunc(
    field,
    `${field} must only contain letters, numbers, dash, underscore and space.  It must contain at least one letter`
  )
    .isLength({ min: 3 })
    .matches(/(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/);
};

export const isValidName2 = (val) =>
  val
    .isLength({ min: 3 })
    .matches(/(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/)
    .withMessage(
      "password must only contain letters, numbers, dash, underscore and space.  It must contain at least one letter"
    );

export const checkNewPassword = function (field: string): ValidationChain {
  return body(field, "Password must be at least 8 characters long").isLength({
    min: 8,
  });
};

export const checkNewPassword2 = (val) =>
  val
    .isLength({
      min: 8,
    })
    .withMessage("Password must be at least 8 characters long");

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
  checkFunc: ValidationMiddleware
): ValidationChain {
  return checkFunc(field).custom(parseJSONInternal);
};

export const parseJSONInternal = (value, { req, location, path }) => {
  if (typeof req[location][path] === "string") {
    let result = value;
    while (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch (e) {
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
  checkFunc: ValidationMiddleware
): ValidationChain {
  return checkFunc(field).custom((value, { req, location, path }) => {
    if (Array.isArray(value)) {
      return true;
    }
    let arr;
    try {
      arr = JSON.parse(value);
    } catch (e) {
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

export const parseBool = function (value: any): boolean {
  if (!value) {
    return false;
  }
  return value.toString().toLowerCase() == "true";
};

export const requestWrapper = (fn) => (request, response: Response, next) => {
  let logMessage = format("%s %s", request.method, request.url);
  if (request.user) {
    logMessage = format(
      "%s (user: %s)",
      logMessage,
      request.user.get("username")
    );
  } else if (request.device) {
    logMessage = format(
      "%s (device: %s)",
      logMessage,
      request.device.get("devicename")
    );
  }
  log.info(logMessage);
  const validationErrors = validationResult(request);
  if (!validationErrors.isEmpty()) {
    log.warning(
      "%s",
      validationErrors
        .array()
        .map((item) => JSON.stringify(item))
        .join(", ")
    );
    throw new customErrors.ValidationError(validationErrors);
  } else {
    Promise.resolve(fn(request, response, next)).catch(next);
  }
};

export const asArray = (options?: { min?: number; max?: number }) => (val) => {
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch (e) {
      throw new ClientError("Expected array of strings");
    }
  }
  if (options) {
    if (options.min && val.length < options.min) {
      throw new ClientError(`Expected at least ${options.min} array elements`);
    }
    if (options.max && val.length > options.max) {
      throw new ClientError(`Expected at most ${options.max} array elements`);
    }
  }
  if (Array.isArray(val)) {
    return true;
  } else {
    throw new ClientError("Expected array");
  }
};

export const expectedTypeOf =
  (...type: string[]) =>
  (val) => {
    let typeOf = typeof val as string;
    if (typeOf === "object" && Array.isArray(val)) {
      typeOf = "array";
    }
    if (type.length > 1) {
      return `expected one of ${(type as string[])
        .map((t) => `'${t}'`)
        .join(", ")}, got ${typeOf}`;
    }
    return `expected ${type[0]}, got ${typeOf} : (${val})`;
  };

export const isIntArray = (val) => {
  if (Array.isArray(val)) {
    return !(val as string[]).some(
      (v) => isNaN(parseInt(v)) || parseInt(v).toString() !== String(v)
    );
  }
  return !(isNaN(parseInt(val)) || parseInt(val).toString() !== String(val));
};

const checkForUnknownFields = (
  validators,
  req: Request
): { unknownFields: string[]; suggestions: Record<string, string> } => {
  const allowedFieldsKnown = validators.reduce((fields, rule) => {
    if (rule.fieldNames) {
      fields.push(...rule.fieldNames);
    } else if (rule.builder) {
      for (const field of rule.builder.fields) {
        fields.push(field);
      }
    }
    return fields;
  }, []);
  const matchedAllowedFields = Object.keys(
    matchedData(req, { onlyValidData: false, includeOptionals: true })
  );
  const allowed = new Set();
  for (const field of allowedFieldsKnown) {
    allowed.add(field);
  }
  for (const field of matchedAllowedFields) {
    allowed.add(field);
  }
  const allowedFields: string[] = Array.from(
    allowed.keys()
  ) as unknown as string[];

  // Check for all common request inputs
  const requestInput = { ...req.query, ...req.params, ...req.body };
  const requestFields = Object.keys(requestInput);
  const unusedAllowedFields = allowedFields.filter(
    (field) => !requestFields.includes(field)
  );
  const unknownFields = requestFields.filter(
    (item) => !allowedFields.includes(item)
  );
  const suggestions = {};
  if (unusedAllowedFields.length && unknownFields.length) {
    // We have unused allowed fields, see if any of our unknown fields is potentially a typo
    // of an allowed field.
    for (const unknownField of unknownFields) {
      let bestDistance = 3;
      for (const unusedField of unusedAllowedFields) {
        const distance = levenshteinEditDistance(
          unknownField,
          unusedField,
          true
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          suggestions[unknownField] = unusedField;
        }
      }
    }
  }
  return { unknownFields, suggestions };
};

// sequential processing, stops running validations chain if the previous one have failed.
export const validateFields = (
  validations: (
    | (((req: Request, res: any, next: (err?: any) => void) => void) & {
        run: (req: Request) => Promise<Result>;
      })
    | ValidationChain
  )[],
  sequentially: boolean = false
) => {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (sequentially) {
      for (const validation of validations) {
        const result = await validation.run(request);
        if (!result.isEmpty()) {
          break;
        }
      }
    } else {
      // FIXME - Properly handle nested anyOf groupings.
      const validationPromises = [];
      for (const validation of validations) {
        validationPromises.push(validation.run(request));
      }
      await Promise.all(validationPromises);
    }

    const { unknownFields, suggestions } = checkForUnknownFields(
      validations,
      request
    );
    if (unknownFields.length) {
      return next(
        new ClientError(
          `Unknown fields found: ${unknownFields
            .map((item) => {
              let field = `'${item}'`;
              if (suggestions[item]) {
                field += ` - did you mean '${suggestions[item]}'?`;
              }
              return field;
            })
            .join(", ")}`,
          422
        )
      );
    }

    {
      const logMessage = format("%s %s", request.method, request.url);
      const requester =
        response.locals.token &&
        (response.locals.token as DecodedJWTToken)._type;
      const requestId =
        (response.locals.user && response.locals.user.username) ||
        (response.locals.device && response.locals.device.devicename) ||
        (requester && (response.locals.token as DecodedJWTToken).id) ||
        "unknown";

      // TODO: At this point *if* we have errors, we may want to lookup the username or devicename?

      log.info(
        "%s (%s: %s%s)",
        logMessage,
        requester || "unauthenticated",
        requestId,
        response.locals.viewAsSuperUser ? "::SUPER_USER" : ""
      );
      const validationErrors = validationResult(request);
      if (!validationErrors.isEmpty()) {
        return next(new ValidationError(validationErrors));
      } else {
        return next();
      }
    }
  };
};

export default {
  getUserById,
  getUserByName,
  getUserByNameOrId,
  getGroupById,
  getGroupByName,
  getGroupByNameOrId,
  getGroupByNameOrIdDynamic,
  getDeviceById,
  getDevice,
  getDetailSnapshotById,
  getFileById,
  getRecordingById: getRecordingByIdChain,
  isValidName,
  isValidName2,
  checkNewPassword,
  checkNewPassword2,
  parseJSON,
  parseArray,
  parseBool,
  requestWrapper,
  isDateArray,
  getUserByEmail,
  setGroupName,
  viewMode,
  validateSequentially: validateFields,
  typeError: expectedTypeOf,
};
