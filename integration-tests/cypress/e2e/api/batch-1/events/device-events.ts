import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";

describe("Event upload from device", () => {
  it(`Can upload event payload`, async () => {
    const project = await createProjectWithUserAndDevice();
    const Device = project.api(project.deviceHandles[0]);
    const payload = {
      Timestamp: "0001-01-01T00:00:00Z",
      dateTimes: ["2026-03-02T18:30:29.937331459Z"],
      description: { details: null, type: "throttle" },
    };
    const response = await Device.Devices.submitEventsFromDevice(payload);
    expect(response.success).to.be.true;
  });
});
