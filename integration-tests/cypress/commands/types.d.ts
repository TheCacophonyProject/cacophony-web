/*******************************************************************
 * ALERT definitions
 ********************************************************************/
// from api/v1/alerts (get)
export interface ApiAlert {
  id: number;
  name: string;
  alertName?: string;
  frequencySeconds: number;
  conditions: ApiAlertConditions[];
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
// from api/v1/groups (get), api/v1/events (get)
export interface ApiDeviceIdAndName {
  id: number;
  devicename: string;
}

// from api/v1/groups/<>/devices (get)
export interface ApiGroupsDevice {
  id: number;
  deviceName: string;
}

// from api/v1/devices (get)
export interface ApiDevicesDevice {
  id: number;
  devicename: string;
  active: boolean;
  Users: ApiDevicesDeviceUser[];
}

// from api/v1/devices/.../in-group/ (get)
export interface ApiDeviceInGroupDevice {
  id: number;
  devicename: string;
  groupName: string;
  userIsAdmin: boolean;
  users: ApiDeviceUser[];
}

//From api/v1/devices/query (get)
export interface ApiDeviceQueryDevice {
  devicename: string;
  groupname: string;
  id: number;
  saltId?: number;
  Group: {
    groupname: string;
  };
}

// from api/v1/authenticate/token (POST)
export interface ApiAuthenticateAccess {
  devices: string;
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

// from api/v1/groups (get)
export interface ApiGroupUser {
  username: string;
  id: number;
  isAdmin: boolean;
}

// api/v1/devices/.../in-group (get)
export interface ApiDeviceUser {
  userName: string;
  id: number;
  isAdmin: boolean;
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
  deviceID?: string;
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

// from api/v1/recordings (post)
export interface ApiRecordingData {
  type: string;
  fileHash: string;
  duration: number;
  recordingDateTime: string;
  location: ApiLocation;
  version: string;
  batteryCharging: boolean;
  batteryLevel: number;
  airplaneModeOn: boolean;
  additionalMetadata: ApiRecordingDataMetadata;
  comment: string;
  processingState: string;
}

// from api/v1/recordings (post)
export interface ApiRecordingDataMetadata {
  tracks: ApiTrackSet;
  algorythm?: string;
}

//from api/v1/recordings (post)
export interface ApiTrackSet {
  positions: number[][];
  start_s: number;
  end_s: number;
  confident_tag?: string;
  confidence: number;
  all_class_confidences: any;
}

//Simplified test version of above structures for generic recordings
export interface TestThermalRecordingInfo {
  processingState?: string;
  time?: Date | string;
  duration?: number;
  model?: string;
  tracks?: TestTrackInfo[];
  noTracks?: boolean; // by default there will normally be one track, set to true if you don't want tracks
  minsLater?: number; // minutes that later that the recording is taken
  secsLater?: number; // minutes that later that the recording is taken
  tags?: string[]; // short cut for defining tags for each track
  lat?: number; // Latitude position for the recording
  lng?: number; // Longitude position for the recording
}

//Simplified test version of above structures for generic recordings
export interface TestTrackInfo {
  start_s?: number;
  end_s?: number;
  tag?: string;
  // confidence?: number,
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
  coordinates: [number, number];
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
