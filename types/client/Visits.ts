import { CacophonyApiClient, unwrapLoadedResource } from "./api.js";
import { DEFAULT_AUTH_ID, TestHandle } from "./types.js";
import type { FetchResult } from "./types.js";
import type {
  GroupId as ProjectId,
  RecordingId,
  StationId as LocationId,
} from "../api/common.js";
import { ApiStaticVisitResponse } from "../api/visit.js";

const getVisitsForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectId: ProjectId,
    fromDate: Date,
    untilDate: Date,
    locations?: LocationId[],
    progressUpdater?: (progress: number) => void,
  ) => {
    const params = new URLSearchParams();
    params.append("from", fromDate.toISOString());
    params.append("until", untilDate.toISOString());
    if (locations && locations.length) {
      for (const location of locations) {
        params.append("locations", location.toString());
      }
    }
    // FIXME: Get *all* visits in the range, updating the progress updater until we're done.
    // Probably make it into its own helper function I guess
    const visits = [];
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/visits/for-project/${projectId}?${params}`,
      ) as Promise<
        FetchResult<{
          visits: ApiStaticVisitResponse[];
        }>
      >,
      "visits",
    );
  };

const getVisitsForLocation =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    locationId: LocationId,
    fromDate: Date,
    untilDate: Date,
    locations?: LocationId[],
  ) => {
    const params = new URLSearchParams();
    params.append("from", fromDate.toISOString());
    params.append("until", untilDate.toISOString());
    if (locations && locations.length) {
      for (const location of locations) {
        params.append("locations", location.toString());
      }
    }
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/visits/for-location/${locationId}?${params}`,
      ) as Promise<FetchResult<{ visits: ApiStaticVisitResponse[] }>>,
      "visits",
    );
  };

const getVisitsForRecording =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recordingId: RecordingId) => {
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/visits/for-recording/${recordingId}`,
      ) as Promise<FetchResult<{ visit: ApiStaticVisitResponse }>>,
      "visit",
    );
  };

export default (api: CacophonyApiClient) => {
  return {
    forProject: getVisitsForProject(api),
    forLocation: getVisitsForLocation(api),
    forRecording: getVisitsForRecording(api),
    withAuth: (authKey: TestHandle) => ({
      forProject: getVisitsForProject(api, authKey),
      forLocation: getVisitsForLocation(api, authKey),
      forRecording: getVisitsForRecording(api, authKey),
    }),
  };
};
