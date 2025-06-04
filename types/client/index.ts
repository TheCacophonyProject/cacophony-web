import apiClient from "./api";
import usersInit from "./User";
import projectsInit from "./Project";
import alertsInit from "./Alert";
import devicesInit from "./Device";
import classificationsInit from "./Classifications";
import recordingsInit from "./Recording";
import locationsInit from "./Location";
import monitoringInit from "./Monitoring";
import {
  JwtToken,
  LoggedInDeviceCredentials,
  LoggedInUserAuth,
  TestHandle,
} from "./types";
import { decodeJWT } from "./utils";
import type { DeviceId, UserId } from "../api/common";

const userCredentials = new Map<TestHandle, LoggedInUserAuth>();
const deviceCredentials = new Map<TestHandle, LoggedInDeviceCredentials>();

// TODO: Move these re-exports to integration-tests

// NOTE: Test specific resolvers here.  Browse would re-export with different resolvers.
const credentialsResolvers = {
  requestCredentialsResolver: async (authKey: TestHandle | null): Promise<JwtToken<(UserId | DeviceId)> | false> => {
    if (!authKey) {
      return false;
    }
    if (authKey.startsWith("user-")) {
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
        loggedInUserCredentials.refreshingToken = new Promise((resolve, reject) => {
          Users.withAuth(authKey).refreshLogin(loggedInUserCredentials.refreshToken).then(newCredentialsResponse => {
            loggedInUserCredentials.refreshingToken = null;
            if (!newCredentialsResponse || !newCredentialsResponse.success) {
              reject(false);
              return;
            }
            if (newCredentialsResponse.success) {
              loggedInUserCredentials.apiToken = newCredentialsResponse.result.token;
              loggedInUserCredentials.refreshToken = newCredentialsResponse.result.refreshToken;
            }
            resolve(true);
          });
        });
      }
      return loggedInUserCredentials.apiToken;
      // If not expiring in the next few seconds, use, otherwise refresh.
    } else if (authKey.startsWith("device-")) {
      const loggedInDeviceCredentials = deviceCredentials.get(authKey);
      if (!loggedInDeviceCredentials) {
        return false;
      }
      // Device credentials don't currently expire.
      return loggedInDeviceCredentials.token;
    }
  },
  forgetCredentials: (authKey: TestHandle) => {
    if (authKey.startsWith("user-")) {
      userCredentials.delete(authKey);
    } else if (authKey.startsWith("device-")) {
      deviceCredentials.delete(authKey);
    }
  },
  registerCredentials: (authKey: TestHandle, credentials: LoggedInUserAuth | LoggedInDeviceCredentials) => {
    if (authKey.startsWith("user-")) {
      userCredentials.set(authKey, credentials as LoggedInUserAuth);
    } else if (authKey.startsWith("device-")) {
      deviceCredentials.set(authKey, credentials as LoggedInDeviceCredentials);
    }
  },
  isDevEnvironment: () => false,
  // networkConnectionErrorHandler: {
  //   // eslint-disable-next-line no-undef
  //   retry: async (authKey: TestHandle | null, url: string, request: RequestInit) => {
  //     console.log("Would retry network connection in prod environment");
  //     // FIXME:
  //   },
  // },
  getApiRoot: () => {
    return "http://localhost:8000";
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

export const TestApi = {
  Alerts,
  Classifications,
  Devices,
  Locations,
  Monitoring, // TODO: Rename to visits?
  Projects,
  Users,
  Recordings,
  registerCredentials: (authKey: TestHandle, creds: LoggedInDeviceCredentials | LoggedInUserAuth) => api.registerCredentials(authKey, creds),
};
