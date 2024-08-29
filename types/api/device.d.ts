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
  regionData: { x: number; y: number }[];
  alertOnEnter?: boolean;
}

export type MaskRegions = Record<string, MaskRegion>;

export interface ApiMaskRegionsData {
  maskRegions: Record<string, MaskRegion>;
}

export interface ApiDeviceLocationFixup {
  fromDateTime: IsoFormattedDateString;
  stationId: StationId;
  location?: LatLng; // Supply a location to map to the station
}

type SettingsBase = {
  updated: IsoFormattedDateString;
};

export type ThermalRecordingSettings = {
  useLowPowerMode: boolean;
} & SettingsBase;

export type WindowsSettings = {
  startRecording: string;
  stopRecording: string;
  powerOn?: string;
  powerOff?: string;
} & SettingsBase;

export interface ApiDeviceHistorySettings {
  referenceImagePOV?: string; // S3 Key for a device reference image
  referenceImagePOVFileSize?: number;
  referenceImageInSitu?: string; // S3 Key for a device reference image
  referenceImageInSituFileSize?: number;
  warp?: {
    dimensions?: { width: number; height: number };
    origin: [number, number];
    topLeft: [number, number];
    topRight: [number, number];
    bottomLeft: [number, number];
    bottomRight: [number, number];
  };
  maskRegions?: MaskRegions;
  ratThresh?: any;
  thermalRecording?: ThermalRecordingSettings;
  windows?: WindowsSettings;
  synced?: boolean;
}
