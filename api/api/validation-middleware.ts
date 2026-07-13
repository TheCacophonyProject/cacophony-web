import { ClientError } from "./customErrors.js";
import type { Response, NextFunction, Request } from "express";
import {
  AlternativeValidationError,
  ContextRunner,
  CustomValidator,
  ValidationChain,
} from "express-validator";
import {
  FieldInstance,
  FieldValidationError,
  Request as ExpressValidatorRequest,
  UnknownFieldInstance,
} from "express-validator/lib/base.js";
import { expectedTypeOf } from "./middleware.js";
import { extractValFromRequest } from "./extract-middleware.js";
import { urlNormaliseName } from "@/emails/htmlEmailUtils.js";
import { Device } from "@models/Device.js";
import type { ValidationError } from "express-validator/lib/base.d.ts";
import {
  ResultWithContext,
  ResultWithContextImpl,
} from "express-validator/lib/chain/index.js";
import { Context, Optional } from "express-validator/lib/context.js";

export const checkDeviceNameIsUniqueInGroup =
  (device: ValidationChain) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const deviceName = extractValFromRequest(request, device);
    const group = response.locals.group;
    if (!group) {
      return next(new ClientError("No group specified"));
    }
    let nameIsFree = await Device.freeDeviceName(
      deviceName,
      response.locals.group.id,
    );
    if (nameIsFree) {
      // Check the url normalised version
      nameIsFree = await Device.freeDeviceName(
        urlNormaliseName(deviceName),
        response.locals.group.id,
      );
    }

    if (nameIsFree) {
      // Check that the device name is not a reserved api path fragment:
      if (
        [
          "create-proxy-device",
          "fix-location",
          "users",
          "assign-schedule",
          "remove-schedule",
          "cacophony-index",
          "reregister",
          "heartbeat",
          "history",
          "locations",
          "location",
          "in-group",
          "reference-image",
          "location-history",
          "unique-track-tags",
          "tracks-with-tag",
        ].includes(deviceName)
      ) {
        return next(new ClientError(`Device name ${deviceName} reserved`));
      }
    }

    if (!nameIsFree) {
      return next(new ClientError(`Device name ${deviceName} in use`));
    }
    next();
  };

export const deprecatedField = (field: ValidationChain): ValidationChain => {
  // FIXME: Add logging whenever a deprecated field is validated with a value.
  // NOTE: avoid typescript error when adding fields to this object
  (field.builder as unknown as Record<string, boolean>)["deprecated"] = true;
  return field;
};

export const integerOfWithDefault = (
  field: ValidationChain,
  defaultVal: number,
): ValidationChain => integerOf(field, defaultVal);

export const integerOf = (
  field: ValidationChain,
  defaultVal?: number,
): ValidationChain => {
  if (defaultVal) {
    return field
      .default(defaultVal)
      .isInt()
      .bail()
      .customSanitizer((value) => {
        if (value === undefined) {
          return value;
        }
        return Number(value);
      })
      .withMessage(expectedTypeOf("integer"));
  }
  return field
    .isInt()
    .bail()
    .customSanitizer((value) => {
      if (value === undefined) {
        return value;
      }
      return Number(value);
    })
    .withMessage(expectedTypeOf("integer"));
};

export const idOf = (field: ValidationChain): ValidationChain =>
  integerOf(field);

export const optionalDateOf = (field: ValidationChain): ValidationChain =>
  field
    .default(new Date(0).toISOString())
    .isISO8601()
    .customSanitizer((value) => {
      const date = new Date(value);
      if (date.getFullYear() < 2010) {
        // This was left as optional
        return new Date();
      }
      return date;
    });

export const emailOf = (field: ValidationChain): ValidationChain =>
  field.isEmail().withMessage((val, meta) => {
    return `${meta.location}.${meta.path}: Expected email address, got '${val}'`;
  });

export const nameOf = (field: ValidationChain): ValidationChain =>
  field.isString().withMessage(expectedTypeOf("string"));

export const stringOf = nameOf;

// TODO String normalisation for unicode names?
export const validNameOf = (field: ValidationChain): ValidationChain =>
  nameOf(field)
    .isLength({ min: 3 })
    .withMessage(
      (val, meta) =>
        `${meta.location}.${meta.path}: Expected string of minimum length 3, got length of ${(val && val.length) || 0}.`,
    )
    .matches(
      /(?=.*[A-Za-zÀ-ÖØ-Ýā-ōĀ-Ō])^[A-Za-zÀ-ÖØ-Ýā-ōĀ-Ō0-9]+([_ \-A-Za-zÀ-ÖØ-Ýā-ōĀ-Ō0-9])*$/,
    )
    .withMessage(
      (_val, meta) =>
        `${meta.location}.${meta.path}: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.`,
    );

export const validPasswordOf = (field: ValidationChain): ValidationChain =>
  nameOf(field)
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long");

export const booleanOf = (
  field: ValidationChain,
  defaultVal?: boolean,
): ValidationChain => {
  if (defaultVal !== undefined) {
    return field
      .default(defaultVal)
      .toBoolean()
      .isBoolean()
      .withMessage(expectedTypeOf("boolean"));
  }
  return field.toBoolean().isBoolean().withMessage(expectedTypeOf("boolean"));
};

const pathLocation = ({ location, path }: { path: string; location: string }) =>
  `${location}.${path}`;

interface ExtractedField {
  field: ContextRunner;
  location: RequestLocation;
  path: string;
  errors: ValidationError[];
  optional: Optional;
  bail: boolean;
  value: unknown;
  grouping: string[];
}

const extractFieldDataAndValidationResults = async (
  fields: ContextRunner[],
  request: ExpressValidatorRequest,
): Promise<ExtractedField[]> => {
  const validationResults = await Promise.all(
    fields.map((field) => {
      return field.run(request) as Promise<ResultWithContext>;
    }),
  );
  const allFields: ExtractedField[] = [];
  for (const { field, result } of validationResults
    .filter((result) =>
      ["body", "query", "params"].includes(result.context.locations[0]),
    )
    .map((result, index) => ({ field: fields[index], result }))) {
    const { locations, optional, bail } = result.context;
    const data = result.context.getData();
    if (locations.length !== 1) {
      throw new Error("Unexpected multiple locations for field");
    }
    for (const dataItem of data) {
      if (dataItem.path !== dataItem.originalPath) {
        throw new Error(
          `Unexpected data.path !== data.originalPath: ${dataItem}`,
        );
      }
      const errors = result.array();
      allFields.push({
        field,
        location: dataItem.location as RequestLocation,
        path: dataItem.path,
        value: dataItem.value,
        errors,
        optional,
        bail,
        grouping: dataItem.pathValues as string[],
      });
    }
  }
  for (const field of allFields) {
    field.grouping = [
      ...field.grouping,
      allFields.map((item) => `${item.location}.${item.path}`).join(","),
    ];
  }
  return allFields;
};

// FIXME: Does nesting atLeastOneOf even make sense?
export type RequestLocation = "body" | "query" | "params";
export const extractUnknownFields = (
  req: ExpressValidatorRequest,
  knownFields: FieldInstance[],
) => {
  const unknownFields: UnknownFieldInstance[] = [];
  const searchLocations =
    req.headers["content-type"] !== "application/octet-stream"
      ? ["body", "query", "params"]
      : ["query", "params"];
  for (const location of searchLocations.filter(
    (location) => location in req && req[location],
  ) as RequestLocation[]) {
    const locationPaths = Object.keys(req[location]);
    const knownPathsForLocation = knownFields
      .filter((field) => field.location === location)
      .map((field) => field.path);
    const unknownPathsForLocation = locationPaths.filter(
      (path: string) => !knownPathsForLocation.includes(path),
    );
    unknownFields.push(
      ...unknownPathsForLocation.map((path) => ({
        path,
        location,
        value: req[location][path],
      })),
    );
  }
  return unknownFields;
};

const getFieldErrorsFromExtractedFields = (
  fields: ExtractedField[],
): FieldValidationError[] => {
  return fields
    .map(({ errors }) => {
      const fieldErrors: FieldValidationError[] = [];
      for (const error of errors) {
        switch (error.type) {
          case "field":
            fieldErrors.push(error);
            break;
          case "alternative":
            // Return field errors
            fieldErrors.push(...error.nestedErrors);
            break;
          case "alternative_grouped":
            // Return field errors
            fieldErrors.push(...error.nestedErrors.flat());
            break;
          case "unknown_fields":
            // Should be unreachable
            break;
        }
      }
      return fieldErrors;
    })
    .flat();
};

// Reimplementation of 'oneOf' middleware (which is actually one-or-more-of)
// to provide more useful error messages to API endpoints.
export const composedChecks =
  (
    checks: ((
      request: ExpressValidatorRequest,
      context: Context,
      fields: ExtractedField[],
    ) => void)[],
    defaultValue?: unknown,
  ) =>
  (...fields: ContextRunner[]): ContextRunner => {
    const middleware = async (
      request: Request,
      _response: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        await middleware.run(request);
        next();
      } catch (error) {
        next(error);
      }
    };

    middleware.run = async (
      request: ExpressValidatorRequest,
    ): Promise<ResultWithContext> => {
      const req = request as ExpressValidatorRequest;
      const fieldsAndResults: ExtractedField[] = (
        await extractFieldDataAndValidationResults(fields, request)
      ).sort((a, b) => {
        const p1 = a.path;
        const p2 = b.path;
        // Do stuff with groupings?
        if (p1.toLowerCase() > p2.toLowerCase()) {
          return 1;
        } else if (p1.toLowerCase() === p2.toLowerCase()) {
          return p1 < p2 ? 1 : -1;
        }
        return -1;
      });
      const uniqueLocations = fieldsAndResults.reduce(
        (acc, field) => {
          acc[field.location] = true;
          return acc;
        },
        {} as Record<RequestLocation, boolean>,
      );
      const context = new Context(
        [],
        Object.keys(uniqueLocations) as RequestLocation[],
        [],
        false,
        false,
      );
      const fieldInstances: FieldInstance[] = [];

      if (defaultValue !== undefined) {
        const noFieldsHadErrors = !fieldsAndResults.some(
          ({ errors }) => errors.length !== 0,
        );
        const noPassingFieldsHadData =
          noFieldsHadErrors &&
          fieldsAndResults.every(({ value }) => value === undefined);
        if (noPassingFieldsHadData) {
          const targetField = fieldsAndResults[0];
          targetField.value = defaultValue;
          request[targetField.location][targetField.path] = defaultValue;
        }
      }

      for (const field of fieldsAndResults) {
        fieldInstances.push({
          path: field.path,
          value: field.value,
          location: field.location as RequestLocation,
          originalPath: field.path,
          pathValues: field.grouping,
        });
      }

      // Do I need to carry over the errors from the nested contexts?
      context.addFieldInstances(fieldInstances);
      const nestedErrors: Record<string, AlternativeValidationError> = {};
      for (const item of fieldsAndResults) {
        // Add non-duplicate errors
        for (const error of item.errors) {
          if (error.type === "alternative") {
            // This is inherited from a nested middleware
            nestedErrors[error.msg] = error;
          }
        }
        for (const error of Object.values(nestedErrors)) {
          if (!context.errors.find((e) => e.msg === error.msg)) {
            context.addError({
              type: error.type,
              message: error.msg,
              nestedErrors: error.nestedErrors,
              req: request,
            });
          }
        }
      }
      for (const check of checks) {
        check(req, context, fieldsAndResults);
      }
      return new ResultWithContextImpl(context);
    };
    return middleware as ContextRunner;
  };

const checkForErroringFieldsWithData = (
  request: ExpressValidatorRequest,
  context: Context,
  fieldsAndResults: ExtractedField[],
) => {
  const erroringFields = fieldsAndResults.filter(
    (item) => item.errors.length !== 0,
  );
  let erroringFieldsWithData = erroringFields.filter(
    (item) => item.value !== undefined,
  );
  const passingFieldsWithData = fieldsAndResults.filter(
    (item) => item.value !== undefined && item.errors.length === 0,
  );
  // If a location/path is passing, and also erroring, then remove the erroring version
  for (const passingField of passingFieldsWithData) {
    const erroringPassingItem = erroringFieldsWithData.find(
      (item) =>
        item.path === passingField.path &&
        item.location === passingField.location,
    );
    if (erroringPassingItem) {
      erroringFieldsWithData = erroringFieldsWithData.filter(
        (item) => item !== erroringPassingItem,
      );
    }
  }

  if (erroringFieldsWithData.length !== 0) {
    const fieldErrors = getFieldErrorsFromExtractedFields(
      erroringFieldsWithData,
    );
    for (const error of fieldErrors) {
      if (!context.errors.find((e) => e.msg === error.msg)) {
        context.addError({
          type: "field",
          message: error.msg,
          value: error.value,
          meta: {
            path: error.path,
            location: error.location,
            req: request,
            pathValues: [],
          },
        });
      }
    }
  }
};

const checkForNoFieldsWithData =
  (messageBuilder: (fields: ExtractedField[]) => string) =>
  (
    request: ExpressValidatorRequest,
    context: Context,
    fieldsAndResults: ExtractedField[],
  ) => {
    const hasAnyFieldWithData = fieldsAndResults.some(
      (item) => item.value !== undefined,
    );
    const erroringFields = fieldsAndResults.filter(
      (item) => item.errors.length !== 0,
    );
    if (!hasAnyFieldWithData) {
      context.addError({
        type: "alternative",
        req: request,
        message: messageBuilder(fieldsAndResults),
        nestedErrors: getFieldErrorsFromExtractedFields(erroringFields),
      });
    }
  };

const checkForNPassingFieldsWithData =
  (
    checkN: (n: number, allFields: ExtractedField[]) => boolean,
    messageBuilder: (fields: ExtractedField[]) => string,
  ) =>
  (
    request: ExpressValidatorRequest,
    context: Context,
    fieldsAndResults: ExtractedField[],
  ) => {
    const passingFieldsWithData = fieldsAndResults.filter(
      (item) => item.value !== undefined && item.errors.length === 0,
    );
    const erroringFields = fieldsAndResults.filter(
      (item) => item.errors.length !== 0,
    );
    const erroringFieldsWithData = fieldsAndResults.filter(
      (item) => item.value !== undefined && item.errors.length !== 0,
    );
    if (
      erroringFieldsWithData.length === 0 &&
      !checkN(passingFieldsWithData.length, fieldsAndResults)
    ) {
      context.addError({
        type: "alternative",
        req: request,
        message: messageBuilder(fieldsAndResults),
        nestedErrors: getFieldErrorsFromExtractedFields(erroringFields),
      });
    }
  };

const checkForExactlyOnePassingFieldWithData = checkForNPassingFieldsWithData(
  (n, allFields) => {
    const passingFieldsWithData = allFields.filter(
      (item) => item.value !== undefined && item.errors.length === 0,
    );

    // If there are sub-groupings, exactly one grouping should have data and no errors.
    const groupings: Record<string, ExtractedField[]> = {};
    for (const passingField of passingFieldsWithData) {
      if (passingField.grouping.length >= 2) {
        const group = passingField.grouping[passingField.grouping.length - 2];
        groupings[group] = groupings[group] || [];
        groupings[group].push(passingField);
      }
    }
    const numPassingGroups = Object.keys(groupings).length;
    return numPassingGroups === 1 || n < 2;
  },
  (fields) => `Expected exactly one of ${fields.map(pathLocation).join(", ")}.`,
);

const checkForAtMostOnePassingFieldWithData = checkForNPassingFieldsWithData(
  (n) => {
    return n < 2;
  },
  (fields) => `Expected at most one of ${fields.map(pathLocation).join(", ")}.`,
);

const checkForAllFieldsOrNoFieldsPassing = checkForNPassingFieldsWithData(
  (_n, allFields) => {
    const erroringFieldsWithData = allFields.filter(
      (item) => item.value !== undefined && item.errors.length !== 0,
    );
    return erroringFieldsWithData.length === 0;
  },
  (fields) => `Expected all of ${fields.map(pathLocation).join(", ")}.`,
);

export const atLeastOneOf = composedChecks([
  checkForNoFieldsWithData(
    (fields) =>
      `Expected at least one of ${fields.map(pathLocation).join(", ")}.`,
  ),
  checkForErroringFieldsWithData,
]);

export const exactlyOneOf = composedChecks([
  checkForNoFieldsWithData(
    (fields) =>
      `Expected exactly one of ${fields.map(pathLocation).join(", ")}.`,
  ),
  checkForErroringFieldsWithData,
  checkForExactlyOnePassingFieldWithData,
]);

export const exactlyOneOfOrDefault = (defaultValue?: unknown) =>
  composedChecks(
    [
      checkForNoFieldsWithData(
        (fields) =>
          `Expected exactly one of ${fields.map(pathLocation).join(", ")}.`,
      ),
      checkForErroringFieldsWithData,
      checkForExactlyOnePassingFieldWithData,
    ],
    defaultValue,
  );

export const atMostOneOf = composedChecks([
  checkForErroringFieldsWithData,

  // TODO: At most one of should only pass up the field names that succeeded if some succeeded
  checkForAtMostOnePassingFieldWithData,
]);

export const allOrNoneOf = composedChecks([checkForAllFieldsOrNoFieldsPassing]);

const intOrString: CustomValidator = (val: number | string, meta) => {
  const asInt = parseInt(val as string);
  if (isNaN(asInt)) {
    if (typeof val === "string") {
      return true;
    } else {
      throw new ClientError(expectedTypeOf("string", "integer")(val, meta));
    }
  } else {
    meta.req[meta.location][meta.path] = asInt;
    return true;
  }
};

export const nameOrIdOf = (field: ValidationChain): ContextRunner =>
  field.custom(intOrString);
