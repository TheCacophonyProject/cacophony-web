import CacophonyApi from "./CacophonyApi";
import * as querystring from "querystring";
import { shouldViewAsSuperUser } from "@/utils";
import recording, { FetchResult } from "./Recording.api";
import { ApiDeviceResponse } from "@typedefs/api/device";
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

function getDeviceById(
  id: DeviceId,
  activeAndInactive = false
): Promise<FetchResult<{ device: ApiDeviceResponse }>> {
  return CacophonyApi.get(
    `/api/v1/devices/device/${id}${
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
    `/api/v1/devices/assign-schedule${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`,
    {
      deviceId,
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
    `/api/v1/devices/remove-schedule${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`,
    {
      deviceId,
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
] as const;

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
};
