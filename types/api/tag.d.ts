import { IsoFormattedDateString, RecordingId, TagId, UserId } from "./common";

export interface ApiRecordingTagRequest {
  detail: string;
  confidence: number;
  startTime?: number; // Used for audio tags
  duration?: number; // Used for audio tags
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
  duration?: number;
  taggerName?: string;
  automatic?: boolean;
  version?: number;
  createdAt: IsoFormattedDateString;
}
