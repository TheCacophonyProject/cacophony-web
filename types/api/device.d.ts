import type {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  SaltId,
  ScheduleId,
  StationId,
} from "./common.ts";
import { AudioRecordingMode, type DeviceType } from "./consts.ts";
import { type ApiGroupUserResponse } from "./group.ts";

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
  earliestThermalRecordingTime?: IsoFormattedDateString;
  lastThermalRecordingTime?: IsoFormattedDateString;
  earliestAudioRecordingTime?: IsoFormattedDateString;
  lastAudioRecordingTime?: IsoFormattedDateString;
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

interface SettingsBase {
  updated: IsoFormattedDateString;
}

export type ThermalRecordingSettings = {
  useLowPowerMode: boolean;
} & SettingsBase;

export type AudioRecordingSettings = {
  audioMode?: AudioRecordingMode;
  audioSeed?: number;
} & SettingsBase;

export type WindowsSettings = {
  startRecording: string;
  stopRecording: string;
  powerOn?: string;
  powerOff?: string;
} & SettingsBase;

export type BatterySettings = {
  chemistry?: string;
  manualCellCount?: number;
} & SettingsBase;
export type ImageMimeTypes =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";
export interface ApiDeviceHistorySettings extends Record<string, unknown> {
  referenceImagePOV?: string; // S3 Key for a device reference image
  referenceImagePOVFileSize?: number;
  referenceImagePOVMimeType?: ImageMimeTypes;
  referenceImageInSitu?: string; // S3 Key for a device reference image
  referenceImageInSituFileSize?: number;
  referenceImageInSituMimeType?: ImageMimeTypes;
  warp?: {
    dimensions?: { width: number; height: number };
    origin: [number, number];
    topLeft: [number, number];
    topRight: [number, number];
    bottomLeft: [number, number];
    bottomRight: [number, number];
  };
  maskRegions?: MaskRegions; // FIXME: Should also have settings base?
  ratThresh?: { version?: number; gridSize?: number; thresholds?: unknown[][] };
  thermalRecording?: ThermalRecordingSettings;
  audioRecording?: AudioRecordingSettings;
  windows?: WindowsSettings;
  battery?: BatterySettings;

  location?: LatLng;

  synced?: boolean;
}

export type DeviceHistorySetBy =
  | "automatic"
  | "user"
  | "config"
  | "register"
  | "re-register";

// Only seen in a test environment
export interface ApiDeviceHistory {
  location: LatLng | null;
  fromDateTime: IsoFormattedDateString;
  setBy: DeviceHistorySetBy;
  deviceName: string;
  saltId: SaltId;
  stationId: StationId | null;
  uuid: number;
  settings: ApiDeviceHistorySettings | null;
  DeviceId: DeviceId;
  GroupId: GroupId;
}
