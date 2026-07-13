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

import log from "@log";
import type { Response, Request } from "express";
import { CACOPHONY_WEB_VERSION } from "@/Globals.js";
import { HttpStatusCode } from "@/../types/api/consts.js";
import type { DecodedJWTToken } from "@api/auth.js";
import { getVerifiedJWT } from "@api/auth.js";
import { ExtractJwt } from "passport-jwt";

function send(
  response: Response,
  data: { statusCode: HttpStatusCode; messages: string[] } & Record<
    string,
    unknown
  >,
) {
  // Check that the data is valid.
  if (
    typeof data !== "object" ||
    typeof data.statusCode !== "number" ||
    typeof data.messages !== "object"
  ) {
    // Respond with server error if data is invalid.
    return response.status(HttpStatusCode.ServerError).json({
      messages: data.messages,
      success: false,
      cwVersion: CACOPHONY_WEB_VERSION.version,
    });
  }
  if (CACOPHONY_WEB_VERSION.version !== "unknown") {
    // In production, we add the cacophony-web version to each request
    data.cwVersion = CACOPHONY_WEB_VERSION.version;
  }
  const statusCode = data.statusCode;
  data.success = 200 <= statusCode && statusCode <= 299;
  delete data.statusCode;
  if (!response.headersSent) {
    return response.status(statusCode).json(data);
  }
}

export const someResponse = (
  response: Response,
  statusCode: HttpStatusCode,
  messageOrData: string | string[] | Record<string, unknown> = "",
  data: Record<string, unknown> = {},
) => {
  const dataMessages: string[] = (data.messages as string[]) || [];
  if (response.headersSent) {
    log.warning(`Response headers already sent, can't send error response`);
    return;
  }
  if (typeof messageOrData === "string" || Array.isArray(messageOrData)) {
    const serverError =
      statusCode === HttpStatusCode.ServerError ? ["Server error. Sorry!"] : [];
    const otherMessages =
      typeof messageOrData === "string" ? [messageOrData] : messageOrData;
    const messages = [...serverError, ...dataMessages, ...otherMessages];
    return send(response, {
      ...data,
      statusCode,
      messages,
    });
  }
  return send(response, {
    ...(messageOrData as Record<string, unknown>),
    statusCode,
    messages: dataMessages,
  });
};

export const successResponse = (
  response: Response,
  messageOrData: string | string[] | Record<string, unknown> = "",
  data: Record<string, unknown> = {},
) => someResponse(response, HttpStatusCode.Ok, messageOrData, data);

export const serverErrorResponse = async (
  request: Request,
  response: Response,
  error: Error,
  messageOrData: string | string[] | Record<string, unknown> = "",
  data: Record<string, unknown> = {},
) => {
  try {
    // If the payload was too large, we'd still like to know who the request is from in the logs.
    const token = getVerifiedJWT(request) as DecodedJWTToken;

    const stack = new Error().stack;
    log.error(
      "SERVER ERROR: %s, %s, %s, %s(%s)",
      error.toString(),
      error.stack || stack,
      Object.entries(error).flat(),
      token._type,
      token.id,
    );
  } catch (_e) {
    const hasToken = ExtractJwt.fromAuthHeaderWithScheme("jwt")(request);
    if (hasToken) {
      log.error(
        "SERVER ERROR (JWT token): %s, %s",
        error.toString(),
        error.stack,
      );
    } else {
      log.error("SERVER ERROR: %s, %s", error.toString(), error.stack);
    }
  }
  try {
    return someResponse(
      response,
      HttpStatusCode.ServerError,
      messageOrData,
      data,
    );
  } catch (e) {
    log.error(e);
  }
};
