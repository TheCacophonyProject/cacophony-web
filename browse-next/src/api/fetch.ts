import { CurrentViewAbortController } from "@/router";
import {
  CurrentUser,
  userIsLoggedIn,
  LoggedInUser,
} from "@/models/LoggedInUser";

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
  if (userIsLoggedIn) {
    (request.headers as any).Authorization = (
      CurrentUser.value as LoggedInUser
    ).apiToken;
  }
  const response = await window.fetch(url, request);
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
