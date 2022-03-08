import CacophonyApi from "./CacophonyApi";
import * as querystring from "querystring";
import { calculateFromTime, FetchResult } from "./Recording.api";
import { shouldViewAsSuperUser } from "@/utils";
import { MonitoringRequest } from "@typedefs/api/monitoring";

// TODO - Move these API types to @typedefs
export class VisitSearchParams {
  all: boolean;
  devices: number[];
  groups: number[];
  compareAi: string;
  estimatedCount: number;
  pagesEstimate: number;
  page: number; // page we are on
  searchFrom: string; // original query from date
  searchUntil: string; // original query to date
  pageFrom: string; // visits for this page start after this date
  pageUntil: string; // visits for this page start before or on this date
}

interface VisitRecordingTag {
  aiTag: string;
  end: number;
  start: number;
  tag: string;
  isAITagged: boolean;
}

export class NewVisit {
  classFromUserTag?: boolean; // is the best guess derived from a user tag?
  classification?: string; // what was the best guess overall?
  classificationAi?: string; // what was the best guess from the AI?
  device: string;
  deviceId: number;
  stationId: number;
  station: string;
  tracks: number; // track count
  timeStart: string; // date for start of visit
  timeEnd: string; // date for start of visit
  incomplete: boolean; // is it possible that this visit still has more recordings that should be attached?
  recordings: { recId: number; start: string; tracks: VisitRecordingTag[] }[];
}

export interface NewVisitsQueryResult {
  statusCode: number;
  visits: NewVisit[];
  params: VisitSearchParams;
}

export interface AllVisitsResults {
  totalVisits: number;
  filteredVisits: NewVisit[];
  all: boolean;
}

/* eslint-disable no-unused-vars */
export type VisitFilter = (visit: NewVisit) => boolean;
export type ProgressUpdater = (progress: number) => void;
/* eslint-enable no-unused-vars */

const apiPath = "/api/v1/monitoring";

function queryVisitPage(
  visitQuery: MonitoringRequest
): Promise<FetchResult<NewVisitsQueryResult>> {
  return CacophonyApi.get(
    `${apiPath}/page?${querystring.stringify(makeApiQuery(visitQuery))}${
      shouldViewAsSuperUser() ? "" : "&view-mode=user"
    }`
  );
}

async function getAllVisits(
  visitQuery: MonitoringRequest,
  visitsFilter?: VisitFilter, // only visits that pass this filter will be returned
  progress?: ProgressUpdater // progress updates caller with how far through the request it is[0, 1]
): Promise<AllVisitsResults> {
  const returnVisits: NewVisit[] = [];
  let allVisitsCount = 0;
  let morePagesExist = true;
  let request = 0;
  let nextRequestQuery = visitQuery;
  nextRequestQuery.perPage = 100;
  nextRequestQuery.page = 1;
  while (morePagesExist && request < 100) {
    request++;
    const response = await queryVisitPage(nextRequestQuery);
    if (response.success) {
      const { result } = response;
      // what if failed???
      allVisitsCount += result.visits.length;
      let visits = result.visits;
      if (visitsFilter) {
        visits = result.visits.filter(visitsFilter);
      }
      returnVisits.push(...visits);

      morePagesExist = response.result.params.pagesEstimate > 1;
      if (progress) {
        const totalPages = request + result.params.pagesEstimate;
        if (totalPages === 0) {
          progress(request / (request + result.params.pagesEstimate));
        }
      }

      if (morePagesExist) {
        // Use the returned date from the params "pagefrom" parameter.
        // Don't use paging just in case recordings have been create or deleted between queries.
        nextRequestQuery = JSON.parse(JSON.stringify(visitQuery)); // copy query
        nextRequestQuery.to = result.params.pageFrom;
      }
    }
  }
  return {
    totalVisits: allVisitsCount,
    filteredVisits: returnVisits,
    all: !morePagesExist,
  };
}

function makeApiQuery(query: MonitoringRequest) {
  const apiParams: any = {};

  addValueIfSet(apiParams, calculateFromTime(query), "from");
  addValueIfSet(apiParams, query.to, "until");
  addValueIfSet(apiParams, query.aiModel, "ai");
  addArrayValueIfSet(apiParams, query.group, "groups");
  addArrayValueIfSet(apiParams, query.device, "devices");
  apiParams["page-size"] = query.perPage || 10;
  apiParams.page = query.page || 1;

  return apiParams;
}

function addArrayValueIfSet(map: any, value: any[], key: string) {
  if (value && value.length > 0) {
    map[key] = value;
  }
}

function addValueIfSet(map: any, value: string, key: string) {
  if (value && value.trim() !== "") {
    map[key] = value;
  }
}

export default {
  queryVisitPage,
  getAllVisits,
};
