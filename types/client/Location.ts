import CacophonyApi, { type CacophonyApiClient } from "./api";
import type { IsoFormattedDateString, LatLng } from "@typedefs/api/common";
import type {
  GroupId as ProjectId,
  StationId as LocationId,
} from "@typedefs/api/common";
import { DEFAULT_AUTH_ID, type FetchResult, type LoadedResource, type TestHandle } from "./types";

const createNewLocationForProject = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
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
    return api.post(authKey,
      `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/station`,
      payload,
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

const changeLocationName = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (newName: string, locationId: LocationId) => {
  return api.patch(authKey, `/api/v1/stations/${locationId}`, {
    "station-updates": {
      name: newName,
    },
  }) as Promise<FetchResult<unknown>>;
};

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    createNewLocationForProject: createNewLocationForProject(api),
    changeLocationName: changeLocationName(api),
    withAuth: (authKey: TestHandle) => ({
      createNewLocationForProject: createNewLocationForProject(api, authKey),
      changeLocationName: changeLocationName(api, authKey),
    }),
  };
};
