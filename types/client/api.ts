import { HttpStatusCode } from "../api/consts";
import type {
  FetchResult, JwtToken,
  LoadedResource, LoggedInDeviceCredentials, LoggedInUserAuth,
  TestHandle,
  WrappedFetchResult
} from "./types";
const CurrentViewAbortController = {
  newView() {
    this.controller && this.controller.abort();
    this.controller = new AbortController();
  },
  controller: new AbortController(),
};

import type { UserId, DeviceId } from "@typedefs/api/common";

// TODO - Handle getting all the revision information like the current version of browse does.

type HttpMethod = "POST" | "PATCH" | "DELETE" | "GET";

interface NetworkConnectionErrorHandler {
  // eslint-disable-next-line no-undef
  retry: <T>(authKey: TestHandle | null, url: string, request: RequestInit) => Promise<FetchResult<T>>;
}

/*
{
  // FIXME:
  stateResolvers.networkConnectionError.hasConnectionError = true;
  const delay = stateResolvers.networkConnectionError.retryInterval;
  if (stateResolvers.networkConnectionError.retryCount < MAX_RETRY_COUNT) {
    return (await delayMsThen(
      delay,
      () => {
        return cacophonyFetchWrapper(url, request);
      },
      networkConnectionError,
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
 */


interface RequestStateResolvers {
  // networkConnectionError: NetworkConnectionErrorSignal;
  ///networkConnectionErrorHandler: NetworkConnectionErrorHandler;
  requestCredentialsResolver: (authKey: TestHandle | null) => Promise<JwtToken<(UserId | DeviceId)> | false>;
  forgetCredentials: (authKey?: TestHandle | null) => void;
  isDevEnvironment: () => boolean;
  getApiRoot: () => string;
  registerCredentials: (authKey: TestHandle, credentials: LoggedInUserAuth | LoggedInDeviceCredentials) => void;
  //getCredentials: (authKey?: TestHandle | null) => Promise<JwtToken<UserId> | false>;
}

const getScreenOrientation = (): string => {
  if (window !== undefined && window.screen.orientation) {
    return window.screen.orientation?.type;
  } else if (window && typeof window.orientation !== "undefined") {
    if (Math.abs(window.orientation) == 90) {
      return "landscape";
    } else {
      return "portrait";
    }
  }
  return "unknown screen orientation";
};

/*
  if (stateResolvers.isDevEnvironment()) {
    // The page may have auto-reloaded, so we might need to refresh our credentials?

    // Don't we always want to run the credentials resolver regardless?
    await tryLoggingInRememberedUser(ref(true));
  }
 */

// const NON_AUTH_API_ENDPOINTS = [
//   "/api/v1/users/authenticate",
//   "/api/v1/users/validate-reset-token",
// ];

/**
 * Makes a request to the given url with default handling for cors and authentication.
 * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
 * The result field is the JSON blob from the response body.
 * These fields can easily be resolved using object destructuring to directly assign the required information.
 */
const cacophonyFetchWrapper = async <T>(
  authKey: TestHandle | null,
  url: string,
  // eslint-disable-next-line no-undef
  request: RequestInit = {},
  abortable = true,
  stateResolvers: RequestStateResolvers,
  retryHandler?: NetworkConnectionErrorHandler,
): Promise<FetchResult<T>> => {
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
  const credentials = await stateResolvers.requestCredentialsResolver(authKey);
  // Check if the credentials are stale?
  // If so, attempt to refresh them
  // Then use them
  if (credentials) { // Could this be derived from whether or not we have a valid token?
    (request.headers as Record<string, string>).Authorization = credentials;
  } else if (window !== undefined) {
    // Are we logging in?  Maybe check the route before adding these headers

    // During authentication/token refresh, we'll send the users screen resolution for analytics purposes
    (request.headers as Record<string, string>).Viewport = `${
      window.screen.width
    }x${window.screen.height}@${
      window.devicePixelRatio
    } - ${getScreenOrientation()}`;
  }
  let response: Response;
  if (!retryHandler) {
    //retryHandler = stateResolvers.networkConnectionErrorHandler.new(url, request);
  }
  try {
    response = await window.fetch(url, request);
    /*
    stateResolvers.networkConnectionError.retryInterval = INITIAL_RETRY_INTERVAL;
    stateResolvers.networkConnectionError.retryCount = 0;
    stateResolvers.networkConnectionError.hasConnectionError = false;
     */

    // There should really be one of these per request, right?
// TODO: Check where we have authorization errors.  Is it only when jwt creds fail?
    // If we have an authorization error,

    // !NON_AUTH_API_ENDPOINTS.some((route) => response.url.endsWith(route))

    if (response.status === HttpStatusCode.AuthorizationError) {
      stateResolvers.forgetCredentials(authKey);
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
      Array.from(response.headers.entries()) as [string, string][]
    ).find(
      ([key, val]: [string, string]) =>
        key.toLowerCase() === "content-type" &&
        val.toLowerCase().includes("application/json"),
    );
    let result;
    if (isJSON) {
      // FIXME: Can this fail?  Check if we need try/catch
      result = await response.json();
      // TODO: Check where we return forbidden, and consider whether the front-end should actually log out for those cases.
      // FIXME:(auth): We should handle this elsewhere?
      if (
        response.status === HttpStatusCode.Forbidden &&
        result.errorType === "authorization" &&
        !response.url.endsWith("/api/v1/users/authenticate") &&
        !response.url.endsWith("/api/v1/users/refresh-session-token")
      ) {
        stateResolvers.forgetCredentials(authKey);
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
            result.cwVersion.version,
          );
          window.location.reload();
        }
        delete result.cwVersion;
      }
    } else {
      result = await response.blob();
    }
    return {
      result,
      status: response.status,
      success: response.ok,
    };
  } catch (e: Error | unknown) {
    if ((e as Error).name === "AbortError") {
      console.warn(
        "!! Abort, abort",
        e,
        (e as Error).name,
        url,
        request.signal,
      );
      return {
        result: {
          errors: ["Request aborted before fulfillment"],
          messages: ["Aborted by user"],
          errorType: "Client",
        },
        status: HttpStatusCode.BadRequest,
        success: false,
      };
    }
    // TODO: Work out what kind of error fetch throws on no connection, or server not responding etc.
    // Some other kind of connection error?
    // return retryHandler.retry(url, request);
  }

  return {
    result: {
      errors: ["Unreachable code"],
      messages: ["Unreachable code"],
      errorType: "Client",
    },
    status: HttpStatusCode.BadRequest,
    success: false,
  };
};

export interface CacophonyApiClient {
  get: (authKey: TestHandle | null, endpoint: string, abortable?: boolean) => Promise<FetchResult<unknown>>;
  post: (authKey: TestHandle | null, endpoint: string, body?: object, abortable?: boolean) => Promise<FetchResult<unknown>>;
  patch: (authKey: TestHandle | null, endpoint: string, body?: object, abortable?: boolean) => Promise<FetchResult<unknown>>;
  delete: (authKey: TestHandle | null, endpoint: string, body?: object, abortable?: boolean) => Promise<FetchResult<unknown>>;
  registerCredentials: (authKey: TestHandle, credentials: LoggedInUserAuth | LoggedInDeviceCredentials) => void;
  getCredentials: (authKey: TestHandle | null) => Promise<JwtToken<UserId | DeviceId> | false>;
  getApiRoot: () => string;
}

// Should this become a class?  Maybe.
class CacophonyApi {
  constructor(public credentialsResolver: RequestStateResolvers) {}

  url(endpoint: string) {
    if (endpoint.startsWith("https://") || endpoint.startsWith("http://")) {
      return endpoint;
    }
    const separator = endpoint.startsWith("/") ? "" : "/";
    return `${this.getApiRoot()}${separator}${endpoint}`;
  }

  async get(authKey: TestHandle | null, endpoint: string, abortable: boolean = false) {
    return cacophonyFetchWrapper(authKey, this.url(endpoint), { method: "GET" }, abortable, this.credentialsResolver);
  }

  async post(authKey: TestHandle | null, endpoint: string, body?: object, abortable: boolean = false) {
    if (body && typeof body === "object" && (body instanceof ArrayBuffer || body instanceof FormData)) {
      return cacophonyFetchWrapper(authKey, this.url(endpoint), { method: "POST", body }, abortable, this.credentialsResolver);
    }
    return fetchCacophonyJsonWithMethod(authKey, this.url(endpoint), "POST", this.credentialsResolver, body, abortable);
  }

  async patch(authKey: TestHandle | null, endpoint: string, body?: object, abortable: boolean = false) {
    return fetchCacophonyJsonWithMethod(authKey, this.url(endpoint), "PATCH", this.credentialsResolver, body, abortable);
  }

  async delete(authKey: TestHandle | null, endpoint: string, body?: object, abortable: boolean = false) {
    return fetchCacophonyJsonWithMethod(authKey, this.url(endpoint), "DELETE", this.credentialsResolver, body, abortable );
  }

  registerCredentials(authKey: TestHandle, credentials: LoggedInUserAuth | LoggedInDeviceCredentials): void {
    this.credentialsResolver.registerCredentials(authKey, credentials);
  }

  getCredentials(authKey: TestHandle | null): Promise<JwtToken<UserId> | false> {
    return this.credentialsResolver.requestCredentialsResolver(authKey);
  }

  getApiRoot() {
    return this.credentialsResolver.getApiRoot();
  }
}

const fetchCacophonyJsonWithMethod = async (
  authKey: TestHandle | null,
  endpoint: string,
  method: HttpMethod,
  stateResolvers: RequestStateResolvers,
  body?: object,
  abortable?: boolean,
): Promise<FetchResult<unknown>> => {
  const payload = {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    // eslint-disable-next-line no-undef
  } as RequestInit;
  if (body) {
    payload.body = JSON.stringify(body);
  }
  return cacophonyFetchWrapper(authKey, endpoint, payload, abortable, stateResolvers);
};

export const optionalQueryString = (params: URLSearchParams) => {
  if (Array.from(params.entries()).length) {
    return `?${params}`;
  }
  return "";
};

export const unwrapLoadedResource = <T>(
  apiCall: Promise<WrappedFetchResult<T>>,
  responseKey: string,
): Promise<LoadedResource<T>> => {
  return new Promise((resolve) => {
    apiCall.then((response) => {
      if (response && response.success) {
        resolve((response.result as never)[responseKey] as T);
      } else {
        resolve(false);
      }
    });
  });
};

export default (credentialsResolvers: RequestStateResolvers): CacophonyApiClient => {
  return new CacophonyApi(credentialsResolvers);
};
