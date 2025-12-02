import {
  DEFAULT_AUTH_ID,
  type JwtToken, type JwtTokenPayload,
  type JwtUserAuthTokenPayload,
  type LoggedInDeviceCredentials,
  type LoggedInUserAuth, type LoggedInUserAuthDeserialized,
  type TestHandle,
} from "@typedefs/client/types.ts";
import { decodeJWT } from "@typedefs/client/utils.ts";
import apiClient from "@apiClient/api.ts";
import usersInit from "@apiClient/User.ts";
import projectsInit from "@apiClient/Project.ts";
import alertsInit from "@apiClient/Alert.ts";
import devicesInit from "@apiClient/Device.ts";
import recordingsInit from "@apiClient/Recording";
import locationsInit from "@apiClient/Location";
import monitoringInit from "@apiClient/Monitoring";
import classificationsInit from "@apiClient/Classifications.ts";
import { computed, reactive, ref, type Ref } from "vue";
import type { AuthId, UserId } from "@typedefs/api/common";
import { HttpStatusCode } from "@typedefs/api/consts.ts";
import { StorageSerializers, useLocalStorage, useStorage } from "@vueuse/core";
import User from "@apiClient/User.ts";
import type { LoggedInUser } from "@models/LoggedInUser.ts";

// Allows us to abort all pending fetch requests when switching between major views.
export const CurrentViewAbortController = {
  newView() {
    this.controller && this.controller.abort();
    this.controller = new AbortController();
  },
  controller: new AbortController(),
};

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

export const CurrentUser = computed<LoggedInUser | null>({
  get: () => {
    const storageKey = localStorageCredentials(DEFAULT_AUTH_ID);
    let storedUser = UserCreds.get(storageKey);
    if (!storedUser) {
      UserCreds.set(storageKey, useLocalStorage(storageKey, null, { serializer: authStorageSerializer }));
    }
    storedUser = UserCreds.get(storageKey);
    if (storedUser && storedUser.value) {
      return storedUser.value.userData;
    }
    return null;
  },
  set: (val: LoggedInUser | null) => {
    const ref = UserCreds.get(localStorageCredentials(DEFAULT_AUTH_ID));
    if (ref && ref.value) {
      if (val) {
        ref.value.userData = val;
      } else {
        // This gets set to null on sign-out, erase stored user.
        ref.value = null;
      }
    } else {
      console.error("Could not assign to current user credentials");
    }
  },
});

const UserCreds: Map<TestHandle, Ref<LoggedInUserAuthDeserialized | null>> = new Map();
const localStorageCredentials = (authKey: TestHandle | null) => `saved-login-credentials${authKey ? "-" : ""}${authKey}`;
const authStorageSerializer = {
  read: (raw: string): LoggedInUserAuthDeserialized | null => {
    try {
      const obj: LoggedInUserAuth = JSON.parse(raw);
      const decodedToken = decodeJWT(obj.apiToken);
      if (decodedToken) {
        obj.decodedToken = decodedToken as JwtUserAuthTokenPayload;
        return obj as LoggedInUserAuthDeserialized;
      }
    } catch (error) {/*...*/}
    return null;
  },
  write: (obj: LoggedInUserAuthDeserialized | null): string => {
    if (obj) {
      const shallowCopy = { ...obj } as LoggedInUserAuth;
      delete shallowCopy.decodedToken;
      return JSON.stringify(shallowCopy);
    } else {
      return JSON.stringify(obj);
    }
  },
};
const tokenTimeoutSafetyMarginMilliseconds = 5000;
const refreshingToken = ref<Promise<boolean> | null>(null);
const credentialsResolvers = {
  requestCredentialsResolver: async (authKey: TestHandle | null = DEFAULT_AUTH_ID): Promise<JwtToken<AuthId> | false> => {
    if (!authKey) {
      // We assume this is an endpoint that doesn't require a JWT token.
      return false;
    }
    // TODO: Cache the decoded token, and only decode it again on page reload.
    const storageKey = localStorageCredentials(authKey);
    if (!UserCreds.has(storageKey)) {
      UserCreds.set(storageKey, useLocalStorage(storageKey, null, { serializer: authStorageSerializer }));
    }
    const credentials = UserCreds.get(storageKey);
    if (!credentials || (credentials && !credentials.value)) {
      return false;
    } else if (credentials.value) {
      if (refreshingToken.value) {
        // Some other request is already refreshing the token.
        const refreshedToken = await refreshingToken.value;
        refreshingToken.value = null;
        if (!refreshedToken) {
          return false;
        }
        console.assert(credentials.value.decodedToken.expiresAt.getTime() > Date.now() + tokenTimeoutSafetyMarginMilliseconds);
      }
      if (credentials.value.decodedToken.expiresAt.getTime() < Date.now() + tokenTimeoutSafetyMarginMilliseconds) {
        // Token is about to expire, so refresh.
        refreshingToken.value = new Promise((resolve) => {
          if (credentials.value) {
            Users.refreshLogin(credentials.value.refreshToken).then(newCredentialsResponse => {
              if (credentials.value) {
                if (!newCredentialsResponse || !newCredentialsResponse.success) {
                  if (newCredentialsResponse.status === HttpStatusCode.Forbidden) {
                    // The refresh session token is invalid, so lets' clear out the credentials.
                    credentials.value = null;
                  }
                  return resolve(false);
                }
                if (newCredentialsResponse.success) {
                  let decodedToken: JwtUserAuthTokenPayload | null = null;
                  try {
                    decodedToken = decodeJWT(newCredentialsResponse.result.token) as JwtUserAuthTokenPayload;
                  } catch (e) {
                    credentials.value = null;
                    return resolve(false);
                  }
                  credentials.value.apiToken = newCredentialsResponse.result.token;
                  credentials.value.refreshToken = newCredentialsResponse.result.refreshToken;
                  credentials.value.decodedToken = decodedToken;
                  return resolve(true);
                }
              }
              return resolve(false);
            });
          } else {
            // No saved credentials, should trigger new login request
            return resolve(false);
          }
        });
        const refreshedToken = await refreshingToken.value;
        refreshingToken.value = null;
        if (!refreshedToken) {
          return false;
        }
      }
      // NOTE: Sometimes we want to run with a copy of the production database locally.
      //  In those cases, there are some API end-points for which we want to swap out
      //  the local API server for the actual production one, for instance, when we
      //  want to load a raw recording binary.  When we do that, we also need to have
      //  remote login credentials in addition to our local login credentials.

      return credentials.value.apiToken;
    }
    return false;
  },
  forgetCredentials: (authKey: TestHandle | null = null) => {
    // TODO
  },
  registerCredentials: (authKey: TestHandle, credentials: LoggedInUserAuth | LoggedInDeviceCredentials) => {
    // This happens on login, then is persisted.
    const storageKey = localStorageCredentials(authKey);
    if (!UserCreds.has(storageKey)) {
      UserCreds.set(storageKey, useLocalStorage(storageKey, null, { serializer: authStorageSerializer }));
    } else {
      (UserCreds.get(storageKey) as Ref<LoggedInUserAuthDeserialized | null>).value = {
        ...(credentials as LoggedInUserAuthDeserialized),
      };
    }
  },
  isDevEnvironment: () => {
    return import.meta.env.DEV;
  },
  // networkConnectionErrorHandler: {
  //   // eslint-disable-next-line no-undef
  //   retry: async (authKey: TestHandle | null, url: string, request: RequestInit) => {
  //     console.log("Would retry network connection in prod environment");
  //     // FIXME:
  //   },
  // },
  getApiRoot: () => {
    let apiRoot = import.meta.env.VITE_API;
    if (apiRoot === "CURRENT_HOST") {
      // In production, use whatever the current host is, since it should be proxying the api
      apiRoot = "";
    }
    return apiRoot;
  },
};

const api = apiClient(credentialsResolvers);
const Users = usersInit(api);
const Projects = projectsInit(api);
const Alerts = alertsInit(api);
const Devices = devicesInit(api);
const Classifications = classificationsInit(api);
const Recordings = recordingsInit(api);
const Locations = locationsInit(api);
const Monitoring = monitoringInit(api);


export const ClientApi = {
  Alerts,
  Classifications,
  Devices,
  Locations,
  Monitoring, // TODO: Rename to visits?
  Projects,
  Users,
  Recordings,
  registerCredentials: (authKey: TestHandle, creds: LoggedInDeviceCredentials | LoggedInUserAuth) => api.registerCredentials(authKey, creds),
  getCredentials: (authKey: TestHandle | null = null) => api.getCredentials(authKey),
  getApiRoot: () => api.getApiRoot(),
};
