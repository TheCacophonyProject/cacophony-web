import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { DeviceSim } from "@/helpers/device-sim";
import { addDays, addHours, addSeconds } from "@/helpers/date-helpers";
import { TestDeviceHandle, TestUserHandle } from "@shared/client/types";
import { TestApiImpl } from "@shared/client";
import { DeviceEvent } from "@typedefs/api/event";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors what browse-next's DeviceEventsSubView does on load:
// 1. Fetch the single latest event for the device.
// 2. Use its time as the anchor for "the latest month" of events.
const loadLatestEvent = async (user: TestUserHandle, device: TestDeviceHandle) => {
  const response = await TestApiImpl.Devices.withAuth(user.testId).getLatestEventsByDeviceId(
    device.id,
    { limit: 1 },
  );
  expect(response.success, "fetched latest event").toBe(true);
  return response.success ? response.result.rows : [];
};

const loadEventsInLatestMonth = async (
  user: TestUserHandle,
  device: TestDeviceHandle,
  latestEventTime: Date,
  extra: { type?: string[]; limit?: number } = {},
) => {
  const response = await TestApiImpl.Devices.withAuth(user.testId).getLatestEventsByDeviceId(
    device.id,
    {
      startTime: new Date(latestEventTime.getTime() - 30 * DAY_MS).toISOString(),
      // endTime is exclusive, so step just past the latest event to include it.
      endTime: new Date(latestEventTime.getTime() + 1).toISOString(),
      ...extra,
    },
  );
  expect(response.success, "fetched events in latest month").toBe(true);
  return response.success ? response.result.rows : ([] as DeviceEvent[]);
};

const loadKnownEventTypes = async (
  user: TestUserHandle,
  device: TestDeviceHandle,
  latestEventTime: Date,
) => {
  const response = await TestApiImpl.Devices.withAuth(
    user.testId,
  ).getKnownEventTypesForDeviceInLatestMonth(device.id, latestEventTime);
  expect(response.success, "fetched known event types").toBe(true);
  return response.success ? response.result.eventTypes : [];
};

const uploadEvents = async (device: TestDeviceHandle, events: { type: string; atTime: Date }[]) => {
  const sim = new DeviceSim(device);
  for (const { type, atTime } of events) {
    sim.addEvent({ type }, atTime);
  }
  // Upload "now" so that the events' createdAt is after their dateTime.
  await sim.uploadEvents(addSeconds(new Date(), 0));
};

test.describe("Latest events for a device", () => {
  test("Device with no events has no latest event and no known event types", async () => {
    const project = await createProjectWithUserAndDevice();
    const user = project.getAdminUser();
    const device = project.getDevice();

    expect(await loadLatestEvent(user, device), "no latest event").toHaveLength(0);
    // The view falls back to `new Date()` when there is no latest event.
    expect(await loadKnownEventTypes(user, device, new Date()), "no known event types").toEqual([]);
    expect(await loadEventsInLatestMonth(user, device, new Date()), "no events").toHaveLength(0);
  });

  test.describe("Latest event is recent (within the last month)", () => {
    test("Returns the most recent event first, and only types from the latest month", async () => {
      const project = await createProjectWithUserAndDevice();
      const user = project.getAdminUser();
      const device = project.getDevice();
      const now = new Date();
      const latest = addHours(now, -1);

      await uploadEvents(device, [
        { type: "rpi-power-on", atTime: addDays(now, -3) },
        { type: "powered-off", atTime: addDays(now, -2) },
        { type: "alert", atTime: latest },
        // More than a month before the latest event: shouldn't appear in the types list
        { type: "daytime-power-off", atTime: addDays(latest, -40) },
      ]);

      const [latestEvent] = await loadLatestEvent(user, device);
      expect(latestEvent.EventDetail.type, "latest event is the most recent").toEqual("alert");
      expect(new Date(latestEvent.dateTime as string).getTime()).toEqual(latest.getTime());

      const latestEventTime = new Date(latestEvent.dateTime as string);
      const types = await loadKnownEventTypes(user, device, latestEventTime);
      expect(types.sort(), "known types only include the latest month").toEqual(
        ["alert", "powered-off", "rpi-power-on"].sort(),
      );

      const events = await loadEventsInLatestMonth(user, device, latestEventTime);
      expect(
        events.map(({ EventDetail }) => EventDetail.type),
        "events in the latest month are returned newest first",
      ).toEqual(["alert", "powered-off", "rpi-power-on"]);
    });

    test("Can page back through events and filter by type", async () => {
      const project = await createProjectWithUserAndDevice();
      const user = project.getAdminUser();
      const device = project.getDevice();
      const now = new Date();
      const latest = addHours(now, -1);

      await uploadEvents(device, [
        { type: "rpi-power-on", atTime: addHours(latest, -4) },
        { type: "alert", atTime: addHours(latest, -3) },
        { type: "rpi-power-on", atTime: addHours(latest, -2) },
        { type: "alert", atTime: latest },
      ]);

      // First page, as loadSomeEvents does with `limit`.
      const firstPage = await loadEventsInLatestMonth(user, device, latest, { limit: 2 });
      expect(firstPage.map(({ EventDetail }) => EventDetail.type)).toEqual([
        "alert",
        "rpi-power-on",
      ]);

      // Next page: the view moves `endTime` back to the earliest event it has loaded.
      const earliestLoaded = new Date(firstPage[firstPage.length - 1].dateTime as string);
      const response = await TestApiImpl.Devices.withAuth(user.testId).getLatestEventsByDeviceId(
        device.id,
        {
          startTime: new Date(latest.getTime() - 30 * DAY_MS).toISOString(),
          endTime: earliestLoaded.toISOString(),
          limit: 2,
        },
      );
      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.result.rows.map(({ EventDetail }) => EventDetail.type)).toEqual([
          "alert",
          "rpi-power-on",
        ]);
      }

      const alertsOnly = await loadEventsInLatestMonth(user, device, latest, { type: ["alert"] });
      expect(alertsOnly).toHaveLength(2);
      expect(alertsOnly.every(({ EventDetail }) => EventDetail.type === "alert")).toBe(true);
    });
  });

  test.describe("Latest event is more than a month ago", () => {
    test("Anchors the latest month on the latest event rather than on now", async () => {
      const project = await createProjectWithUserAndDevice();
      const user = project.getAdminUser();
      const device = project.getDevice();
      const latest = addDays(new Date(), -90);

      await uploadEvents(device, [
        { type: "rpi-power-on", atTime: addDays(latest, -10) },
        { type: "powered-off", atTime: addDays(latest, -1) },
        { type: "alert", atTime: latest },
        // Outside of the month before the latest event.
        { type: "daytime-power-off", atTime: addDays(latest, -45) },
      ]);

      const [latestEvent] = await loadLatestEvent(user, device);
      expect(latestEvent, "latest event is found even though it is old").toBeTruthy();
      expect(latestEvent.EventDetail.type).toEqual("alert");
      const latestEventTime = new Date(latestEvent.dateTime as string);
      expect(latestEventTime.getTime()).toEqual(latest.getTime());

      // Anchored on the latest event: gets the types from the month before it.
      const types = await loadKnownEventTypes(user, device, latestEventTime);
      expect(types.sort()).toEqual(["alert", "powered-off", "rpi-power-on"].sort());

      // Anchored on now (the view's fallback when there are no events): nothing from the last month.
      expect(
        await loadKnownEventTypes(user, device, new Date()),
        "a month back from now finds no event types",
      ).toEqual([]);

      const events = await loadEventsInLatestMonth(user, device, latestEventTime);
      expect(events.map(({ EventDetail }) => EventDetail.type)).toEqual([
        "alert",
        "powered-off",
        "rpi-power-on",
      ]);

      // A window ending now finds none of them.
      const response = await TestApiImpl.Devices.withAuth(user.testId).getLatestEventsByDeviceId(
        device.id,
        {
          startTime: new Date(Date.now() - 30 * DAY_MS).toISOString(),
          endTime: new Date().toISOString(),
        },
      );
      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.result.rows, "no events in the last month from now").toHaveLength(0);
      }
    });

    test("The latest event is included at the (exclusive) end of the window", async () => {
      const project = await createProjectWithUserAndDevice();
      const user = project.getAdminUser();
      const device = project.getDevice();
      const latest = addDays(new Date(), -60);
      await uploadEvents(device, [{ type: "alert", atTime: latest }]);

      const response = await TestApiImpl.Devices.withAuth(user.testId).getLatestEventsByDeviceId(
        device.id,
        {
          startTime: new Date(latest.getTime() - 30 * DAY_MS).toISOString(),
          endTime: latest.toISOString(),
        },
      );
      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.result.rows, "endTime is exclusive").toHaveLength(0);
      }
      expect(await loadEventsInLatestMonth(user, device, latest)).toHaveLength(1);
    });
  });
});
