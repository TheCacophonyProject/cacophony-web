import CacophonyApi from "./CacophonyApi";
import * as querystring from "querystring";
import { shouldViewAsSuperUser } from "@/utils";
import recording, { FetchResult } from "./Recording.api";
import {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  WindowsSettings,
} from "@typedefs/api/device";
import { DeviceId, ScheduleId } from "@typedefs/api/common";
import { ApiGroupUserResponse } from "@typedefs/api/group";

export interface DeviceInfo {
  deviceName: string;
  groupName: string;
  id: number;
  users?: UserDetails;
}

export interface UserDetails {
  userName: string;
  id: number;
  admin: boolean;
}

function getDevices(
  activeAndInactive = false
): Promise<FetchResult<{ devices: ApiDeviceResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/devices${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getUsers(
  deviceId: DeviceId,
  activeAndInactive = false
): Promise<FetchResult<{ users: ApiGroupUserResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/devices/users?deviceId=${deviceId}&${
      shouldViewAsSuperUser()
        ? `only-active=${activeAndInactive ? "false" : "true"}`
        : `view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getDevice(
  groupName: string,
  deviceName: string,
  activeAndInactive = false
): Promise<FetchResult<{ device: ApiDeviceResponse }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${deviceName}/in-group/${groupName}?${
      shouldViewAsSuperUser()
        ? `only-active=${activeAndInactive ? "false" : "true"}`
        : `view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getDeviceCacophonyIndex(
  id: DeviceId,
  from: String,
  windowsize: Number,
  activeAndInactive = false
): Promise<FetchResult<{ cacophonyIndex: Number }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${id}/cacophony-index?from=${from}&window-size=${windowsize}${
      shouldViewAsSuperUser()
        ? `&only-active=${activeAndInactive ? "false" : "true"}`
        : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getDeviceCacophonyIndexBulk(
  id: DeviceId,
  from: String,
  steps: Number,
  interval: String,
  activeAndInactive = false
): Promise<FetchResult<{ cacophonyIndexBulk: Object }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${id}/cacophony-index-bulk?from=${from}&steps=${steps}&interval=${interval}${
      shouldViewAsSuperUser()
        ? `&only-active=${activeAndInactive ? "false" : "true"}`
        : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getDeviceSpeciesCount(
  id: DeviceId,
  from: String,
  windowsize: Number,
  activeAndInactive = false,
  recordingType = "audio"
): Promise<FetchResult<{ speciesCount: Object }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${id}/species-count?from=${from}&window-size=${windowsize}&type=${recordingType}${
      shouldViewAsSuperUser()
        ? `&only-active=${activeAndInactive ? "false" : "true"}`
        : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getDeviceSpeciesCountBulk(
  id: DeviceId,
  from: String,
  steps: Number,
  interval: String,
  activeAndInactive = false,
  recordingType = "audio"
): Promise<FetchResult<{ speciesCount: Object }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${id}/species-count-bulk?from=${from}&steps=${steps}&interval=${interval}&type=${recordingType}${
      shouldViewAsSuperUser()
        ? `&only-active=${activeAndInactive ? "false" : "true"}`
        : `&view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getDeviceDaysActive(
  id: DeviceId,
  from: String,
  windowsize: Number
): Promise<FetchResult<{ daysActive: Number }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${id}/days-active?from=${from}&window-size=${windowsize}`
  );
}

function getDeviceById(
  id: DeviceId,
  activeAndInactive = false
): Promise<FetchResult<{ device: ApiDeviceResponse }>> {
  return CacophonyApi.get(
    `/api/v1/devices/${id}${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

const assignScheduleToDevice = (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false
): Promise<FetchResult<{}>> => {
  const suppressGlobalMessaging = true;
  return CacophonyApi.post(
    `/api/v1/devices/${deviceId}/assign-schedule${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`,
    {
      scheduleId,
    },
    suppressGlobalMessaging
  );
};

const removeScheduleFromDevice = (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false
): Promise<FetchResult<{}>> => {
  const suppressGlobalMessaging = true;
  return CacophonyApi.post(
    `/api/v1/devices/${deviceId}/remove-schedule${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`,
    {
      scheduleId,
    },
    suppressGlobalMessaging
  );
};

function getLatestSoftwareVersion(deviceId: number) {
  const params: EventApiParams = {
    limit: 1,
    type: "versionData",
  };
  return getLatestEvents(deviceId, params);
}

export const DeviceEventTypes = [
  "alert",
  "attiny-sleep",
  "audioBait",
  "daytime-power-off",
  "powered-off",
  "power-on-test",
  "rpi-power-on",
  "salt-update",
  "systemError",
  "test",
  "throttle",
  "versionData",
  "throttle",
  "rpiBattery",
  "rtc-ntp-drift",
  "attiny-firmware-update",
  "tempHumidity",
].sort();

type IsoFormattedString = string;

export type DeviceEventType = typeof DeviceEventTypes[number];

export interface EventApiParams {
  limit?: number;
  offset?: number;
  type?: DeviceEventType | DeviceEventType[];
  endTime?: IsoFormattedString; // Or in the format YYYY-MM-DD hh:mm:ss
  startTime?: IsoFormattedString;
}

export interface DeviceEvent {
  id: number;
  dateTime: IsoFormattedString;
  createdAt: IsoFormattedString;
  DeviceId: DeviceId;
  Device: { deviceName: string };
  EventDetail: {
    type: DeviceEventType;
    details?: any;
  };
}

function getLatestEvents(
  deviceId: number,
  params?: EventApiParams
): Promise<{ result: { rows: DeviceEvent[] } }> {
  return CacophonyApi.get(
    `/api/v1/events?only-active=false&latest=true&deviceId=${deviceId}&${querystring.stringify(
      params as any
    )}`
  );
}

async function getType(
  deviceId: number
): Promise<"AudioRecorder" | "VideoRecorder" | "UnknownDeviceType"> {
  const rec = await recording.latestForDevice(deviceId);
  if (rec.success) {
    if (rec.result.rows.length) {
      const type = rec.result.rows[0].type;
      return type === "thermalRaw" ? "VideoRecorder" : "AudioRecorder";
    }
  }
  return "UnknownDeviceType";
}

async function getDeviceSettings(
  deviceId: DeviceId
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  return CacophonyApi.get(`/api/v1/devices/${deviceId}/settings`);
}

async function updateDeviceSettings(
  deviceId: DeviceId,
  settings: ApiDeviceHistorySettings
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  return CacophonyApi.post(`/api/v1/devices/${deviceId}/settings`, {
    settings,
  });
}

async function toggleUseLowPowerMode(
  deviceId: DeviceId
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  const currentSettingsResponse = await getDeviceSettings(deviceId);
  if (
    currentSettingsResponse.success &&
    currentSettingsResponse.result.settings
  ) {
    const currentSettings = currentSettingsResponse.result.settings;
    const newSettings: ApiDeviceHistorySettings = {
      ...currentSettings,
      thermalRecording: {
        ...currentSettings.thermalRecording,
        useLowPowerMode: !currentSettings.thermalRecording?.useLowPowerMode,
        updated: new Date().toISOString(),
      },
    };
    return updateDeviceSettings(deviceId, newSettings);
  } else {
    throw new Error("Failed to fetch current settings.");
  }
}

async function setDefaultRecordingWindows(
  deviceId: DeviceId
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  const currentSettingsResponse = await getDeviceSettings(deviceId);
  if (
    currentSettingsResponse.success &&
    currentSettingsResponse.result.settings
  ) {
    const currentSettings = currentSettingsResponse.result.settings;
    const newSettings: ApiDeviceHistorySettings = {
      ...currentSettings,
      windows: {
        powerOff: "+30m",
        powerOn: "-30m",
        startRecording: "-30m",
        stopRecording: "+30m",
        updated: new Date().toISOString(),
      },
    };
    return updateDeviceSettings(deviceId, newSettings);
  } else {
    throw new Error("Failed to fetch current settings.");
  }
}

async function set24HourRecordingWindows(
  deviceId: DeviceId
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  const currentSettingsResponse = await getDeviceSettings(deviceId);
  if (
    currentSettingsResponse.success &&
    currentSettingsResponse.result.settings
  ) {
    const currentSettings = currentSettingsResponse.result.settings;
    const newSettings: ApiDeviceHistorySettings = {
      ...currentSettings,
      windows: {
        powerOff: "12:00",
        powerOn: "12:00",
        startRecording: "12:00",
        stopRecording: "12:00",
        updated: new Date().toISOString(),
      },
    };
    return updateDeviceSettings(deviceId, newSettings);
  } else {
    throw new Error("Failed to fetch current settings.");
  }
}

async function setCustomRecordingWindows(
  deviceId: DeviceId,
  customSettings: Omit<WindowsSettings, "updated">
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  const currentSettingsResponse = await getDeviceSettings(deviceId);
  if (
    currentSettingsResponse.success &&
    currentSettingsResponse.result.settings
  ) {
    const currentSettings = currentSettingsResponse.result.settings;
    const newSettings: ApiDeviceHistorySettings = {
      ...currentSettings,
      windows: {
        ...customSettings,
        updated: new Date().toISOString(),
      },
    };
    return updateDeviceSettings(deviceId, newSettings);
  } else {
    throw new Error("Failed to fetch current settings.");
  }
}
export default {
  getDevices,
  getDevice,
  getDeviceById,
  getUsers,
  getLatestSoftwareVersion,
  getLatestEvents,
  getType,
  assignScheduleToDevice,
  removeScheduleFromDevice,
  getDeviceCacophonyIndex,
  getDeviceCacophonyIndexBulk,
  getDeviceSpeciesCount,
  getDeviceSpeciesCountBulk,
  getDeviceDaysActive,
  updateDeviceSettings,
  getDeviceSettings,
  toggleUseLowPowerMode,
  setDefaultRecordingWindows,
  set24HourRecordingWindows,
  setCustomRecordingWindows,
};
