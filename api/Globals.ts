import { AsyncLocalStorage } from "async_hooks";
export const asyncLocalStorage = new AsyncLocalStorage();
export const CACOPHONY_WEB_VERSION = { version: "unknown" };
export const SuperUsers: Map<number, any> = new Map();
export const RequesterStore = new Map<string, any>();
export const RouteStore = new Map<string, any>();
