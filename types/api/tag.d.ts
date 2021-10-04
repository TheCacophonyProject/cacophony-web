import {RecordingId, TagId, UserId} from "./common";

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

export enum AcceptableTag {
  Cool = "cool",
  RequiresReview = "requires review",
  InteractionWithTrap = "interaction with trap",
  MissedTrack = "missed track",
  MultipleAnimals = "multiple animals",
  TrappedInTrap = "trapped in trap",
  MissedRecording = "missed recording",
}
