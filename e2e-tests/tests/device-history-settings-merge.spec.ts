import { ApiDeviceHistorySettings } from "@shared/api/device";
import { addMinutes } from "@/helpers/date-helpers";
import { test, expect } from "@playwright/test";
import { mergeSettings } from "@shared/client/utils";

test("Device unchanged, set synced in place", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...currentSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(false);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Device settings same but older, set synced in place", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...currentSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(false);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Device settings different and older, set synced in place", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: false,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...currentSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(false);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Device same and newer, set synced in place", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...incomingSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(false);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Device different and newer than API", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: false,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...incomingSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(true);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(true);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(false);
});

test("API different and newer, with non-device specific settings, update in place", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...currentSettings,
    ...incomingSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(false);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("API different and newer, with non-device specific settings, already synced, no change", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const currentSettings: ApiDeviceHistorySettings = {
    synced: true,
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "automatic");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    ...currentSettings,
    ...incomingSettings,
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(false);
  expect(mergeResults.syncChanged, "sync changed").toBe(false);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(false);
});

test("Multiple API changes, start from synced", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const timeA = addMinutes(initialDateTime, 1).toISOString();
  const timeB = addMinutes(initialDateTime, 2).toISOString();
  const currentSettings: ApiDeviceHistorySettings = {
    synced: true,
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeA,
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: false,
      updated: timeB,
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "user");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: false,
      updated: timeB,
    },
    synced: false,
  });
  expect(mergeResults.changed, "changed").toBe(true);
  expect(mergeResults.syncChanged, "sync changed").toBe(true);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(true);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(false);
});

test("Multiple API changes, start from unsynced", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const timeA = addMinutes(initialDateTime, 1).toISOString();
  const timeB = addMinutes(initialDateTime, 2).toISOString();
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeA,
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: false,
      updated: timeB,
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "user");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: false,
      updated: timeB,
    },
    synced: false,
  });
  expect(mergeResults.changed, "changed").toBe(true);
  expect(mergeResults.syncChanged, "sync changed").toBe(false);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Multiple API changes, start from unsynced, changes to non-device settings", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const timeA = addMinutes(initialDateTime, 1).toISOString();
  const timeB = addMinutes(initialDateTime, 2).toISOString();
  const currentSettings: ApiDeviceHistorySettings = {
    synced: false,
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeA,
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    referenceImagePOV: "bar",
    thermalRecording: {
      useLowPowerMode: false,
      updated: timeB,
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "user");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    referenceImagePOV: "bar",
    thermalRecording: {
      useLowPowerMode: false,
      updated: timeB,
    },
    synced: false,
  });
  expect(mergeResults.changed, "changed").toBe(true);
  expect(mergeResults.syncChanged, "sync changed").toBe(false);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Multiple API changes, start from synced, changes to only non-device settings", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const timeA = addMinutes(initialDateTime, 1).toISOString();
  const timeB = addMinutes(initialDateTime, 2).toISOString();
  const currentSettings: ApiDeviceHistorySettings = {
    synced: true,
    referenceImagePOV: "foo",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeA,
    },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    referenceImagePOV: "bar",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeB,
    },
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "user");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    referenceImagePOV: "bar",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeB,
    },
    synced: true,
  });
  expect(mergeResults.changed, "changed").toBe(true);
  expect(mergeResults.syncChanged, "sync changed").toBe(false);
  expect(
    mergeResults.shouldCreateNewDeviceHistoryEntry,
    "should create new device history entry",
  ).toBe(false);
  expect(
    mergeResults.shouldUpdateExistingDeviceHistoryEntry,
    "should update existing device history entry",
  ).toBe(true);
});

test("Adding a reference image to already synced settings should leave them synced", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const timeA = addMinutes(initialDateTime, 2).toISOString();
  const currentSettings: ApiDeviceHistorySettings = {
    synced: true,
    thermalRecording: { updated: timeA, useLowPowerMode: true },
  };
  const incomingSettings: ApiDeviceHistorySettings = {
    referenceImagePOV: "bar",
  };
  const mergeResults = mergeSettings(currentSettings, incomingSettings, "user");
  expect(mergeResults.settings, "got settings").toStrictEqual({
    referenceImagePOV: "bar",
    thermalRecording: {
      useLowPowerMode: true,
      updated: timeA,
    },
    synced: true,
  });
});

test("Adding mask settings to already synced settings should set unsynced", async () => {
  // TODO
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
});

test("Adding ratthresh to already synced settings should leave synced", async () => {
  // TODO
});

test("Changing ratthresh should be detected?", async () => {
  // TODO, detect deep object changes in mergeSettings
});

test("Changing mask-regions on synced should set unsynced", async () => {
  // TODO
});
