import CacophonyApi from "./CacophonyApi";
import * as querystring from "querystring";
import { shouldViewAsSuperUser } from "@/utils";
import recording, { FetchResult } from "./Recording.api";
import {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  WindowsSettings,
} from "@typedefs/api/device";
import { DeviceId, LatLng, ScheduleId } from "@typedefs/api/common";
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

function getSettingsForDevice(
  deviceId: DeviceId,
  atTime?: Date,
  lastSynced = false
) {
  const params = new URLSearchParams();
  params.append("at-time", (atTime || new Date()).toISOString());
  if (lastSynced) {
    params.append("latest-synced", true.toString());
  }
  const queryString = params.toString();
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/settings?${queryString}`
  ) as Promise<
    FetchResult<{
      settings: ApiDeviceHistorySettings | null;
      location: LatLng;
    }>
  >;
}

async function updateDeviceSettings(
  deviceId: DeviceId,
  settings: ApiDeviceHistorySettings
): Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>> {
  return CacophonyApi.post(`/api/v1/devices/${deviceId}/settings`, {
    settings,
  });
}

async function toggleUseLowPowerMode(deviceId: DeviceId) {
  const currentSettingsResponse = await getSettingsForDevice(deviceId);
  if (currentSettingsResponse.success) {
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

async function setDefaultRecordingWindows(deviceId: DeviceId) {
  const currentSettingsResponse = await getSettingsForDevice(deviceId);
  if (currentSettingsResponse.success) {
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

async function set24HourRecordingWindows(deviceId: DeviceId) {
  const currentSettingsResponse = await getSettingsForDevice(deviceId);
  if (currentSettingsResponse.success) {
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
) {
  const currentSettingsResponse = await getSettingsForDevice(deviceId);
  if (currentSettingsResponse.success) {
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

const getLatestEventsByDeviceId = (
  deviceId: number,
  eventParams?: EventApiParams
) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("latest", true.toString());
  params.append("only-active", false.toString());
  params.append("include-count", false.toString());
  if (eventParams) {
    for (const [key, val] of Object.entries(eventParams)) {
      params.append(key, val.toString());
    }
  }
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

const getDeviceNodeGroup = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(deviceId, {
      type: "salt-update",
      limit: 1,
    }).then((response) => {
      if (response.success && response.result.rows.length) {
        resolve(
          response.result.rows[0].EventDetail.details.nodegroup ||
            "unknown channel"
        );
      } else {
        resolve(false);
      }
    });
  }) as Promise<string | false>;
};

export const getDeviceModel = async (deviceId: DeviceId) => {
  try {
    const nodegroup = await getDeviceNodeGroup(deviceId);
    if (nodegroup) {
      const model = nodegroup.includes("tc2")
        ? "tc2"
        : nodegroup.includes("pi")
        ? "pi"
        : null;
      if (model !== null) {
        return model;
      }
    }
    const model = await getLatestEventsByDeviceId(deviceId, {
      type: "versionData",
      limit: 1,
    }).then((response) => {
      if (response.success && response.result.rows.length) {
        return response.result.rows[0].EventDetail.details["tc2-agent"]
          ? "tc2"
          : "pi";
      } else {
        return null;
      }
    });
    return model;
  } catch (e) {
    return null;
  }
};

/**
 * Get a device reference image (pov or in-situ) at an optional point in time.
 *   - type: "pov" or "in-situ"
 *   - atTime: if specified, server attempts to find the reference image that applied at that time
 *   - checkExists: if true, it will call the `.../reference-image/exists` path
 *   - onlyActive: whether to require active device
 *
 * Returns a `FetchResult<Blob>` on success (unless checkExists = true, in which case
 * the server might return JSON or an error). In that scenario, you can parse the “success”
 * differently if needed.
 */
function getReferenceImage(
  deviceId: DeviceId,
  {
    type = "pov",
    atTime,
    checkExists = false,
  }: {
    type?: "pov" | "in-situ";
    atTime?: Date;
    checkExists?: boolean;
    onlyActive?: boolean;
  }
): Promise<FetchResult<Blob>> {
  const pathSuffix = checkExists ? "/exists" : "";
  const params = new URLSearchParams();

  if (type) {
    params.append("type", type);
  }
  if (atTime) {
    params.append("at-time", atTime.toISOString());
  }

  return CacophonyApi.getBinary(
    `/api/v1/devices/${deviceId}/reference-image${pathSuffix}?${params.toString()}`
  );
}

/**
 * Delete a device reference image (pov or in-situ).
 *   - type: "pov" or "in-situ"
 *   - atTime: optional date if referencing the historical entry
 */
function deleteReferenceImage(
  deviceId: DeviceId,
  {
    type = "pov",
    atTime,
  }: {
    type?: "pov" | "in-situ";
    atTime?: Date;
    onlyActive?: boolean;
  }
): Promise<FetchResult<unknown>> {
  const params = new URLSearchParams();
  if (type) {
    params.append("type", type);
  }
  if (atTime) {
    params.append("at-time", atTime.toISOString());
  }

  return CacophonyApi.delete(
    `/api/v1/devices/${deviceId}/reference-image?${params.toString()}`
  );
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
  getSettingsForDevice,
  toggleUseLowPowerMode,
  setDefaultRecordingWindows,
  set24HourRecordingWindows,
  setCustomRecordingWindows,
  getDeviceNodeGroup,
  getDeviceModel,
  getLatestEventsByDeviceId,
  getReferenceImage,
  deleteReferenceImage,
};
