import { CurrentViewAbortController } from "@/router";
import type { LoggedInUserAuth } from "@/models/LoggedInUser";
import {
  CurrentUserCreds,
  forgetUserOnCurrentDevice,
  refreshLocallyStoredUser,
  refreshLocallyStoredUserActivation,
  setLoggedInUserCreds,
  tryLoggingInRememberedUser,
  userIsLoggedIn,
} from "@/models/LoggedInUser";
import type { ErrorResult, FetchResult } from "@api/types";
import { reactive, ref } from "vue";
import { decodeJWT, delayMs, delayMsThen } from "@/utils";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { HttpStatusCode } from "@typedefs/api/consts.ts";
import { API_ROOT } from "@api/root";

export const INITIAL_RETRY_INTERVAL = 3000;
export const MAX_RETRY_COUNT = 30;

export interface NetworkConnectionErrorSignal {
  hasConnectionError: boolean;
  retryInterval: number;
  retryCount: number;
  control: boolean;
}

const getScreenOrientation = (): string => {
  if (window.screen.orientation) {
    return window.screen.orientation?.type;
  } else if (typeof window.orientation !== "undefined") {
    if (Math.abs(window.orientation) == 90) {
      return "landscape";
    } else {
      return "portrait";
    }
  }
  return "unknown screen orientation";
};

export const maybeRefreshStaleCredentials = async () => {
  // NOTE: Check if we need to refresh our apiToken using our refreshToken before making this request.
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    try {
      const currentUserCreds = JSON.parse(
        rememberedCredentials
      ) as LoggedInUserAuth;
      const apiToken = decodeJWT(
        (currentUserCreds as LoggedInUserAuth).apiToken
      );
      const now = new Date();
      if ((apiToken?.expiresAt as Date).getTime() < now.getTime() + 5000) {
        if (!currentUserCreds.refreshingToken) {
          setLoggedInUserCreds({
            ...currentUserCreds,
            refreshingToken: true,
          });
          const response = await window.fetch(
            `${API_ROOT}/api/v1/users/refresh-session-token`,
            {
              body: JSON.stringify({
                refreshToken: currentUserCreds.refreshToken,
              }),
              headers: {
                "Content-Type": "application/json; charset=utf-8",
              },
              method: "POST",
            }
          );
          const result = await response.json();
          const refreshedUserResult = {
            result,
            status: response.status,
            success: response.ok,
          };
          if (refreshedUserResult.success) {
            const refreshedUser = refreshedUserResult.result;
            setLoggedInUserCreds({
              ...currentUserCreds,
              apiToken: refreshedUser.token,
              refreshToken: refreshedUser.refreshToken,
              refreshingToken: false,
            });
            refreshLocallyStoredUser(refreshedUser.userData);
          } else {
            // Refresh token wasn't found, so prompt login again
            forgetUserOnCurrentDevice();
          }
        } else {
          await delayMs(10);
          await maybeRefreshStaleCredentials();
        }
      }
    } catch (e) {
      // Logout
      forgetUserOnCurrentDevice();
    }
  } else {
    // Logout
    forgetUserOnCurrentDevice();
  }
};

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
    request.signal?.addEventListener("onabort", (e) => {
      console.warn("Aborted", e, request.signal);
    });
  }
  if (import.meta.env.DEV) {
    await tryLoggingInRememberedUser(ref(true));
  }
  if (userIsLoggedIn.value) {
    await maybeRefreshStaleCredentials();
    if (CurrentUserCreds.value) {
      (request.headers as Record<string, string>).Authorization = (
        CurrentUserCreds.value as LoggedInUserAuth
      ).apiToken;
    } else {
      //debugger;
    }
    //console.log("Requesting with token", CurrentUser.value?.apiToken);
  } else {
    // During authentication/token refresh, we'll send the users screen resolution for analytics purposes
    (request.headers as Record<string, string>).Viewport = `${
      window.screen.width
    }x${window.screen.height}@${
      window.devicePixelRatio
    } - ${getScreenOrientation()}`;
  }
  let response;
  try {
    response = await window.fetch(url, request);
    networkConnectionError.retryInterval = INITIAL_RETRY_INTERVAL;
    networkConnectionError.retryCount = 0;
    networkConnectionError.hasConnectionError = false;
  } catch (e: Error | unknown) {
    if ((e as Error).name === "AbortError") {
      console.warn(
        "!! Abort, abort",
        e,
        (e as Error).name,
        url,
        request.signal
      );
      return;
    }
    networkConnectionError.hasConnectionError = true;
    const delay = networkConnectionError.retryInterval;
    if (networkConnectionError.retryCount < MAX_RETRY_COUNT) {
      return (await delayMsThen(
        delay,
        () => {
          return fetch(url, request);
        },
        networkConnectionError
      )) as Promise<FetchResult<T>>;
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
      status: HttpStatusCode.ServerError,
      success: false,
    };
  }
  if (
    response.status === HttpStatusCode.AuthorizationError &&
    !response.url.endsWith("/api/v1/users/authenticate")
  ) {
    {
      const isJSON = (
        Array.from((response.headers as any).entries()) as [string, string][]
      ).find(
        ([key, val]: [string, string]) =>
          key.toLowerCase() === "content-type" &&
          val.toLowerCase().includes("application/json")
      );
      if (isJSON) {
        const result = await response.json();
        debugger;
      }
    }

    forgetUserOnCurrentDevice();
    return {
      result: {
        errors: ["Unauthorized"],
        messages: ["You must be logged in to access this API."],
        errorType: "Client",
      },
      status: HttpStatusCode.AuthorizationError,
      success: false,
    };
  }
  const isJSON = (
    Array.from((response.headers as any).entries()) as [string, string][]
  ).find(
    ([key, val]: [string, string]) =>
      key.toLowerCase() === "content-type" &&
      val.toLowerCase().includes("application/json")
  );
  let result;
  if (isJSON) {
    result = await response.json();

    if (
      response.status === HttpStatusCode.Forbidden &&
      result.errorType === "authorization" &&
      !response.url.endsWith("/api/v1/users/authenticate")
    ) {
      forgetUserOnCurrentDevice();
      return {
        result: {
          errors: ["Unauthorized"],
          messages: ["You must be logged in to access this API."],
          errorType: "Client",
        },
        status: HttpStatusCode.AuthorizationError,
        success: false,
      };
    }

    if (result.cwVersion) {
      const lastApiVersion = window.localStorage.getItem("last-api-version");
      if (lastApiVersion && lastApiVersion !== result.cwVersion) {
        // TODO - could show a user prompt rather than just refreshing?

        // TODO - Do we need to actually log the user out, in case there have been changes to the structure
        //  of the user object stored, and we need to get it again?  Or we could just re-fetch the user info before we reload?
        window.localStorage.setItem(
          "last-api-version",
          result.cwVersion.version
        );
        return window.location.reload();
      }
      delete result.cwVersion;
    }
  } else {
    result = await response.blob();
  }
  console.log(result);
  return {
    result,
    status: response.status,
    success: response.ok,
  };
}
