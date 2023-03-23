import { shouldViewAsSuperUser } from "@models/LoggedInUser";
import type { GroupId as ProjectId, StationId as LocationId } from "@typedefs/api/common";
import type { FetchResult } from "@api/types";
import CacophonyApi from "./api";
import type {
  ApiVisitResponse,
  MonitoringPageCriteria,
} from "@typedefs/api/monitoring";

export interface VisitsQueryResult {
  statusCode: number;
  visits: ApiVisitResponse[];
  params: MonitoringPageCriteria;
}
export type ProgressUpdater = (progress: number) => void;
export const getVisitsForProject = async (
  projectId: ProjectId,
  fromDate: Date,
  untilDate: Date,
  limit = 100,
  locations?: LocationId[]
) => {
  const params = new URLSearchParams();
  params.append("groups", projectId.toString());
  params.append("from", fromDate.toISOString());
  params.append("until", untilDate.toISOString());
  params.append("page", "1"); // NOTE - since we alter the date range, page num is always 1
  params.append("page-size", limit.toString());
  if (!shouldViewAsSuperUser.value) {
    params.append("view-mode", "user");
  }
  return (await CacophonyApi.get(
    `/api/v1/monitoring/page?${params}`
  )) as FetchResult<VisitsQueryResult>;
};

// Load *all* of a date range at once.
export const getAllVisitsForProject = async (
  projectId: ProjectId,
  numDays: number,
  progressUpdaterFn?: ProgressUpdater // progress updates caller with how far through the request it is[0, 1]
): Promise<{
  visits: ApiVisitResponse[];
  all: boolean;
}> => {
  const returnVisits: ApiVisitResponse[] = [];
  let morePagesExist = true;
  let requestNumber = 0;
  const now = new Date();
  let untilDate = new Date(now);
  const fromDate = new Date(
    new Date(now).setDate(new Date(now).getDate() - numDays)
  );
  let numPagesEstimate = 0;
  while (morePagesExist && requestNumber < 100) {
    // We only allow up to 100 pages...
    requestNumber++;
    const response = await getVisitsForProject(projectId, fromDate, untilDate);
    if (response && response.success) {
      const {
        result: {
          visits,
          params: { pagesEstimate, pageFrom },
        },
      } = response;
      if (requestNumber === 1) {
        numPagesEstimate = pagesEstimate;
      }
      returnVisits.push(...visits);
      morePagesExist = pagesEstimate > 1;
      if (progressUpdaterFn) {
        // Handle dividing by Infinity
        progressUpdaterFn(Math.min(1, requestNumber / numPagesEstimate));
      }
      if (!pageFrom) {
        break;
      }
      if (morePagesExist) {
        untilDate = new Date(pageFrom);
      }
    } else if (response && !response.success) {
      break;
    }
  }

  // Make sure visits are in chronological order from oldest to newest
  returnVisits.sort((a, b) => {
    return new Date(a.timeStart).getTime() - new Date(b.timeStart).getTime();
  });

  return {
    visits: returnVisits,
    all: !morePagesExist,
  };
};
