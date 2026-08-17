import type { IsoFormattedDateString, DeviceId } from "./common.ts";
import { AudioRecordingMode, EventEnv } from "./consts.ts";

export type EventDates = IsoFormattedDateString[];

export type JsonDocument = string | number | boolean | null | object;

export interface EventDescription {
  type: string; // Name of the type of event (required if description is included).
  details?: JsonDocument; // Metadata of the event.
}

type IsoFormattedString = string;

export interface ApiDeviceEventResponse {
  id: number;
  dateTime: IsoFormattedDateString | Date;
  createdAt: IsoFormattedDateString | Date;
  env: EventEnv;
  EventDetail: EventDescription;
  DeviceId: DeviceId;
  Device?: { deviceName: string };
}

export interface DeviceEvent extends ApiDeviceEventResponse {
  Device: { deviceName: string };
}
export interface DeviceConfigDetail {
  audio: null;
  "audio-recording"?: {
    "audio-mode"?: AudioRecordingMode;
    "random-seed"?: number;
    updated: IsoFormattedString;
  };
  battery: {
    "no-battery-reading": number;
    "low-battery-reading": number;
    "full-battery-reading": number;
    "enable-voltage-readings": boolean;
  };
  device: {
    id: DeviceId;
    name: string;
    group: string;
    server:
      | "https://api.cacophony.org.nz"
      | "https://api-test.cacophony.org.nz";
    updated: IsoFormattedString;
  };
  gpio: null;
  lepton: null;
  location: {
    accuracy: number;
    altitude: number;
    latitude: number;
    longitude: number;
    timestamp: IsoFormattedString;
    updated: IsoFormattedString;
  };
  modemd: {
    updated: IsoFormattedString;
    "initial-on-duration": "0s";
  };
  ports: null;
  "test-hosts": null;
  "thermal-motion": null;
  "thermal-recorder"?: {
    updated: IsoFormattedString;
    "use-low-power-mode"?: boolean;
  };
  "thermal-throttler": null;
  windows: {
    updated: IsoFormattedString;
    "power-on"?: string;
    "power-off"?: string;
    "stop-recording"?: string;
    "start-recording"?: string;
  } | null;
}

export interface ApiSubmitEventsRequestBody {
  Timestamp?: IsoFormattedDateString; // Deprecated, use 'dateTimes' instead
  eventDetailId?: number; // ID of existing event details entry if known. Either eventDetailId or description are required.
  description?: EventDescription; // Description of the event. Either eventDetailId or description are required.
  dateTimes: IsoFormattedDateString[]; // Array of event times in ISO standard format, eg ["2017-11-13T00:47:51.160Z"]
}

export interface SaltUpdateEventDetail {
  success: boolean;
  args: string[];
  failed: number;
  changed: number;
  succeeded: number;
  runTime?: number;
  nodegroup: string;
  out?: string;
  minionID?: string;
}

export interface SaltUpdateEvent extends ApiDeviceEventResponse {
  EventDetail: {
    type: "salt-update";
    details: SaltUpdateEventDetail;
  };
}

export interface ServiceErrorEventDetail {
  unitName: string;
  severity?: "error";
  logs: string[];
  version: string;
  activeState?: "failed" | "activating";
}

export interface ServiceErrorEvent extends ApiDeviceEventResponse {
  EventDetail: {
    type: "systemError";
    details: ServiceErrorEventDetail;
  };
}

export type VersionDataEventDetail = Record<string, string>;

export interface VersionDataEvent extends ApiDeviceEventResponse {
  EventDetail: {
    type: "versionData";
    details: VersionDataEventDetail;
  };
}
export interface BatteryInfoEventDetail {
  voltage: number;
  battery: number;

  // Old format, but some cameras still haven't update to new as of 3/12/2025
  batteryType?:
    | "lime"
    | "lead-acid-12v"
    | "li-ion"
    | "unknown_battery_type"
    | "mains";
  // New format
  cellCount?: number;
  chemistry?: "lead-acid" | "lifepo4" | "li-ion";
  rtcVoltage?: number;
  rail?: "lv" | "hv";

  // NOTE: There is also a bunch of 'depletion_method' etc fields in newer events, but it's not clear
  // yet how or if we'd use those in the front-end.
}

export type BatteryInfoEventAndDate = BatteryInfoEventDetail & {
  dateTime: IsoFormattedDateString;
};

export interface BatteryInfoEvent extends ApiDeviceEventResponse {
  EventDetail: {
    type: "rpiBattery";
    details: BatteryInfoEventDetail;
  };
}
