export interface ApiTagData {
  detail: string;
  confidence: number;
  RecordingId?: number;//import("./common").RecordingId;
  taggerId?: number;//import("./common").UserId;
  what?: string;
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
