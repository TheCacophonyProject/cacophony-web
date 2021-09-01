import { ApiAlertConditions } from "@typedefs/api/alerts";

export interface ApiAlertUser {
  id: number;
  username: string;
  email: string;
  name: string;
}

export interface ApiAlertDevice {
  id: number;
  devicename: string;
}

export interface ApiAlert {
  id: number;
  name: string;
  alertName?: string;
  frequencySeconds: number;
  conditions: ApiAlertConditions;
  lastAlert: boolean;
  User: ApiAlertUser;
  Device: ApiAlertDevice;
}

export interface ApiAuthenticateAccess {
  devices: string;
}

export interface ApiDevicesDevice {
  id: number;
  devicename: string;
  active: boolean;
  Users: ApiDevicesDeviceUser[];
}

export interface ApiDeviceInGroupDevice {
  id: number;
  devicename: string;
  groupName: string;
  userIsAdmin: boolean;
  users: ApiDeviceInGroupUser[];
}

export interface ApiDeviceQueryDevice {
  devicename: string;
  groupname: string;
  saltId?: number;
}

export interface TestDeviceAndGroup {
  devicename: string;
  groupname: string;
}

export interface ApiDevicesDeviceUser {
  id: number;
  username: string;
  DeviceUsers: ApiDeviceUserRelationship;
}

export interface ApiDeviceUserRelationship {
  admin: boolean;
  DeviceId: number;
  UserId: number;
}

export interface ApiDeviceInGroupUser {
  userName: string;
  admin: boolean;
  id: number;
}

export interface ApiDeviceUsersUser {
  id: number;
  username: string;
  email: string;
  relation: string;
  admin: boolean;
}

export interface TestComparablePowerEvent {
  hasStopped: boolean;
  hasAlerted: boolean;
}

export interface ApiEventDetail {
  type?: string;
  details?: any;
}

export interface ApiEventSet {
  deviceID?: string;
  description?: ApiEventDetail;
  eventDetailId?: number;
  dateTimes?: string[];
}

export interface ApiEventReturned {
  id?: number;
  createdAt?: string;
  DeviceId?: number;
  EventDetail?: ApiEventDetail;
  dateTime?: string;
  Device?: { devicename: string };
}

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

export interface ApiEventErrorSimilar {
  device: string;
  timestamp: string;
  lines: string[];
}

export interface ApiEventErrorPattern {
  score?: number;
  index?: number;
  patterns?: string[];
}

export interface ApiEventError {
  devices: string[];
  timestamps: string[];
  similar: ApiEventErrorSimilar[];
  patterns: ApiEventErrorPattern[];
}

export interface ApiEventErrorCategory {
  name: string;
  devices: string[];
  errors: ApiEventError[];
}

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

// Station data as supplied to API on creation.
export interface ApiCreateStationData {
  name: string;
  lat: number;
  lng: number;
}

export interface ApiTrackInfo {
  start_s?: number;
  end_s?: number;
  tag?: string;
  // confidence?: number,
}

export interface ApiThermalRecordingInfo {
  processingState?: string;
  time?: Date | string;
  duration?: number;
  model?: string;
  tracks?: ApiTrackInfo[];
  noTracks?: boolean; // by default there will normally be one track, set to true if you don't want tracks
  minsLater?: number; // minutes that later that the recording is taken
  secsLater?: number; // minutes that later that the recording is taken
  tags?: string[]; // short cut for defining tags for each track
  lat?: number; // Latitude position for the recording
  lng?: number; // Longitude position for the recording
}
