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
import CacophonyApi from "./api";
import type { FetchResult } from "@api/types";

export const getAlertsForLocation = (
  locationId: LocationId
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return CacophonyApi.get(`/api/v1/alerts/station/${locationId}`) as Promise<
    FetchResult<{ alerts: ApiAlertResponse[] }>
  >;
};

export const getAlertsForCurrentUser = (): Promise<
  FetchResult<{ alerts: ApiAlertResponse[] }>
> => {
  return CacophonyApi.get(`/api/v1/alerts?view-mode=user`) as Promise<
    FetchResult<{ alerts: ApiAlertResponse[] }>
  >;
};

export const getAlertsForCurrentProject = (
  projectId: ProjectId
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return CacophonyApi.get(
    `/api/v1/alerts/project/${projectId}?view-mode=user`
  ) as Promise<FetchResult<{ alerts: ApiAlertResponse[] }>>;
};

export const removeAlert = (alertId: AlertId) => {
  return CacophonyApi.delete(`/api/v1/alerts/${alertId}`) as Promise<
    FetchResult<void>
  >;
};

export const createAlertForScope = (
  scope: "project" | "location" | "device",
  scopeId: ProjectId | LocationId | DeviceId,
  tags: string[],
  frequencySeconds: number
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
  console.log("create alert", body);
  return CacophonyApi.post(`/api/v1/alerts`, body, true) as Promise<
    FetchResult<{ id: AlertId }>
  >;
};
