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

import log, { colourForStatusCode } from "../logging.js";
import { format } from "util";
import { asyncLocalStorage } from "@/Globals.js";
import type { NextFunction, Request, Response } from "express";
import { HttpStatusCode } from "@typedefs/api/consts.js";
import { serverErrorResponse, someResponse } from "@api/V1/responseUtil.js";
import { ValidationError as ExpressValidationError } from "express-validator";
import {
  ResultWithContext,
  ResultWithContextImpl,
} from "express-validator/lib/chain/index.js";
import { AddErrorOptions, Context } from "express-validator/lib/context.js";

function errorHandler(
  err: Error,
  request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (
    err instanceof SyntaxError &&
    "type" in err &&
    err.type === "entity.parse.failed"
  ) {
    err = new ClientError(err.message, HttpStatusCode.Unprocessable); // Convert invalid JSON body error to UnprocessableEntity
  }
  const session = asyncLocalStorage.getStore();
  let requestId;
  if (session) {
    requestId = (
      (session as Map<string, unknown>).get("requestId") as string
    ).split("-")[0];
  }
  if (err instanceof CustomError) {
    const errString = err.toString();
    if (
      !errString.includes("No reference image available for device at time") &&
      !errString.includes("No device mask-regions found")
    ) {
      log.warning(err.toString());
    }
    const error = err.toJson();
    if (!request.headers["user-agent"].includes("okhttp")) {
      // FIXME - leave this in for sidekick etc, since currently it expects a 'message' error response.
      delete error.message;
    }
    try {
      return someResponse(
        response,
        (err as CustomError).statusCode,
        err.messages,
        {
          ...error,
          requestId,
        },
      );
    } catch (error) {
      log.error(error);
    }
  }
  return serverErrorResponse(
    request,
    response,
    err,
    `Internal server error: ${err.name}: ${err.message}`,
    {
      errorType: "server",
      requestId,
    },
  );
}

export class CustomError extends Error {
  statusCode: HttpStatusCode;
  messages: string[] | string;
  constructor(
    message: string[] | string = "Internal server error.",
    statusCode: HttpStatusCode = HttpStatusCode.ServerError,
  ) {
    super();
    this.name = this.constructor.name;

    if (typeof message !== "string") {
      this.message = message.join("; ");
      this.messages = message;
    } else {
      this.message = message;
      this.messages = [message];
    }
    this.statusCode = statusCode;
  }

  getErrorType() {
    if (this.name.endsWith("Error")) {
      return this.name.toLowerCase().slice(0, -"Error".length);
    }
    return this.name.toLowerCase();
  }

  toString() {
    return format(
      "%s %s: %s",
      this.name,
      `${colourForStatusCode(Number(this.statusCode))}`,
      this.message,
    );
  }

  toJson() {
    return {
      message: this.messages,
      errorType: this.getErrorType(),
    };
  }
}

export class ValidationError extends CustomError {
  errors: ExpressValidationError[];
  constructor(result: ResultWithContext | AddErrorOptions) {
    let resultWithContext: ResultWithContext;
    if ("type" in result && result.type === "field") {
      const context = new Context([], [], [], false, false);
      context.addError(result);
      resultWithContext = new ResultWithContextImpl(context);
    } else {
      resultWithContext = result as ResultWithContext;
    }
    const allErrors = resultWithContext.array();
    super(
      allErrors.map((e) => e.msg),
      HttpStatusCode.Unprocessable,
    );
    this.errors = allErrors;
  }

  toJson() {
    return {
      errorType: this.getErrorType(),
      message: `${
        this.errors.length
      } request validation errors found. Request payload could not be processed.`,
      errors: this.errors,
    };
  }
}

// FIXME - Are we mixing up authentication and authorization here?
export class AuthenticationError extends CustomError {
  constructor(message: string) {
    super(message, HttpStatusCode.AuthorizationError);
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string) {
    super(message, HttpStatusCode.Forbidden);
  }
}

export class UnprocessableError extends CustomError {
  constructor(message: string) {
    super(message, HttpStatusCode.Unprocessable);
  }
}

export class BadRequestError extends CustomError {
  constructor(message: string) {
    super(message, HttpStatusCode.BadRequest);
  }
}

export class FatalError extends CustomError {
  constructor(message: string) {
    super(message, HttpStatusCode.ServerError);
  }
}

export class ClientError extends CustomError {
  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatusCode.BadRequest,
  ) {
    super(message, statusCode);
  }
}

export default {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ClientError,
  errorHandler,
};
