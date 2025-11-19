import { AsyncLocalStorage } from "async_hooks";
import { UserGlobalPermission } from "@typedefs/api/consts.js";
import { v4 as uuidv4 } from "uuid";

export interface SessionTimingInfo {
  time: bigint;
  user: number;
  system: number;
}

type AsyncStoreValue =
  | number
  | string
  | SessionTimingInfo[]
  | NodeJS.CpuUsage
  | uuidv4;

interface ApiAsyncLocalStorage
  extends AsyncLocalStorage<Map<string, AsyncStoreValue>> {
  getStore: () => Map<string, AsyncStoreValue>;
}

export const asyncLocalStorage =
  new AsyncLocalStorage() as ApiAsyncLocalStorage;
export const CACOPHONY_WEB_VERSION = { version: "unknown" };
export const SuperUsers = new Map<
  number,
  { userName: string; globalPermission: UserGlobalPermission }
>();
// FIXME: Should these also be in async local store for correctness?
export const RequesterStore = new Map<string, SessionTimingInfo[]>();
export const RouteStore = new Map<string, SessionTimingInfo[]>();
