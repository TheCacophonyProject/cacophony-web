import {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  SaltId,
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
  location?: LatLng;
  users?: ApiDeviceUserRelationshipResponse[];
}
