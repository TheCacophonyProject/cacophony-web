import { GroupId, IsoFormattedDateString, StationId, TrackId } from "./common";
import { RecordingType } from "./consts.js";

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
  types?: (
    | RecordingType.ThermalRaw
    | RecordingType.Audio
    | RecordingType.TrailCamVideo
    | RecordingType.TrailCamImage
  )[];
}

interface VisitRecordingTag {
  aiTag: string | null;
  end: number;
  start: number;
  tag: string | null;
  isAITagged: boolean;
  mass: number;
  id: TrackId;
}

export interface ApiVisitResponse {
  classFromUserTag?: boolean; // is the best guess derived from a user tag?
  classification?: string; // what was the best guess overall?
  classificationAi?: string; // what was the best guess from the AI?

  userTagsConflict?: boolean;
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
