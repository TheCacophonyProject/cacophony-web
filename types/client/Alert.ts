import type {
  AlertId,
  DeviceId,
  GroupId as ProjectId,
  StationId as LocationId,
} from "@typedefs/api/common";
import type {
  ApiAlertResponse,
  ApiPostAlertRequestBody,
} from "@typedefs/api/alerts";
import { type CacophonyApiClient } from "./api";
import { DEFAULT_AUTH_ID, type FetchResult, type TestHandle } from "./types";

export const getAlertsForLocation = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  locationId: LocationId,
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return api.get(authKey, `/api/v1/alerts/station/${locationId}`) as Promise<
    FetchResult<{ alerts: ApiAlertResponse[] }>
  >;
};

export const getAlertsForCurrentUser = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (): Promise<
  FetchResult<{ alerts: ApiAlertResponse[] }>
> => {
  return api.get(authKey, `/api/v1/alerts?view-mode=user`) as Promise<
    FetchResult<{ alerts: ApiAlertResponse[] }>
  >;
};

export const getAlertsForCurrentProject = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  projectId: ProjectId,
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return api.get(
    authKey, `/api/v1/alerts/project/${projectId}?view-mode=user`,
  ) as Promise<FetchResult<{ alerts: ApiAlertResponse[] }>>;
};

export const removeAlert = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (alertId: AlertId) => {
  return api.delete(authKey, `/api/v1/alerts/${alertId}`) as Promise<
    FetchResult<void>
  >;
};

export const createAlertForScope = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  scope: "project" | "location" | "device",
  scopeId: ProjectId | LocationId | DeviceId,
  tags: string[],
  frequencySeconds: number,
) => {
  const body: ApiPostAlertRequestBody = {
    name: `${scope}_${scopeId}__${tags.join("_")}`, // We don't really use name in the UI.
    conditions: tags.map((tag) => ({ tag, automatic: true })),
    frequencySeconds,
  };
  if (scope === "project") {
    body.projectId = scopeId;
  } else if (scope === "location") {
    body.stationId = scopeId;
  } else if (scope === "device") {
    body.deviceId = scopeId;
  }
  return api.post(authKey, `/api/v1/alerts`, body, true) as Promise<
    FetchResult<{ id: AlertId }>
  >;
};

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    getAlertsForLocation: getAlertsForLocation(api),
    getAlertsForCurrentUser: getAlertsForCurrentUser(api),
    getAlertsForCurrentProject: getAlertsForCurrentProject(api),
    removeAlert: removeAlert(api),
    createAlertForScope: createAlertForScope(api),
    withAuth: (authKey: TestHandle) => ({
      getAlertsForLocation: getAlertsForLocation(api, authKey),
      getAlertsForCurrentUser: getAlertsForCurrentUser(api, authKey),
      getAlertsForCurrentProject: getAlertsForCurrentProject(api, authKey),
      removeAlert: removeAlert(api, authKey),
      createAlertForScope: createAlertForScope(api, authKey),
    }),
  };
};
