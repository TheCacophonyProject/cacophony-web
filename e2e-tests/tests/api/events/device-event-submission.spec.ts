import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { DeviceSim } from "@/helpers/device-sim";
import { TestApiImpl } from "@shared/client";

test.describe("Device event submission", () => {
  test("Event types containing spaces are accepted", async () => {
    const project = await createProjectWithUserAndDevice();
    const user = project.getAdminUser();
    const device = project.getDevice();
    const eventType = "event type with spaces";
    const eventTime = new Date();

    const sim = new DeviceSim(device);
    sim.addEvent({ type: eventType }, eventTime);
    // uploadEvents asserts that the API accepted the submission.
    await sim.uploadEvents();

    const response = await TestApiImpl.Devices.withAuth(user.testId).getLatestEventsByDeviceId(
      device.id,
      { limit: 1 },
    );
    expect(response.success, "fetched latest event").toBe(true);
    const rows = response.success ? response.result.rows : [];
    expect(rows, "event was stored").toHaveLength(1);
    expect(rows[0].EventDetail.type).toBe(eventType);
  });
});
