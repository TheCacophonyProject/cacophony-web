import { shouldViewAsSuperUser } from "@models/LoggedInUser";
import type {
  GroupId as ProjectId,
  StationId as LocationId,
} from "@typedefs/api/common";
import type { FetchResult } from "@api/types";
import CacophonyApi from "./api";
import type {
  ApiVisitResponse,
  MonitoringPageCriteria,
} from "@typedefs/api/monitoring";
import type { RecordingType } from "@typedefs/api/consts.ts";
import { RecordingType as ConcreteRecordingType } from "@typedefs/api/consts.ts";

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
  locations?: LocationId[],
  types?: (
    | RecordingType.TrailCamVideo
    | RecordingType.TrailCamImage
    | RecordingType.ThermalRaw
    | RecordingType.Audio
  )[]
) => {
  const params = new URLSearchParams();
  params.append("groups", projectId.toString());
  params.append("from", fromDate.toISOString());
  params.append("until", untilDate.toISOString());
  if (locations && locations.length) {
    params.append("stations", locations.toString());
  }
  if (types && types.length) {
    params.append("types", types.toString());
  }
  params.append("page", "1"); // NOTE - since we alter the date range, page num is always 1
  params.append("page-size", "100"); // 100 recordings per page of visits, which is the max
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
    if (!(untilDate > fromDate)) {
      debugger;
    }

    requestNumber++;
    const response = await getVisitsForProject(
      projectId,
      fromDate,
      untilDate,
      undefined,
      [
        ConcreteRecordingType.ThermalRaw,
        ConcreteRecordingType.TrailCamImage,
        ConcreteRecordingType.TrailCamVideo,
      ]
    );
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
  // returnVisits.sort((a, b) => {
  //   return new Date(a.timeStart).getTime() - new Date(b.timeStart).getTime();
  // });

  return {
    visits: returnVisits,
    all: !morePagesExist,
  };
};

export const getAllVisitsForProjectBetweenTimes = async (
  projectId: ProjectId,
  fromDate: Date,
  untilDateTime: Date,
  locations?: LocationId[],
  types?: (
    | RecordingType.TrailCamImage
    | RecordingType.TrailCamVideo
    | RecordingType.ThermalRaw
    | RecordingType.Audio
  )[],
  progressUpdaterFn?: ProgressUpdater // progress updates caller with how far through the request it is [0, 1]
): Promise<{
  success: boolean;
  visits: ApiVisitResponse[];
  all: boolean;
}> => {
  const returnVisits: ApiVisitResponse[] = [];
  let morePagesExist = true;
  let requestNumber = 0;
  let untilDate = new Date(untilDateTime);
  let numPagesEstimate = 0;

  // FIXME: This should really respect the fromDate/untilDate that we pass it - we'll lazily load more visits
  //  as needed by page visibility etc.  All we really want to do is make sure we load up to the end of the last visit,
  //  so there are no incomplete visits in the list.
  while (morePagesExist && requestNumber < 100) {
    // We only allow up to 100 pages...
    requestNumber++;
    const response = await getVisitsForProject(
      projectId,
      fromDate,
      untilDate,
      locations,
      types
    );
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
      if (
        visits &&
        visits.length &&
        (visits[0].incomplete || visits[visits.length - 1].incomplete)
      ) {
        // FIXME
        // debugger;
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
  // returnVisits.sort((a, b) => {
  //   return new Date(a.timeStart).getTime() - new Date(b.timeStart).getTime();
  // });

  return {
    success: true,
    visits: returnVisits,
    all: !morePagesExist,
  };
};
