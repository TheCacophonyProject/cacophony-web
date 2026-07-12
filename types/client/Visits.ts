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
    locations: LocationId[] = [],
    maxResults?: number,
    abortable = false,
  ) => {
    const params = new URLSearchParams();
    params.append("from", fromDate.toISOString());
    params.append("until", untilDate.toISOString());
    if (locations && locations.length) {
      for (const location of locations) {
        params.append("locations", location.toString());
      }
    }
    if (maxResults) {
      params.append("max-results", maxResults.toString());
    }
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/visits/for-project/${projectId}?${params}`,
        abortable,
      ) as Promise<
        FetchResult<{
          visits: ApiStaticVisitResponse[];
        }>
      >,
      "visits",
    );
  };

const getVisitsCountForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectId: ProjectId,
    fromDate: Date,
    untilDate: Date,
    locations: LocationId[] = [],
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
        `/api/v1/visits/for-project/${projectId}/count?${params}`,
      ) as Promise<
        FetchResult<{
          count: number;
        }>
      >,
      "count",
    );
  };

const getAllVisitsForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  async (
    projectId: ProjectId,
    fromDate: Date,
    untilDate: Date,
    locations: LocationId[] = [],
    maxResults = 10000,
    progressUpdater?: (progress: number) => void,
  ) => {
    // Maybe we want to query the total number of visits for this query first?
    const visitsTotalCount =
      (await getVisitsCountForProject(api, authKey)(
        projectId,
        fromDate,
        untilDate,
        locations,
      )) || 0;
    const getVisitsForProjectFn = getVisitsForProject(api, authKey);
    const visits = [];
    let until = new Date(untilDate);
    while (true) {
      const visitsResponse = await getVisitsForProjectFn(
        projectId,
        fromDate,
        until,
        locations,
        maxResults,
      );
      if (!visitsResponse || visitsResponse.length === 0) {
        break;
      }
      visits.push(...visitsResponse);
      until = new Date(visitsResponse[visitsResponse.length - 1].endTime);
      if (progressUpdater) {
        progressUpdater(visits.length / visitsTotalCount);
      }
      if (visits.length >= visitsTotalCount) {
        break;
      }
    }
    return visits;
  };

const getVisitsForRecording =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recordingId: RecordingId) => {
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/visits/for-recording/${recordingId}`,
      ) as Promise<FetchResult<{ visits: ApiStaticVisitResponse[] }>>,
      "visits",
    );
  };

export default (api: CacophonyApiClient) => {
  return {
    getVisitsForProject: getVisitsForProject(api),
    getAllVisitsForProject: getAllVisitsForProject(api),
    getVisitsCountForProject: getVisitsCountForProject(api),
    getVisitsForRecording: getVisitsForRecording(api),
    withAuth: (authKey: TestHandle) => ({
      getVisitsForProject: getVisitsForProject(api, authKey),
      getAllVisitsForProject: getAllVisitsForProject(api, authKey),
      getVisitsCountForProject: getVisitsCountForProject(api, authKey),
      getVisitsForRecording: getVisitsForRecording(api, authKey),
    }),
  };
};
