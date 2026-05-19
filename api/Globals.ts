import { AsyncLocalStorage } from "async_hooks";
import { UserGlobalPermission } from "@typedefs/api/consts.js";
import { DeviceId, UserId } from "@typedefs/api/common.js";

export interface SessionTimingInfo {
  time: bigint;
  user: number;
  system: number;
}

type AsyncStoreValue = number | string | SessionTimingInfo[] | NodeJS.CpuUsage;

interface ApiAsyncLocalStorage extends AsyncLocalStorage<
  Map<string, AsyncStoreValue>
> {
  getStore: () => Map<string, AsyncStoreValue>;
}

export const asyncLocalStorage =
  new AsyncLocalStorage() as ApiAsyncLocalStorage;
export const CACOPHONY_WEB_VERSION = { version: "unknown" };
export const SuperUsers = new Map<
  number,
  { userName: string; globalPermission: UserGlobalPermission }
>();
export const UserNamesById = new Map<UserId, string>();
export const UserGroupNamesById = new Map<UserId, string>();
export const DeviceNamesById = new Map<DeviceId, string>();
export const DeviceGroupNamesByDeviceId = new Map<DeviceId, string>();
export const RequesterStore = new Map<string, SessionTimingInfo[]>();
export const RouteStore = new Map<string, SessionTimingInfo[]>();
