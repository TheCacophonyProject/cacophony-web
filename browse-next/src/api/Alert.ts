import type { AlertId, StationId } from "@typedefs/api/common";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import CacophonyApi from "./api";
import type { FetchResult } from "@api/types";

export const getAlertsForStation = (
  stationId: StationId
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return CacophonyApi.get(`/api/v1/alerts/station/${stationId}`) as Promise<
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

export const removeAlert = (alertId: AlertId) => {
  return CacophonyApi.delete(`/api/v1/alerts/${alertId}`) as Promise<
    FetchResult<void>
  >;
};

export const createAlertForStation = (
  stationId: StationId,
  { name, species }: { name: string; species: string }
) => {
  return CacophonyApi.post(
    `/api/v1/alerts`,
    {
      name,
      conditions: [{ tag: species, automatic: true }],
      stationId,
    },
    true
  ) as Promise<FetchResult<{ id: AlertId }>>;
};
