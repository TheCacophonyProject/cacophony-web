import {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  SaltId, ScheduleId,
} from "./common";
import { ApiUserResponse } from "./user";
import { DeviceType } from "./consts";

export type DeviceBatteryChargeState =
  | "NOT_CHARGING"
  | "CHARGING"
  | "FULL"
  | "DISCHARGING";

export interface ApiDeviceUserRelationshipResponse extends ApiUserResponse {
  admin: boolean;
  relation: "group" | "device";
}

export interface ApiDeviceResponse {
  deviceName: string;
  groupName: string;
  groupId: GroupId;
  id: DeviceId;
  saltId: SaltId;
  active: boolean;
  admin: boolean;
  type: DeviceType;

  public?: boolean; // Assumed to be private unless otherwise specified.
  lastConnectionTime?: IsoFormattedDateString;
  lastRecordingTime?: IsoFormattedDateString;
  location?: LatLng;
  scheduleId?: ScheduleId;
  users?: ApiDeviceUserRelationshipResponse[];
}
