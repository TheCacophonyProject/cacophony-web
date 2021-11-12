import { ApiAlertCondition } from "@typedefs/api/alerts";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

// from api/v1/authenticate/token (POST)
export interface ApiAuthenticateAccess {
  devices: string;
}

/*******************************************************************
 * ALERT definitions
 ********************************************************************/
// from api/v1/alerts (get)

export interface ApiAlert {
  id: number;
  name: string;
  alertName?: string;
  frequencySeconds: number;
  conditions: ApiAlertCondition[];
  lastAlert: boolean;
  User: ApiAlertUser;
  Device: ApiDeviceIdAndName;
}

// from api/v1/alerts (post)
export interface ApiAlertSet {
  name: string;
  conditions: ApiAlertConditions[];
  deviceId: number;
  frequencySeconds: number;
}

// from api/v1/alerts (get) and (post)
export interface ApiAlertConditions {
  tag: string;
  automatic: boolean;
}

/*******************************************************************
 * DEVICE definitions
 ********************************************************************/
// from api/v1/groups (get), api/v1/events (get), api/recordings (get)
export interface ApiDeviceIdAndName {
  id: number;
  deviceName: string;
}

// from api/v1/groups/<>/devices (get)
export interface ApiGroupsDevice {
  id: number;
  deviceName: string;
}

// from api/v1/devices (get)
export interface ApiDevicesDevice {
  id: number;
  deviceName: string;
  active: boolean;
}

// from api/v1/devices/.../in-group/ (get)
export interface ApiDeviceInGroupDevice {
  id: number;
  deviceName: string;
  groupName: string;
  admin: boolean;
}

/*******************************************************************
 * USER definitions
 ********************************************************************/
// from api/v1/alerts (get)
export interface ApiAlertUser {
  id: number;
  username: string;
  email: string;
  name: string;
}

// from api/v1/devices/users (get)
export interface ApiDeviceUsersUser {
  id: number;
  username: string;
  email: string;
  relation: string;
  admin: boolean;
}

// from api/v1/recordings (get)
export interface ApiUserNameAndId {
  username: string;
  id: number;
}

// from api/v1/groups (get)
export interface ApiGroupUser {
  username: string;
  id: number;
  admin: boolean;
}

// api/v1/devices/.../in-group (get)
export interface ApiDeviceUser {
  userName: string;
  id: number;
  admin: boolean;
}

//from api/v1/groups/users (get)
export interface ApiGroupsUserReturned {
  userName: string;
  id: number;
  isGroupAdmin: boolean;
}

export interface ApiDevicesDeviceUser {
  id: number;
  username: string;
  email: string;
  name: string;
}

// from api/v1/devices/users (get)
export interface ApiDeviceUsersUser {
  id: number;
  username: string;
  email: string;
  relation: string;
  admin: boolean;
}

// from api/v1/recordings (get)
export interface ApiUserNameAndId {
  username: string;
  id: number;
}

// from api/v1/groups (get)
export interface ApiGroupUser {
  username: string;
  id: number;
  admin: boolean;
}

// api/v1/devices/.../in-group (get)
export interface ApiDeviceUser {
  userName: string;
  id: number;
  admin: boolean;
}

//from api/v1/groups/users (get)
export interface ApiGroupsUserReturned {
  userName: string;
  id: number;
  isGroupAdmin: boolean;
}

// from api/v1/devices
export interface ApiDevicesDeviceUser {
  id: number;
  username: string;
  DeviceUsers: ApiDeviceUserRelationship;
}

// from api/v1/devices
export interface ApiDeviceUserRelationship {
  admin: boolean;
  DeviceId: number;
  UserId: number;
}

/*******************************************************************
 * EVENT definitions
 ********************************************************************/

// from /api/v1/events (get) and api/v1/events (post)
export interface ApiEventDetail {
  type?: string;
  details?: any;
}

// from api/v1/events (post)
export interface ApiEventSet {
  deviceId?: string;
  description?: ApiEventDetail;
  eventDetailId?: number;
  dateTimes?: string[];
}

// from api/v1/events (get)
export interface ApiEventReturned {
  id?: number;
  createdAt?: string;
  DeviceId?: number;
  EventDetail?: ApiEventDetail;
  dateTime?: string;
  Device?: { devicename: string };
}

// from api/v1/events/powerevents (get)
export interface ApiPowerEventReturned {
  hasStopped: boolean;
  lastStarted?: string;
  lastReported?: string;
  lastStopped?: string;
  hasAlerted?: boolean;
  Device?: {
    id: number;
    devicename: string;
    GroupId: number;
    Group: {
      groupname: string;
      id: number;
    };
  };
}

// from api/v1/events/errors (get)
export interface ApiEventErrorSimilar {
  device: string;
  timestamp: string;
  lines: string[];
}

// from api/v1/events/errors (get)
export interface ApiEventErrorPattern {
  score?: number;
  index?: number;
  patterns?: string[];
}

// from api/v1/events/errors (get)
export interface ApiEventError {
  devices: string[];
  timestamps: string[];
  similar: ApiEventErrorSimilar[];
  patterns: ApiEventErrorPattern[];
}

// from api/v1/events/errors (get)
export interface ApiEventErrorCategory {
  name: string;
  devices: string[];
  errors: ApiEventError[];
}

/*******************************************************************
 * GROUP definitions
 ********************************************************************/

// from api/v1/groups (get)
export interface ApiGroupReturned {
  id: number;
  groupname: string;
  Users: ApiGroupUserRelation[];
  Devices: ApiDeviceIdAndName[];
  GroupUsers: ApiGroupUser[];
}

// from api/v1/groups/get
export interface ApiGroupUserRelation {
  id: number;
  username: string;
  GroupUsers: {
    admin: boolean;
    createdAt: string;
    updatedAt: string;
    GroupId: number;
    UserId: number;
  };
}

/*******************************************************************
 * RECORDING definitions
 ********************************************************************/

//from /api/fileProcessing (get)
export interface ApiRecordingForProcessing {
  id: number;
  type: string;
  jobKey: string;
  rawFileKey: string;
  rawMimeType: string;
  fileKey: string;
  fileMimeType: string;
  processingState: string;
  processingMeta: any;
  GroupId: number | string;
  DeviceId: number | string;
  StationId: number;
  recordingDateTime: string;
  duration: number;
  location: { type: "Point"; coordinates: number[] } | null;
  hasAlert: boolean;
  processingStartTime: string;
  processingEndTime: string;
  processing: boolean;
  updatedAt: string;
}

// from api/v1/recordings (post)
export interface ApiRecordingSet {
  type: RecordingType | string;
  fileHash?: string;
  duration: number;
  location?: ApiLocation | number[];
  recordingDateTime: string;
  relativeToDawn?: number;
  relativeToDusk?: number;
  version?: string;
  batteryCharging?: string;
  batteryLevel?: number;
  airplaneModeOn?: boolean;
  metadata?: ApiRecordingDataMetadata;
  additionalMetadata?: ApiThermalAdditionalMetadata | any;
  comment?: string;
  processingState?: RecordingProcessingState | string;
}

// api/recordings/report
// also defined as an array in constants - update in both places
export interface ApiRecordingColumns {
  Id?: string;
  Type?: string;
  Group?: string;
  Device?: string;
  Station?: string;
  Date?: string;
  Time?: string;
  Latitude?: string;
  Longitude?: string;
  Duration?: string;
  BatteryPercent?: string;
  Comment?: string;
  "Track Count"?: string;
  "Automatic Track Tags"?: string;
  "Human Track Tags"?: string;
  "Recording Tags"?: string;
  URL?: string;
  "Cacophony Index"?: string;
  "Species Classification"?: string;
}

export interface ApiRecordingReturned {
  id: number;
  fileHash?: string;
  rawMimeType: string;
  fileMimeType: string;
  processingState: string;
  duration: number;
  recordingDateTime: string;
  relativeToDawn?: number;
  relativeToDusk?: number;
  location: ApiLocation;
  version?: string;
  batteryLevel?: number;
  batteryCharging?: string;
  airplaneModeOn?: boolean;
  type: string;
  additionalMetadata?: ApiThermalAdditionalMetadata | any;
  GroupId: number;
  StationId: number;
  comment?: string;
  processing: boolean;
  Group?: { groupname: string };
  Station?: ApiRecordingStation;
  Tags?: ApiRecordingTag[];
  Tracks?: ApiRecordingTrack[];
  Device?: ApiDeviceIdAndName;
  //fields in fileProcessing API but not api/vi
  DeviceId?: string;
  rawFileKey?: string;
}

export interface ApiRecordingNeedsTagReturned {
  DeviceId: number;
  RecordingId: number;
  duration: number;
  fileSize: number;
  recordingJWT: string;
  tagJWT: string;
  tracks: ApiRecordingNeedsTagTrack[];
}

export interface ApiRecordingNeedsTagTrack {
  TrackId: number;
  data: { end_s: number; start_s: number };
  needsTagging: boolean;
}

// from api/v1/recordings (get)
export interface ApiRecordingTag {
  id: number;
  what: string;
  detail: string;
  confidence: number;
  startTime: string;
  duration: number;
  automatic: boolean;
  version: number;
  createdAt: string;
  taggerId: number;
  tagger: ApiUserNameAndId;
  animal: string;
  event: string;
}

// from api/v1/recordings (post)
export interface ApiRecordingAlgorithm {
  model_name?: string;
  tracker_version?: number;
}

// from api/v1/recordings (post)
export interface ApiRecordingDataMetadata {
  tracks?: ApiTrackSet[];
  models?: ApiRecordingModel[];
  algorithm?: ApiRecordingAlgorithm;
}

// from api/v1/recordings (get)
export interface ApiThermalAdditionalMetadata {
  models?: Record<string, ApiRecordingModel>;
  algorithm?: number;
  tracking_time?: number;
  thumbnail_region?: ApiRecordingThumbnailRegion;
  previewSecs?: number;
  totalFrames?: number;
}

// from api/v1/recordings (get)
export interface ApiRecordingThumbnailRegion {
  x: number;
  y: number;
  mass: number;
  blank: boolean;
  width: number;
  height: number;
  frame_number: number;
  pixel_variance: number;
}

//from api/v1/recordings (get)
export interface ApiRecordingTrack {
  id?: number;
  data?: ApiRecordingTrackData;
  TrackTags?: ApiRecordingTrackTag[];
}

//from api/v1/recordings (get)
export interface ApiRecordingTrackData {
  start_s: number;
  end_s: number;
}

//from api/v1/recordings (post)
export interface ApiTrackSet {
  positions?: any;
  start_s: number;
  end_s: number;
  predictions: {
    model_id: number;
    confident_tag?: string;
    confidence?: number;
  }[];
  all_class_confidences?: any;
}

//from api/v1/recordings (get)
export interface ApiRecordingTrackTag {
  what: string;
  automatic: boolean;
  TrackId: number;
  confidence?: number;
  UserId?: number;
  data?: string;
  User?: any;
}

// from api/v1/recordings (get)
export interface ApiRecordingModel {
  classify_time?: number;
  name: string;
  id: number;
}

//Simplified test version of above structures for generic recordings
export interface TestThermalRecordingInfo {
  processingState?: string;
  time?: Date | string;
  duration?: number;
  model?: string;
  tracks?: ApiTrackSet[];
  noTracks?: boolean; // by default there will normally be one track, set to true if you don't want tracks
  minsLater?: number; // minutes that later that the recording is taken
  secsLater?: number; // minutes that later that the recording is taken
  tags?: string[]; // short cut for defining tags for each track
  lat?: number; // Latitude position for the recording
  lng?: number; // Longitude position for the recording
}

/*******************************************************************
 * Stations
 ********************************************************************/

// from api/v1/recording (get)
export interface ApiRecordingStation {
  name?: string;
  location?: ApiLocation;
}

// from api/v1/groups/<>/stations (post)
export interface ApiStationData {
  name: string;
  lat: number;
  lng: number;
}

// from api/v1/groups/<>/stations (get), apiRecordings (post)
export interface ApiLocation {
  type: string;
  coordinates: number[];
}

// from api/v1/groups/<>/stations (get)
export interface ApiStationDataReturned {
  id: number;
  name: string;
  location: ApiLocation;
  lastUpdatedById: number;
  createdAt: string;
  retiredAt: string;
  updatedAt: string;
  GroupId: number;
}

/*******************************************************************
 * Custom structures used internally in test code
 ********************************************************************/

export interface TestComparableEvent {
  id: number;
  dateTime: string;
  createdat: string;
  DeviceId: number;
  EventDetail: ApiEventDetail;
  Device: {
    devicename: string;
  };
}

export interface TestComparableVisit {
  // either a date object or a string representing the time of day (enough for most tests)
  start?: Date | string;
  end?: Date | string;
  tag?: string;
  recordings?: number;
  incomplete?: string;
  aiTag?: string;
  camera?: string;
  station?: string;
}

export interface TestVisitSearchParams {
  from?: Date | string;
  until?: Date | string;
  devices?: number | number[];
  page?: number;
  "page-size"?: number;
  ai?: string;
  groups?: number | number[];
}

export interface TestVisitsWhere {
  type: string;
  duration?: any;
  DeviceId?: number;
}

export interface TestComparablePowerEvent {
  hasStopped: boolean;
  hasAlerted: boolean;
}

export interface TestDeviceAndGroup {
  devicename: string;
  groupname: string;
}
