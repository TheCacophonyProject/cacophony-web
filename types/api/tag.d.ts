import {RecordingId, TagId, UserId} from "./common";
import { AcceptableTag } from "./consts";

export interface ApiRecordingTagRequest {
  detail: string;
  confidence: number;
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
  what?: AcceptableTag;
  automatic?: boolean;
  version?: number;
}
