import apiClient from "./api.js";
import usersInit from "./User.js";
import projectsInit from "./Project.js";
import alertsInit from "./Alert.js";
import devicesInit from "./Device.js";
import classificationsInit from "./Classifications.js";
import recordingsInit from "./Recording.js";
import locationsInit from "./Location.js";
import monitoringInit from "./Monitoring.js";
import visitsInit from "./Visits.js";
import {
  FetchResult,
  JwtToken,
  LoggedInDeviceCredentials,
  LoggedInUserAuth,
  TestHandle,
} from "./types.js";
import { decodeJWT } from "./utils.js";
import type { DeviceId, UserId } from "../api/common.js";
import { HttpStatusCode } from "../api/consts.js";

const userCredentials = new Map<TestHandle, LoggedInUserAuth>();
const deviceCredentials = new Map<TestHandle, LoggedInDeviceCredentials>();

// TODO: Move these re-exports to integration-tests

// NOTE: Test specific resolvers here.  Browse would re-export with different resolvers.
const credentialsResolvers = {
  requestCredentialsResolver: async (
    authKey: TestHandle | null,
  ): Promise<JwtToken<UserId | DeviceId> | false> => {
    if (!authKey) {
      return false;
    }
    if (authKey.startsWith("cy_user-")) {
      const loggedInUserCredentials = userCredentials.get(authKey);
      if (!loggedInUserCredentials) {
        return false;
      }
      // Decode the creds and make sure they're current:
      const apiToken = decodeJWT(loggedInUserCredentials.apiToken);
      if (apiToken === null || (apiToken && apiToken._type !== "user")) {
        return false;
      }
      if (loggedInUserCredentials.refreshingToken) {
        // Some other request is already refreshing the token.
        await loggedInUserCredentials.refreshingToken;
      }
      if ((apiToken.expiresAt as Date).getTime() < Date.now() + 5000) {
        // Token is about to expire, so refresh.
        loggedInUserCredentials.refreshingToken = new Promise(
          (resolve, reject) => {
            Users.withAuth(authKey)
              .refreshLogin(loggedInUserCredentials.refreshToken)
              .then((newCredentialsResponse) => {
                delete loggedInUserCredentials.refreshingToken;
                if (
                  !newCredentialsResponse ||
                  !newCredentialsResponse.success
                ) {
                  reject(false);
                  return;
                }
                if (newCredentialsResponse.success) {
                  loggedInUserCredentials.apiToken =
                    newCredentialsResponse.result.token;
                  loggedInUserCredentials.refreshToken =
                    newCredentialsResponse.result.refreshToken;
                }
                resolve(true);
              });
          },
        );
      }
      return loggedInUserCredentials.apiToken;
      // If not expiring in the next few seconds, use, otherwise refresh.
    } else if (authKey.startsWith("cy_device-")) {
      const loggedInDeviceCredentials = deviceCredentials.get(authKey);
      if (!loggedInDeviceCredentials) {
        return false;
      }
      // Device credentials don't currently expire.
      return loggedInDeviceCredentials.token;
    }
    return false;
  },
  forgetCredentials: (authKey?: TestHandle | null) => {
    if (authKey) {
      if (authKey.startsWith("cy_user-")) {
        userCredentials.delete(authKey);
      } else if (authKey.startsWith("cy_device-")) {
        deviceCredentials.delete(authKey);
      }
    }
  },
  registerCredentials: (
    authKey: TestHandle,
    credentials: LoggedInUserAuth | LoggedInDeviceCredentials,
  ) => {
    if (authKey.startsWith("cy_user-")) {
      userCredentials.set(authKey, credentials as LoggedInUserAuth);
    } else if (authKey.startsWith("cy_device-")) {
      deviceCredentials.set(authKey, credentials as LoggedInDeviceCredentials);
    }
  },
  isDevEnvironment: () => false,
  networkConnectionErrorHandler: {
    retry: async (
      _authKey: TestHandle | null,
      _url: string,
      _request: RequestInit,
    ): Promise<FetchResult<unknown>> => {
      console.log("Would retry network connection in prod environment");
      return new Promise<FetchResult<unknown>>((resolve, _reject) => {
        resolve({ success: true, result: null, status: HttpStatusCode.Ok });
      });
      // FIXME:
    },
  },
  getApiRoot: () => {
    // FIXME: Use Cy.env var if present.
    return "http://localhost:1080";
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
const Visits = visitsInit(api);

const _Users = usersInit(api).withAuth("");
const _Projects = projectsInit(api).withAuth("");
const _Alerts = alertsInit(api).withAuth("");
const _Devices = devicesInit(api).withAuth("");
const _Recordings = recordingsInit(api).withAuth("");
const _Locations = locationsInit(api).withAuth("");
const _Monitoring = monitoringInit(api).withAuth("");
const _Visits = visitsInit(api).withAuth("");

export interface TestApi {
  Alerts: typeof _Alerts;
  Classifications: typeof Classifications;
  Devices: typeof _Devices;
  Locations: typeof _Locations;
  Monitoring: typeof _Monitoring;
  Projects: typeof _Projects;
  Users: typeof _Users;
  Recordings: typeof _Recordings;
  Visits: typeof _Visits;
}

const withAuth = (authKey: TestHandle): TestApi => ({
  Alerts: Alerts.withAuth(authKey),
  Classifications,
  Devices: Devices.withAuth(authKey),
  Locations: Locations.withAuth(authKey),
  Monitoring: Monitoring.withAuth(authKey),
  Projects: Projects.withAuth(authKey),
  Users: Users.withAuth(authKey),
  Recordings: Recordings.withAuth(authKey),
  Visits: Visits.withAuth(authKey),
});

export const TestApiImpl = {
  Alerts,
  Classifications,
  Devices,
  Locations,
  Monitoring, // TODO: Rename to visits?
  Projects,
  Users,
  Recordings,
  Visits,
  registerCredentials: (
    authKey: TestHandle,
    creds: LoggedInDeviceCredentials | LoggedInUserAuth,
  ) => api.registerCredentials(authKey, creds),
  getCredentials: (authKey: TestHandle) => api.getCredentials(authKey),
  withAuth: (authKey: TestHandle) => withAuth(authKey),
};
