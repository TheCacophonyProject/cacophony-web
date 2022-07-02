import { shouldViewAsSuperUser } from "@models/LoggedInUser";
import type { GroupId } from "@typedefs/api/common";
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
const getVisitsForGroup = async (
  groupId: GroupId,
  fromDate: Date,
  untilDate: Date
) => {
  const params = new URLSearchParams();
  params.append("groups", groupId.toString());
  params.append("from", fromDate.toISOString());
  params.append("until", untilDate.toISOString());
  params.append("page", "1"); // NOTE - since we alter the date range, page num is always 1
  params.append("page-size", "100");
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  return CacophonyApi.get(
    `/api/v1/monitoring/page?${params.toString()}`
  ) as Promise<FetchResult<VisitsQueryResult>>;
};

export const getAllVisitsForGroup = async (
  groupId: GroupId,
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
    const response = await getVisitsForGroup(groupId, fromDate, untilDate);
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
        if (numPagesEstimate !== 0) {
          progressUpdaterFn(requestNumber / numPagesEstimate);
        } else {
          progressUpdaterFn(1);
        }
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
  return {
    visits: returnVisits,
    all: !morePagesExist,
  };
};
