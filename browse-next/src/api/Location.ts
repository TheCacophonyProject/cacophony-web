import CacophonyApi, { unwrapLoadedResource } from "./api";
import type { IsoFormattedDateString, LatLng } from "@typedefs/api/common";
import type {
  GroupId as ProjectId,
  StationId as LocationId,
} from "@typedefs/api/common";
import type { FetchResult, LoadedResource } from "@api/types.ts";

export const createNewLocationForProject = async (
  projectNameOrId: string | ProjectId,
  locationName: string,
  location: LatLng,
  automatic = false,
  applyFromDate?: Date,
  applyUntilDate?: Date,
): Promise<LoadedResource<{ locationId: LocationId }>> => {
  const payload: {
    station: string;
    ["from-date"]?: IsoFormattedDateString;
    ["until-date"]?: IsoFormattedDateString;
    automatic?: boolean;
  } = {
    station: JSON.stringify({
      name: locationName,
      lng: location.lng,
      lat: location.lat,
    }),
  };
  if (automatic) {
    payload.automatic = true;
  }
  if (applyFromDate) {
    payload["from-date"] = applyFromDate.toISOString();
    if (applyUntilDate) {
      payload["until-date"] = applyUntilDate.toISOString();
    }
  }
  return new Promise((resolve, reject) => {
    return CacophonyApi.post(
      `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/station`,
      payload
    ).then((result) => {
      const thisResult = result as FetchResult<{ stationId: LocationId }>;
      if (thisResult.success) {
        resolve({ locationId: thisResult.result.stationId });
      } else {
        reject(false);
      }
    });
  });
};
