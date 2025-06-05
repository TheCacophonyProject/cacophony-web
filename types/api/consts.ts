export enum RecordingType {
  ThermalRaw = "thermalRaw",
  Audio = "audio",
  TrailCamImage = "trailcam-image",
  TrailCamVideo = "trailcam-video",
  InfraredVideo = "irRaw",
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
  NoHuman = "no-human", // untagged or automatic only
  AutomaticOnly = "automatic-only",
  HumanOnly = "human-only",
  AutomaticHuman = "automatic+human",
  AutomaticHumanUrlSafe = "automatic-and-human",
}

export enum RecordingProcessingState {
  Corrupt = "CORRUPT",
  Tracking = "tracking",
  TrackAndAnalyse = "trackAndAnalyse",
  ReTrack = "retrack",
  AnalyseThermal = "analyse",
  Finished = "FINISHED",
  FinishedFailed = "FINISHED.failed",
  Analyse = "analyse",
  Reprocess = "reprocess",
  ReTrackFailed = "retrack.failed",
  TrackingFailed = "tracking.failed",
  AnalyseThermalFailed = "analyse.failed",
  AnalyseFailed = "analyse.failed",
  ReprocessFailed = "reprocess.failed",

  AnalyseTest = "analyse.test", // Value only used for testing, should not be processed.
}

export enum AcceptableTag {
  Cool = "cool",
  RequiresReview = "requires review",
  Note = "note",
  InteractionWithTrap = "interaction with trap",
  MissedTrack = "missed track",
  MultipleAnimals = "multiple animals",
  TrappedInTrap = "trapped in trap",
  MissedRecording = "missed recording",
  DigitalTrigger = "trap triggered",
  Inside = "inside",
  Outside = "outside",
  Incursion = "incursion",
}

export enum DeviceType {
  Audio = "audio",
  Thermal = "thermal",
  TrailCam = "trailcam",

  TrapIrCam = "trapcam",

  Hybrid = "hybrid-thermal-audio",
  Unknown = "unknown",
}
export type DeviceTypeUnion = `${DeviceType}`;

export enum UserGlobalPermission {
  Write = "write",
  Read = "read",
  Off = "off",
}

export enum HttpStatusCode {
  Ok = 200,
  OkNoContent = 204,
  MovedPermanently = 301,
  NotModified = 304,
  BadRequest = 400,
  AuthorizationError = 401,
  Forbidden = 403,
  NotFound = 404,
  Unprocessable = 422,
  ServerError = 500,
}

export const DeviceEventTypes = [
  "alert",
  "attiny-sleep",
  "audioBait",
  "daytime-power-off",
  "powered-off",
  "power-on-test",
  "rpi-power-on",
  "salt-update",
  "systemError",
  "test",
  "throttle",
  "versionData",
  "config",
  "bad-thermal-frame",
  "stop-reported",
] as const;

export type DeviceEventType = (typeof DeviceEventTypes)[number];
