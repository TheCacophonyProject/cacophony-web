import { FetchResult } from "@api/Recording.api";
import { AlertId, StationId } from "@typedefs/api/common";
import { ApiAlertResponse } from "@typedefs/api/alerts";
import CacophonyApi from "@api/CacophonyApi";

const getAlertsForStation = async (
  stationId: StationId
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return CacophonyApi.get(`/api/v1/alerts/station/${stationId}`);
};

const removeAlert = async (alertId: AlertId): Promise<FetchResult<void>> => {
  return CacophonyApi.delete(`/api/v1/alerts/${alertId}`);
};

const createAlertForStation = async (
  stationId: StationId,
  { name, species }: { name: string; species: string }
): Promise<FetchResult<{ alerts: ApiAlertResponse[] }>> => {
  return CacophonyApi.post(
    `/api/v1/alerts`,
    {
      name,
      conditions: [{ tag: species, automatic: true }],
      stationId,
    },
    true
  );
};

export default {
  getAlertsForStation,
  createAlertForStation,
  removeAlert,
};
