import type { IsoFormattedDateString, DeviceId } from "./common.ts";
import { AudioRecordingMode, EventEnv } from "./consts.ts";

export type EventDates = IsoFormattedDateString[];

export interface EventDescription {
  type: string; // Name of the type of event (required if description is included).
  details?: object; // Metadata of the event.
}

type IsoFormattedString = string;

export interface DeviceEvent {
  id: number;
  dateTime: IsoFormattedString;
  createdAt: IsoFormattedString;
  DeviceId: DeviceId;
  Device: { deviceName: string };
  EventDetail: {
    type: string;
    details: object;
  };
  env: EventEnv;
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
