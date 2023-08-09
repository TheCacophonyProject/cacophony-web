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
  ReTrack = 'retrack',
  Finished = "FINISHED",
  ToMp3 = "toMp3",
  Analyse = "analyse",
  Reprocess = "reprocess",

  TrackingFailed = "tracking.failed",
  ReTrackFailed = "retrack.failed",
  AnalyseThermalFailed = "analyse.failed",
  ToMp3Failed = "toMp3.failed",
  AnalyseFailed = "analyse.failed",
  ReprocessFailed = "reprocess.failed",

  AnalyseTest = "analyse.test", // Value only used for testing, should not be processed.
}

export enum AcceptableTag {
  NoMotion = "no motion",
  Motion = "motion",
  Cool = "cool",
  RequiresReview = "requires review",
  InteractionWithTrap = "interaction with trap",
  MissedTrack = "missed track",
  MultipleAnimals = "multiple animals",
  TrappedInTrap = "trapped in trap",
  MissedRecording = "missed recording",
  DigitalTrigger = "trap triggered",
}

export enum DeviceType {
  Audio = "audio",
  Thermal = "thermal",
  Unknown = "unknown",
}

export enum UserGlobalPermission {
  Write = "write",
  Read = "read",
  Off = "off",
}
