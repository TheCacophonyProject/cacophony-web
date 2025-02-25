import { AsyncLocalStorage } from "async_hooks";
import type { UserId } from "@typedefs/api/common.js";

export const asyncLocalStorage = new AsyncLocalStorage();
export const CACOPHONY_WEB_VERSION = { version: "unknown" };
export const SuperUsers: Map<number, any> = new Map();
export const RequesterStore = new Map<UserId, any>();
export const RouteStore = new Map<string, any>();
