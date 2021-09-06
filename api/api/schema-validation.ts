import { Validator } from "jsonschema";
import { Schema, ValidationError } from "jsonschema/lib";
import logger from "../logging";
import { ClientError } from "./customErrors";

const JsonSchema = new Validator();
Validator.prototype.customFormats.FloatZeroOne = (val) => {
  return typeof val === "number" && val >= 0 && val <= 1;
};
Validator.prototype.customFormats.IsoFormattedDateString = (val) => {
  if (typeof val !== "string") {
    return false;
  }
  const d = Date.parse(val);
  return !isNaN(d);

};

const SpecialFormats = {
  FloatZeroOne: "floating point number from 0.0 to 1.0 inclusive",
  IsoFormattedDateString: "ISO formatted date string",
};

const getPathType = (
  item: object,
  path: (string | number)[] | string,
  instance?: any
) => {
  if (item === null) {
    return "'null'";
  }
  const name = getPathName(item, path, instance);
  if (name === "array") {
    return name;
  }
  if (name === null) {
    return "'null'";
  }
  return typeof name;
};

const getPathName = (
  item: object,
  path: (string | number)[] | string,
  instance?: any
) => {
  if (path.length === 0) {
    return Array.isArray(instance) ? "array" : instance;
  }
  let stack = item;
  if (!Array.isArray(path)) {
    path = [path];
  }
  while (path.length) {
    const piece = path.shift();
    stack = stack[piece];
  }
  return stack;
};
const printPath = (path: (string | number)[], property?: string): string => {
  if (path.length === 0 && property && typeof property === "string") {
    return property; //.split('.').pop();
  }
  return path
    .map((item) => (typeof item === "number" ? `[${item}]` : item))
    .join(".")
    .replace(/\.\[/g, "[");
};
const printInstance = (instance: any): string => {
  if (typeof instance === "object") {
    return JSON.stringify(instance);
  }
  return instance;
};

export const arrayOf = (schemaOriginal: Schema): Schema => {
  const schema = JSON.parse(JSON.stringify(schemaOriginal));
  // Wrap schema in array type.
  if (schema.definitions.length > 1) {
    throw new ClientError("arrayOf error");
  }
  const definition = Object.keys(schema.definitions)[0];
  schema.$ref = `#/definitions/${definition}s`;
  schema.definitions[`${definition}s`] = {
    "type": "array",
    "items": {
      "$ref": `#/definitions/${definition}`
    }
  };
  return schema;
};

export const jsonSchemaOf =
  (schema: Schema) =>
  (val: string | object, { location, path: requestPath, req }) => {
    if (typeof val === "string") {
      try {
        val = JSON.parse(val);
        // FIXME: Store back the parsed JSON - test this case!
        // req[location][requestPath] = val;
      } catch (e) {
        throw new ClientError("Malformed json");
      }
    }
    if (typeof val !== "object") {
      throw new ClientError("Malformed json");
    }
    const result = JsonSchema.validate(val, schema, { required: true });
    if (result.errors.length) {
      const errors: ValidationError[] = result.errors;
      throw new ClientError(
        "JSON Schema error(s): " +
          errors
            .map(
              ({
                message,
                name,
                path,
                property,
                argument,
                stack,
                instance,
              }) => {
                switch (name) {
                  case "type":
                    return `field '${printPath(
                      path,
                      requestPath
                    )}' expected ${name} ${argument}, got ${getPathType(
                      val as object,
                      path
                    )}`;

                  case "required":
                    return `required field '${printPath(path)}${
                      path.length ? "." : ""
                    }${argument}' is missing`;

                  case "format":
                    return `field '${printPath(path, property)}' expected ${
                      SpecialFormats[argument]
                    }, got ${getPathType(
                      val as object,
                      path,
                      instance
                    )} '${printInstance(instance)}'`;

                  case "additionalProperties":
                    return `'${printPath(
                      path,
                      property === "instance"
                        ? `${location}.${requestPath}`
                        : property
                    )}' is not allowed to have the additional property '${argument}'`;
                  case "enum":
                    return `!!${path}, ${stack}`;
                  default:
                    console.warn("Unhandled JSON schema error formatter", name, message, property, argument);
                    return message;
                }
              }
            )
            .join("; ")
      );
    }
    return result.valid;
  };
