import { unwrapLoadedResource } from "./api.js";
import type { IsoFormattedDateString, LatLng } from "../api/common.js";
import type {
  GroupId as ProjectId,
  StationId as LocationId,
} from "../api/common.js";
import type { FetchResult, LoadedResource, TestHandle } from "./types.js";
import { DEFAULT_AUTH_ID } from "./types.js";
import type { CacophonyApiClient } from "./api.js";
import type { ApiStationResponse } from "../api/station.js";

const createNewLocationForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
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
      return api
        .post(
          authKey,
          `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/station`,
          payload,
        )
        .then((result) => {
          const thisResult = result as FetchResult<{ stationId: LocationId }>;
          if (thisResult.success) {
            resolve({ locationId: thisResult.result.stationId });
          } else {
            reject(false);
          }
        });
    });
  };

const changeLocationName =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (locationId: LocationId, newName: string) => {
    return api.patch(authKey, `/api/v1/stations/${locationId}`, {
      "station-updates": {
        name: newName,
      },
    }) as Promise<FetchResult<unknown>>;
  };

const changeLocationNameAndFromDateTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (locationId: LocationId, newName: string, fromDateTime: Date) => {
    return api.patch(authKey, `/api/v1/stations/${locationId}`, {
      "station-updates": {
        name: newName,
        "from-date": fromDateTime.toISOString(),
      },
    }) as Promise<FetchResult<unknown>>;
  };

const getLocationById =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (locationId: LocationId): Promise<LoadedResource<ApiStationResponse>> => {
    return unwrapLoadedResource(
      api.get(authKey, `/api/v1/stations/${locationId}`) as Promise<
        FetchResult<{ station: ApiStationResponse }>
      >,
      "station",
    );
  };

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    createNewLocationForProject: createNewLocationForProject(api),
    changeLocationName: changeLocationName(api),
    changeLocationNameAndFromDateTime: changeLocationNameAndFromDateTime(api),
    getLocationById: getLocationById(api),
    withAuth: (authKey: TestHandle) => ({
      createNewLocationForProject: createNewLocationForProject(api, authKey),
      changeLocationName: changeLocationName(api, authKey),
      changeLocationNameAndFromDateTime: changeLocationNameAndFromDateTime(
        api,
        authKey,
      ),
      getLocationById: getLocationById(api, authKey),
    }),
  };
};
