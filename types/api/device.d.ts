import {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  SaltId,
  ScheduleId,
  StationId,
} from "./common";
import { DeviceType } from "./consts.js";
import { ApiGroupUserResponse } from "./group";

export type DeviceBatteryChargeState =
  | "NOT_CHARGING"
  | "CHARGING"
  | "FULL"
  | "DISCHARGING";

export interface ApiDeviceResponse {
  deviceName: string;
  groupName: string;
  groupId: GroupId;
  id: DeviceId;
  saltId: SaltId;
  active: boolean;
  admin: boolean;
  type: DeviceType;

  isHealthy?: boolean;
  public?: boolean; // Assumed to be private unless otherwise specified.
  lastConnectionTime?: IsoFormattedDateString;
  lastRecordingTime?: IsoFormattedDateString;
  location?: LatLng;
  scheduleId?: ScheduleId;
  users?: ApiGroupUserResponse[];
}

export interface MaskRegion {
  region: string;
  points: { x: number; y: number }[];
}

export interface MaskRegionsData {
  maskRegions: MaskRegion[];
}

export interface ApiDeviceLocationFixup {
  fromDateTime: IsoFormattedDateString;
  stationId: StationId;
  location?: LatLng; // Supply a location to map to the station
}
