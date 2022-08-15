import { GroupId, IsoFormattedDateString, StationId } from "./common";

export interface MonitoringRequest {
  perPage?: number;
  page?: number;
  days?: number | "all";
  from?: IsoFormattedDateString;
  to?: IsoFormattedDateString;
  group?: GroupId[];
  station?: StationId[];
  aiModel?: string;
}

export interface MonitoringPageCriteria {
  compareAi: string;
  stations?: StationId[];
  groups?: GroupId[];
  page: number;
  pagesEstimate: number;
  pageFrom?: Date;
  pageUntil?: Date;
  searchFrom?: Date;
  searchUntil?: Date;
}

interface VisitRecordingTag {
  aiTag: string;
  end: number;
  start: number;
  tag: string;
  isAITagged: boolean;
}

export interface ApiVisitResponse {
  classFromUserTag?: boolean; // is the best guess derived from a user tag?
  classification?: string; // what was the best guess overall?
  classificationAi?: string; // what was the best guess from the AI?
  device: string;
  deviceId: number;
  stationId: number;
  stationName: string;
  tracks: number; // track count
  timeStart: string; // date for start of visit
  timeEnd: string; // date for start of visit
  incomplete: boolean; // is it possible that this visit still has more recordings that should be attached?
  recordings: { recId: number; start: string; tracks: VisitRecordingTag[] }[];
}
