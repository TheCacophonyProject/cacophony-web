import { CurrentViewAbortController } from "@/router";
import { CurrentUser, userIsLoggedIn } from "@/models/LoggedInUser";
import type { LoggedInUser } from "@/models/LoggedInUser";
import type { ErrorResult } from "@api/types";

let lastApiVersion: string | null = null;

/**
 * Makes a request to the given url with default handling for cors and authentication.
 * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
 * The result field is the JSON blob from the response body.
 * These fields can easily be resolved using object destructuring to directly assign the required information.
 * @param {RequestInfo} url The full url to send the request to
 * @param {RequestInit} request: The RequestInit info for things such as headers and body
 * @returns {Promise<{result: any, success: boolean, status: number}>}
 */
export async function fetch(url: string, request: RequestInit = {}) {
  request = {
    mode: "cors",
    cache: "no-cache",
    ...request,
    headers: {
      ...request.headers,
    },
    signal: CurrentViewAbortController.controller.signal,
  };
  if (userIsLoggedIn.value) {
    (request.headers as Record<string, string>).Authorization = (
      CurrentUser.value as LoggedInUser
    ).apiToken;
  } else {
    // During authentication/token refresh, we'll send the users screen resolution for analytics purposes
    (
      request.headers as Record<string, string>
    ).Viewport = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio} - ${window.screen.orientation.type}`;
  }
  let response;
  try {
    response = await window.fetch(url, request);
  } catch (e) {
    // Network error?
    return {
      result: {
        errors: ["Network connection refused"],
        messages: [
          "We couldn't connect to the server. Please make sure you have a network connection.",
        ],
        errorType: "Client",
      } as ErrorResult,
      status: 500,
      success: false,
    };
  }
  if (response.status === 401) {
    CurrentUser.value = null;
    return;
  }
  const result = await response.json();
  if (result.cwVersion) {
    if (lastApiVersion !== result.cwVersion) {
      // TODO - could show a user prompt rather than just refreshing?
      return window.location.reload();
    }
    lastApiVersion = result.cwVersion as string;
    delete result.cwVersion;
  }

  return {
    result,
    status: response.status,
    success: response.ok,
  };
}
