import { AsyncLocalStorage } from "async_hooks";

export const asyncLocalStorage = new AsyncLocalStorage();
export const CACOPHONY_WEB_VERSION = { version: "unknown" };
export const SuperUsers: Map<number, any> = new Map();
