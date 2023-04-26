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

function getStationCacophonyIndex(
  stationId: StationId,
  from: string,
  windowsize: Number,
  activeAndInactive = false
): Promise<FetchResult<{ cacophonyIndex: number }>> {
  return CacophonyApi.get(`/api/v1/stations/${stationId}/cacophony-index?from=${from}&window-size=${windowsize}${
    shouldViewAsSuperUser()
      ? `&only-active=${activeAndInactive ? "false" : "true"}`
      : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
  }`);
}

function getStationCacophonyIndexBulk(
  id: StationId,
  from: String,
  steps: Number,
  interval: String,
  activeAndInactive = false
): Promise<FetchResult<{ cacophonyIndexBulk : Object }>> {
return CacophonyApi.get(
  `/api/v1/stations/${id}/cacophony-index-bulk?from=${from}&steps=${steps}&interval=${interval}${
    shouldViewAsSuperUser()
      ? `&only-active=${activeAndInactive ? "false" : "true"}`
      : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
  }`
)
}



function getStationSpeciesCount(
  stationId: StationId,
  from: String,
  windowsize: Number,
  activeAndInactive = false,
  recordingType = "audio"
): Promise<FetchResult<{ speciesCount: Object }>> {
  return CacophonyApi.get(
    `/api/v1/stations/${stationId}/species-count?from=${from}&window-size=${windowsize}&type=${recordingType}${
      shouldViewAsSuperUser()
        ? `&only-active=${activeAndInactive ? "false" : "true"}`
        : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  )
}

function getStationSpeciesCountBulk(
  stationId: StationId,
  from: String,
  steps: Number,
  interval: String,
  activeAndInactive = false,
  recordingType = "audio"
): Promise<FetchResult<{ cacophonyIndexBulk : Object }>> {
  console.log(`stationId: ${stationId}`)
  return CacophonyApi.get(
    `/api/v1/stations/${stationId}/species-count-bulk?from=${from}&steps=${steps}&interval=${interval}&type=${recordingType}${
      shouldViewAsSuperUser()
        ? `&only-active=${activeAndInactive ? "false" : "true"}`
        : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  )
}


function uploadReferenceImage(
  stationId: StationId,
  imageData: Blob
): Promise<FetchResult<{ fileKey: string }>> {
  const data = new FormData();
  data.set("data", JSON.stringify({}));
  data.set("file", imageData);
  return CacophonyApi.postMultipartFormData(
    `/api/v1/stations/${stationId}/reference-photo`,
    data
  );
}

function getReferenceImage(
  stationId: StationId,
  key: string
): Promise<FetchResult<any>> {
  return CacophonyApi.getBinary(
    `/api/v1/stations/${stationId}/reference-photo/${key.replace(/\//g, "_")}`
  );
}
function deleteReferenceImage(
  stationId: StationId,
  key: string
): Promise<FetchResult<any>> {
  return CacophonyApi.delete(
    `/api/v1/stations/${stationId}/reference-photo/${key.replace(/\//g, "_")}`
  );
}

export default {
  getStations,
  updateStationWithId,
  getStationById,
  deleteStationById,
  retireStationById,
  renameStationById,
  uploadReferenceImage,
  getReferenceImage,
  deleteReferenceImage,
  getStationCacophonyIndex,
  getStationCacophonyIndexBulk,
  getStationSpeciesCount,
  getStationSpeciesCountBulk
};
