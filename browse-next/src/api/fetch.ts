import { CurrentViewAbortController } from "@/router";
import { CurrentUser, userIsLoggedIn } from "@/models/LoggedInUser";
import type { LoggedInUser } from "@/models/LoggedInUser";
import type { ErrorResult, FetchResult } from "@api/types";
import { reactive } from "vue";
import { delayMsThen } from "@/utils";

let lastApiVersion: string | null = null;

export const INITIAL_RETRY_INTERVAL = 3000;
export const MAX_RETRY_COUNT = 30;

export interface NetworkConnectionErrorSignal {
  hasConnectionError: boolean;
  retryInterval: number;
  retryCount: number;
  control: boolean;
}

export const networkConnectionError = reactive<NetworkConnectionErrorSignal>({
  hasConnectionError: false,
  retryInterval: INITIAL_RETRY_INTERVAL,
  retryCount: 0,
  control: false,
});
/**
 * Makes a request to the given url with default handling for cors and authentication.
 * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
 * The result field is the JSON blob from the response body.
 * These fields can easily be resolved using object destructuring to directly assign the required information.
 * @param {RequestInfo} url The full url to send the request to
 * @param {RequestInit} request The RequestInit info for things such as headers and body
 * @param {Boolean} [abortable=true] Whether or not this is a request for the current view, and if so should be aborted when the view changes.
 * @returns {Promise<{result: any, success: boolean, status: number}>}
 */
export async function fetch<T>(
  url: string,
  request: RequestInit = {},
  abortable = true
): Promise<FetchResult<T> | void> {
  request = {
    mode: "cors",
    cache: "no-cache",
    ...request,
    headers: {
      ...request.headers,
    },
  };
  if (abortable) {
    request.signal = CurrentViewAbortController.controller.signal;
    request.signal!.addEventListener("onabort", (e) => {
      console.log("Aborted", e, request.signal);
    });
  }
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
    networkConnectionError.retryInterval = INITIAL_RETRY_INTERVAL;
    networkConnectionError.retryCount = 0;
    networkConnectionError.hasConnectionError = false;
  } catch (e: Error | unknown) {
    if ((e as Error).name === "AbortError") {
      console.log(
        e,
        (e as Error).name,
        url,
        CurrentViewAbortController.controller.signal
      );
      return;
    }
    networkConnectionError.hasConnectionError = true;
    const delay = networkConnectionError.retryInterval;
    if (networkConnectionError.retryCount < MAX_RETRY_COUNT) {
      return delayMsThen(
        delay,
        () => {
          return fetch(url, request);
        },
        networkConnectionError
      ) as Promise<FetchResult<T>>;
    }

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