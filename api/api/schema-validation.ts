import { ClientError } from "./customErrors.js";
import type { DefinedError, ErrorObject, ValidateFunction } from "ajv";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";

// NOTE: Early failure makes the API validation a bit faster, but a user
// can only find out about a single error at a time.
const ajv = addFormats.default(new Ajv({ allErrors: false, verbose: true }), {
  mode: "fast",
  formats: ["date-time"],
});
const Validators = new Map<string, ValidateFunction>();

export interface Schema {
  $id?: string;
  id?: string;
  $schema?: string;
  $ref?: string;
  title?: string;
  description?: string;
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number | boolean;
  minimum?: number;
  exclusiveMinimum?: number | boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string | RegExp;
  additionalItems?: boolean | Schema;
  items?: Schema | Schema[];
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxProperties?: number;
  minProperties?: number;
  required?: string[] | boolean;
  additionalProperties?: boolean | Schema;
  definitions?: Record<string, Schema>;
  properties?: Record<string, Schema>;
  patternProperties?: Record<string, Schema>;
  dependencies?: Record<string, Schema | string[]>;
  const?: unknown;
  enum?: unknown[];
  type?: string | string[];
  format?: string;
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  not?: Schema;
  if?: Schema;
  then?: Schema;
  else?: Schema;
}

const printPath = (
  path: (string | number)[],
  instancePath?: string,
): string => {
  const p = path
    .map((item) => (typeof item === "number" ? `[${item}]` : item))
    .join(".")
    .replace(/\.\[/g, "[");
  if (instancePath) {
    return `${p}[${instancePath.slice(1)}]`;
  }
  return p;
};
const printInstance = (instance: object | string): string => {
  if (typeof instance === "object") {
    return JSON.stringify(instance);
  }
  return instance;
};

export const arrayOf = (schemaOriginal: Schema): Schema => {
  const schema = structuredClone(schemaOriginal);
  const definitions = Object.keys(schema.definitions);
  // Wrap schema in array type.
  if (definitions.length > 1) {
    throw new ClientError("arrayOf error");
  }
  const definition = definitions[0];
  schema.$ref = `#/definitions/${definition}s`;
  schema.definitions[`${definition}s`] = {
    type: "array",
    items: {
      $ref: `#/definitions/${definition}`,
    },
  };
  return schema;
};

export const jsonSchemaOf =
  (schema: Schema) =>
  (
    val: string | object,
    { location, path: requestPath }: { location: string; path: string },
  ) => {
    if (typeof val === "string") {
      try {
        val = JSON.parse(val);
      } catch (_e) {
        throw new ClientError("Malformed json");
      }
    }
    if (val === "") {
      throw new ClientError("Malformed json");
    }
    if (typeof val !== "object") {
      throw new ClientError("Malformed json");
    }
    if (!schema.$ref) {
      throw new ClientError("Schema definition not found");
    }
    if (!Validators.has(schema.$ref)) {
      Validators.set(schema.$ref, ajv.compile(schema));
    }
    const validator = Validators.get(schema.$ref);
    const isValid = validator(val);
    if (isValid) {
      return true;
    }

    const errors = validator.errors as DefinedError[];
    const path = `${location}.${requestPath}`.split(".");
    const formattedErrors = errors.map((error: ErrorObject) => {
      switch (error.keyword) {
        case "format":
        case "type":
          return `field '${printPath(path, error.instancePath)}' expected '${
            error.params[error.keyword]
          }', got '${printInstance(error.data as unknown as object | string)}'`;
        case "additionalProperties":
          return `field '${
            error.params.additionalProperty
          }', not allowed in '${printPath(path, error.instancePath)}'`;
        case "required":
          return `missing required field '${printPath(path, error.instancePath)}${
            path.length ? "." : ""
          }${error.params.missingProperty}'`;
        default: {
          console.warn(
            "Unhandled JSON schema error formatter",
            error,
            location,
            requestPath,
          );
          return error.message;
        }
      }
    });

    throw new ClientError(
      `JSON Schema error(s): ${formattedErrors.join(", ")}`,
    );
  };
