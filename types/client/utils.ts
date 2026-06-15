import type { JwtTokenPayload } from "./types.js";
import {
  ApiDeviceHistorySettings,
  DeviceHistorySetBy,
} from "@typedefs/api/device.js";
import { IsoFormattedDateString } from "@typedefs/api/common.js";

export const decodeJWT = (jwtString: string): JwtTokenPayload | null => {
  const parts = jwtString.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const decodedToken = JSON.parse(atob(parts[1]));
    return {
      ...decodedToken,
      expiresAt: new Date(decodedToken.exp * 1000),
      createdAt: new Date(decodedToken.iat * 1000),
    };
  } catch (_e) {
    return null;
  }
};

export type NonEmptyArray<T> = [T, ...T[]];

function shallowEqual(obj1: unknown, obj2: unknown) {
  // 1. Check if they are the exact same instance in memory
  if (Object.is(obj1, obj2)) return true;

  // 2. Filter out null or non-object types
  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  ) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  // 3. Compare the number of properties
  if (keys1.length !== keys2.length) return false;

  // 4. Ensure every key in obj1 exists in obj2 and matches strictly
  return keys1.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(obj2, key) &&
      Object.is(
        (obj1 as Record<string, unknown>)[key],
        (obj2 as Record<string, unknown>)[key],
      ),
  );
}

export const mergeSettings = (
  currentSettings: ApiDeviceHistorySettings,
  incomingSettings: ApiDeviceHistorySettings,
  setBy: DeviceHistorySetBy,
  prevSetBy: DeviceHistorySetBy = "user",
): {
  settings: ApiDeviceHistorySettings;
  changed: boolean;
  syncChanged: boolean;
  shouldCreateNewDeviceHistoryEntry: boolean;
  shouldUpdateExistingDeviceHistoryEntry: boolean;
} => {
  const initiallySynced = !!currentSettings.synced;
  const mergedSettings: ApiDeviceHistorySettings = {
    ...currentSettings,
  };

  let changed = false;
  let nonDeviceSettingsChanged = false;
  for (const [key, value] of Object.entries(incomingSettings)) {
    const incomingValue = value;

    // If the current settings do not have this key, add it
    if (!(key in currentSettings)) {
      mergedSettings[key] = incomingValue;
      if (typeof value === "object") {
        // This is a device setting
        changed = true;
        continue;
      }
    }

    const currentSetting = currentSettings[key];

    if (
      currentSetting !== null &&
      incomingValue !== null &&
      typeof currentSetting === "object" &&
      typeof incomingValue === "object" &&
      "updated" in incomingValue &&
      "updated" in currentSetting &&
      (incomingValue as { updated?: unknown }).updated &&
      (currentSetting as { updated?: unknown }).updated
    ) {
      const currentUpdated = new Date(
        (currentSetting as { updated: IsoFormattedDateString })
          .updated as IsoFormattedDateString,
      );
      const incomingUpdated = new Date(
        (incomingValue as { updated: IsoFormattedDateString }).updated,
      );

      if (incomingUpdated > currentUpdated) {
        mergedSettings[key] = incomingValue;
        // Need to check equality without the updated keys.
        const a: { updated?: unknown } = { ...incomingValue };
        delete a.updated;
        const b: { updated?: unknown } = { ...currentSetting };
        delete b.updated;

        if (!shallowEqual(a, b)) {
          changed = true;
        }
      }
    } else {
      // FIXME: What does this do if a device syncs to a settings object that has referenceImage etc?
      // Does this handle removal of keys, i.e. referenceImage?
      mergedSettings[key] = incomingValue;
      if (incomingValue !== currentSetting) {
        console.log("changed when", incomingValue, currentSetting);
        nonDeviceSettingsChanged = true;
      }
    }
  }

  const setByDevice = setBy === "automatic";
  // Check for existing settings that are not objects that are in original but not incoming.

  for (const [key, val] of Object.entries(incomingSettings)) {
    if (key !== "synced" && typeof val !== "object") {
      if (!(key in currentSettings)) {
        nonDeviceSettingsChanged = true;
        break;
      } else if (currentSettings[key] !== val) {
        nonDeviceSettingsChanged = true;
        break;
      }
    }
  }
  // Set synced based on setBy
  mergedSettings.synced = setByDevice || !changed;

  const syncChanged = initiallySynced !== mergedSettings.synced;
  // console.log("device settings changed", changed);
  // console.log("non device settings changed", nonDeviceSettingsChanged);
  // console.log("changed", changed || nonDeviceSettingsChanged);
  // console.log("initially synced", initiallySynced);
  // console.log("sync changed", syncChanged);
  const shouldCreateNewDeviceHistoryEntry =
    (changed && initiallySynced && !setByDevice) ||
    (changed && setByDevice && !initiallySynced) ||
    ["register", "re-register"].includes(prevSetBy);
  return {
    settings: mergedSettings,
    changed: changed || nonDeviceSettingsChanged,
    syncChanged,
    shouldUpdateExistingDeviceHistoryEntry:
      ((syncChanged && !changed) || // When the device accepted the changes and set synced = true
        ((changed || nonDeviceSettingsChanged) &&
          (!syncChanged || initiallySynced))) &&
      !shouldCreateNewDeviceHistoryEntry,
    shouldCreateNewDeviceHistoryEntry,
  };
};
