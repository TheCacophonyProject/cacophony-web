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

import log from "../logging";
import { format } from "util";
import { asyncLocalStorage } from "@/Globals";
import { NextFunction, Request, Response } from "express";

function errorHandler(
  err: Error,
  request: Request,
  response: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  if (
    err instanceof SyntaxError &&
    (err as any).type === "entity.parse.failed"
  ) {
    err = new ClientError(err.message, 422); // Convert invalid JSON body error to UnprocessableEntity
  }
  const session = asyncLocalStorage.getStore();
  let requestId;
  if (session) {
    requestId = (session as Map<string, any>).get("requestId").split("-")[0];
  }
  if (err instanceof CustomError) {
    log.warning(err.toString());
    const error = err.toJson();
    if (!request.headers["user-agent"].includes("okhttp")) {
      // FIXME - leave this in for sidekick etc, since currently it expects a 'message' error response.
      delete error.message;
    }
    return response.status(err.statusCode).json({
      messages: [err.message],
      ...error,
      requestId,
    });
  }
  log.error("%s, %s", err.toString(), err.stack);
  response.status(500).json({
    messages: [`Internal server error: ${err.name}: ${err.message}.`],
    errorType: "server",
    requestId,
  });
}

class CustomError extends Error {
  statusCode: number;
  constructor(
    message: string = "Internal server error.",
    statusCode: number = 500
  ) {
    super();
    this.name = this.constructor.name;
    this.message = message;
    this.statusCode = statusCode;
  }

  getErrorType() {
    if (this.name.endsWith("Error")) {
      return this.name.toLowerCase().slice(0, -"Error".length);
    }
    return this.name.toLowerCase();
  }

  toString() {
    return format("%s [%d]: %s.", this.name, this.statusCode, this.message);
  }

  toJson() {
    return {
      message: this.message,
      errorType: this.getErrorType(),
    };
  }
}

export class ValidationError extends CustomError {
  errors: Record<string, any>;
  constructor(errors) {
    const message = errors
      .array()
      .filter((error) => typeof error.msg === "string")
      .map(({ msg, location, param }) => `${location}.${param}: ${msg}`)
      .join("; ");
    super(message, 422);
    this.errors = errors;
  }

  toJson() {
    return {
      errorType: this.getErrorType(),
      message: `${
        this.errors.array().length
      } request validation errors found. Request payload could not be processed.`,
      errors: this.errors.array(),
    };
  }
}

class AuthenticationError extends CustomError {
  constructor(message: string) {
    super(message, 401);
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class ClientError extends CustomError {
  constructor(message: string, statusCode: number = 400) {
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
