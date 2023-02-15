import CacophonyApi from "@api/api";
import type { FetchResult } from "@api/types";
import type { DeviceId, GroupId } from "@typedefs/api/common";
import type { ApiDeviceResponse } from "@typedefs/api/device";
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
