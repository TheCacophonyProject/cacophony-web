import { FetchResult } from "@api/Recording.api";
import { ApiStationResponse } from "@typedefs/api/station";
import CacophonyApi from "@api/CacophonyApi";
import { shouldViewAsSuperUser } from "@/utils";
import { StationId } from "@typedefs/api/common";

export const getStations = (
  activeAndInactive = false
): Promise<FetchResult<{ stations: ApiStationResponse[] }>> => {
  return CacophonyApi.get(
    `/api/v1/stations?${
      shouldViewAsSuperUser()
        ? `only-active=${activeAndInactive ? "false" : "true"}`
        : `view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
};

function updateStationWithId(
  stationId: StationId,
  updates: { name?: string; lat?: number; lng?: number },
  applyFromDate?: Date,
  applyUntilDate?: Date,
  retire?: boolean
): Promise<FetchResult<{ station: ApiStationResponse }>> {
  const payload: {
    "station-updates": string;
    fromDate?: string;
    untilDate?: string;
    retire?: boolean;
  } = {
    "station-updates": JSON.stringify(updates),
  };
  if (applyFromDate) {
    payload["from-date"] = applyFromDate.toISOString();
    if (applyUntilDate) {
      payload["until-date"] = applyUntilDate.toISOString();
    }
  }
  if (retire) {
    payload.retire = true;
  }
  return CacophonyApi.patch(`/api/v1/stations/${stationId}`, payload);
}

function getStationById(
  stationId: StationId
): Promise<FetchResult<{ station: ApiStationResponse }>> {
  return CacophonyApi.get(`/api/v1/stations/${stationId}`);
}

function deleteStationById(stationId: StationId): Promise<FetchResult<{}>> {
  return CacophonyApi.delete(`/api/v1/stations/${stationId}`);
}

function retireStationById(stationId: StationId): Promise<FetchResult<{}>> {
  return updateStationWithId(stationId, {}, undefined, undefined, true);
}

function renameStationById(
  stationId: StationId,
  name: string
): Promise<FetchResult<{}>> {
  return updateStationWithId(stationId, {
    name,
  });
}

export default {
  getStations,
  updateStationWithId,
  getStationById,
  deleteStationById,
  retireStationById,
  renameStationById,
};
