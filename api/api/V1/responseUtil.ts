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
import jwt from "jsonwebtoken";
import config from "@config";
import type { Response, Request } from "express";
import { CACOPHONY_WEB_VERSION } from "@/Globals.js";
import { HttpStatusCode } from "@/../types/api/consts.js";
import type { DecodedJWTToken } from "@api/auth.js";
import { getVerifiedJWT } from "@api/auth.js";

const VALID_DATAPOINT_UPLOAD_REQUEST = "Thanks for the data.";
const VALID_DATAPOINT_UPDATE_REQUEST = "Datapoint was updated.";
const VALID_DATAPOINT_GET_REQUEST = "Successful datapoint get request.";
const VALID_FILE_REQUEST = "Successful file request.";

const INVALID_DATAPOINT_UPLOAD_REQUEST =
  "Request for uploading a datapoint was invalid.";
const INVALID_DATAPOINT_UPDATE_REQUEST =
  "Request for updating a datapoint was invalid.";

function send(
  response: Response,
  data: { statusCode: HttpStatusCode; messages: string[] } & Record<string, any>,
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
    (data as any).cwVersion = CACOPHONY_WEB_VERSION.version;
  }
  const statusCode = data.statusCode;
  (data as any).success = 200 <= statusCode && statusCode <= 299;
  delete data.statusCode;
  return response.status(statusCode).json(data);
}

function invalidDatapointUpload(response: Response, message: string) {
  badRequest(response, [INVALID_DATAPOINT_UPLOAD_REQUEST, message]);
}

function invalidDatapointUpdate(response: Response, message: string) {
  badRequest(response, [INVALID_DATAPOINT_UPDATE_REQUEST, message]);
}

function badRequest(response: Response, messages: string[]) {
  send(response, { statusCode: HttpStatusCode.BadRequest, messages });
}

//======VALID REQUESTS=========
function validRecordingUpload(response, idOfRecording, message = "") {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [message || VALID_DATAPOINT_UPLOAD_REQUEST],
    recordingId: idOfRecording,
  });
}

function validAudiobaitUpload(response, id, message = "") {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [message || VALID_DATAPOINT_UPLOAD_REQUEST],
    id,
  });
}

function validEventThumbnailUpload(response, id, message = "") {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [message || VALID_DATAPOINT_UPLOAD_REQUEST],
    id,
  });
}

function validFileUpload(response, key) {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [VALID_DATAPOINT_UPLOAD_REQUEST],
    fileKey: key,
  });
}

function validDatapointUpdate(response) {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [VALID_DATAPOINT_UPDATE_REQUEST],
  });
}

function validDatapointGet(response, result) {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [VALID_DATAPOINT_GET_REQUEST],
    result,
  });
}

function validFileRequest(response, data) {
  send(response, {
    statusCode: HttpStatusCode.Ok,
    messages: [VALID_FILE_REQUEST],
    jwt: jwt.sign(data, config.server.passportSecret, { expiresIn: 60 * 10 }),
  });
}

export const someResponse = (
  response: Response,
  statusCode: HttpStatusCode,
  messageOrData: string | string[] | Record<string, any> = "",
  data: Record<string, any> = {},
) => {
  const dataMessages = data.messages || [];
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
    ...(messageOrData as Record<string, any>),
    statusCode,
    messages: dataMessages,
  });
};

export const successResponse = (
  response: Response,
  messageOrData: string | string[] | Record<string, any> = "",
  data: Record<string, any> = {},
) => someResponse(response, HttpStatusCode.Ok, messageOrData, data);

export const serverErrorResponse = async (
  request: Request,
  response: Response,
  error: Error,
  messageOrData: string | string[] | Record<string, any> = "",
  data: Record<string, any> = {},
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
  } catch (e) {
    log.error(
      "SERVER ERROR (JWT token): %s, %s",
      error.toString(),
      error.stack,
    );
  }
  return someResponse(
    response,
    HttpStatusCode.ServerError,
    messageOrData,
    data,
  );
};

export default {
  send,
  invalidDatapointUpdate,
  validFileUpload,
  invalidDatapointUpload,
  validDatapointGet,
  validDatapointUpdate,
  validRecordingUpload,
  validAudiobaitUpload,
  validEventThumbnailUpload,
  validFileRequest,
};
