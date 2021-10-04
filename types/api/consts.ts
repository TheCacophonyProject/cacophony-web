export enum RecordingType {
  ThermalRaw = "thermalRaw",
  Audio = "audio",
}

export enum RecordingPermission {
  DELETE = "delete",
  TAG = "tag",
  VIEW = "view",
  UPDATE = "update",
}


export enum TagMode {
  Any = "any",
  UnTagged = "untagged",
  Tagged = "tagged",
  HumanTagged = "human-tagged",
  AutomaticallyTagged = "automatic-tagged",
  BothTagged = "both-tagged",
  NoHuman = "no-human", // untagged or automatic only
  AutomaticOnly = "automatic-only",
  HumanOnly = "human-only",
  AutomaticHuman = "automatic+human",
}


export enum RecordingProcessingState {
  Corrupt = "CORRUPT",
  Tracking = "tracking",
  AnalyseThermal = "analyse",
  Finished = "FINISHED",
  ToMp3 = "toMp3",
  Analyse = "analyse",
  Reprocess = "reprocess",

  AnalyseThermalFailed = "analyse.failed",
  ToMp3Failed = "toMp3.failed",
  AnalyseFailed = "analyse.failed",
  ReprocessFailed = "reprocess.failed",
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
