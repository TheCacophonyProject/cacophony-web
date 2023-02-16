import CacophonyApi from "@api/api";
import type { FetchResult } from "@api/types";
import type { DeviceId, GroupId } from "@typedefs/api/common";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ScheduleId } from "@typedefs/api/common";
import type {
  DeviceConfigDetail,
  DeviceEvent,
  IsoFormattedString,
} from "@typedefs/api/event";
import type { DeviceEventType } from "@typedefs/api/consts";
import type {ApiStationResponse} from "@typedefs/api/station";
export const createProxyDevice = (groupNameOrId: string, deviceName: string) =>
  CacophonyApi.post(`/api/v1/devices/create-proxy-device`, {
    group: groupNameOrId,
    type: "trailcam",
    deviceName,
  }) as Promise<FetchResult<{ id: DeviceId }>>;

export const deleteDevice = (
  groupNameOrId: string | GroupId,
  deviceId: DeviceId
) =>
  CacophonyApi.delete(`/api/v1/devices/device/${deviceId}`, {
    group: groupNameOrId,
  }) as Promise<FetchResult<{ id: DeviceId }>>;

export const getDeviceById = (deviceId: DeviceId) =>
  CacophonyApi.get(`/api/v1/devices/device/${deviceId}`) as Promise<
    FetchResult<{ device: ApiDeviceResponse }>
  >;

export const getDeviceStationAtTime = (deviceId: DeviceId, date?: Date) => {
  const params = new URLSearchParams();
  if (date) {
    params.append("at-time", date.toISOString());
  }
  return CacophonyApi.get(`/api/v1/devices/device/${deviceId}/station?${params}`) as Promise<
      FetchResult<{ station: ApiStationResponse }>
  >;
};

export interface EventApiParams {
  limit?: number;
  offset?: number;
  type?: DeviceEventType | DeviceEventType[];
  endTime?: IsoFormattedString; // Or in the format YYYY-MM-DD hh:mm:ss
  startTime?: IsoFormattedString;
}

export const getLatestEventsByDeviceId = (
  deviceId: number,
  eventParams?: EventApiParams
) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("latest", true.toString());
  params.append("only-active", false.toString());
  if (eventParams) {
    for (const [key, val] of Object.entries(eventParams)) {
      params.append(key, val.toString());
    }
  }
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

export const getDeviceVersionInfo = (deviceId: DeviceId) => {
  return new Promise(async (resolve, reject) => {
    const response = await getLatestEventsByDeviceId(deviceId, {
      type: "versionData",
      limit: 1,
    });
    if (response.success && response.result.rows.length) {
      return resolve(response.result.rows[0].EventDetail.details);
    }
    return resolve(false);
  }) as Promise<Record<string, string> | false>;
};

export const getDeviceConfig = (deviceId: DeviceId) => {
  return new Promise(async (resolve, reject) => {
    const response = await getLatestEventsByDeviceId(deviceId, {
      type: "config",
      limit: 1,
    });
    if (response.success && response.result.rows.length) {
      return resolve(response.result.rows[0].EventDetail.details);
    }
    return resolve(false);
  }) as Promise<DeviceConfigDetail | false>;
};

const latestEventDateFromResponse = (
  a: FetchResult<{ rows: DeviceEvent[] }>,
  b: FetchResult<{ rows: DeviceEvent[] }>
): Date | false => {
  let d1;
  let d2;
  if (a.success && a.result.rows.length) {
    d1 = new Date(a.result.rows[0].dateTime);
  }
  if (b.success && b.result.rows.length) {
    d2 = new Date(b.result.rows[0].dateTime);
  }
  if (d1 && d2) {
    return d1 > d2 ? d1 : d2;
  } else if (d1) {
    return d1;
  } else if (d2) {
    return d2;
  }
  return false;
};
export const getDeviceLastPoweredOff = (deviceId: DeviceId) => {
  return new Promise(async (resolve, reject) => {
    const [r1, r2] = await Promise.all(
      ["daytime-power-off", "powered-off"].map((type) =>
        getLatestEventsByDeviceId(deviceId, {
          type: type as DeviceEventType,
          limit: 1,
        })
      )
    );
    return resolve(latestEventDateFromResponse(r1, r2));
  }) as Promise<any | false>;
};

export const getDeviceLastPoweredOn = (deviceId: DeviceId) => {
  return new Promise(async (resolve, reject) => {
    const [r1, r2] = await Promise.all(
      ["rpi-power-on", "power-on-test"].map((type) =>
        getLatestEventsByDeviceId(deviceId, {
          type: type as DeviceEventType,
          limit: 1,
        })
      )
    );
    return resolve(latestEventDateFromResponse(r1, r2));
  }) as Promise<any | false>;
};

export const assignScheduleToDevice = (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false
) => {
  const params = new URLSearchParams();
  const shouldViewAsSuperUser = false; // TODO
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  params.append("only-active", (!activeAndInactive).toString());
  return CacophonyApi.post(`/api/v1/devices/assign-schedule${params}`, {
    deviceId,
    scheduleId,
  }) as Promise<FetchResult<void>>;
};

export const removeScheduleFromDevice = (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false
) => {
  const suppressGlobalMessaging = true;
  const params = new URLSearchParams();
  const shouldViewAsSuperUser = false; // TODO
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  params.append("only-active", (!activeAndInactive).toString());
  return CacophonyApi.post(
    `/api/v1/devices/remove-schedule?${params}`,
    {
      deviceId,
      scheduleId,
    },
    suppressGlobalMessaging
  ) as Promise<FetchResult<void>>;
};
