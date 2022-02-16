import { IsoFormattedDateString, RecordingId, TagId, UserId } from "./common";

export interface ApiRecordingTagRequest {
  detail?: string;
  confidence: number;
  startTime?: number; // Used for audio tags
  duration?: number; // Used for audio tags
  what?: string; //AcceptableTag; - NOTE - audio tagger currently allows any tag to be set.
  automatic?: boolean;
  version?: number;
}

export interface ApiRecordingTagResponse {
  id: TagId;
  detail?: string;
  confidence: number;
  recordingId?: RecordingId;
  taggerId?: UserId;
  startTime?: number;
  duration?: number;
  taggerName?: string;
  what?: string; //AcceptableTag;
  automatic?: boolean;
  version?: number;
  createdAt?: IsoFormattedDateString;
}
