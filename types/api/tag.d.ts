import { IsoFormattedDateString, RecordingId, TagId, UserId } from "./common";
import { AcceptableTag } from "./consts";

export interface ApiRecordingTagRequest {
  detail: string;
  confidence: number;
  startTime?: number; // Used for audio tags
  what?: AcceptableTag;
  automatic?: boolean;
  version?: number;
}

export interface ApiRecordingTagResponse {
  id: TagId;
  detail: string;
  confidence: number;
  recordingId?: RecordingId;
  taggerId?: UserId;
  startTime?: number;
  taggerName?: string;
  what?: AcceptableTag;
  automatic?: boolean;
  version?: number;
  createdAt?: IsoFormattedDateString;
}
