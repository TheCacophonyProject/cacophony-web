import { test, expect } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { SidekickSim } from "@/helpers/sidekick-sim";
import { DeviceSim } from "@/helpers/device-sim";
import { addMinutes } from "@/helpers/date-helpers";
import { ApiRecordingResponse } from "@shared/api/recording";
import { LocationId } from "@shared/api/common";
import { ApiStationResponse as ApiLocationResponse } from "@shared/api/station";

test("A Location/station should become inactive (no last recording time) when there are no longer any non-deleted recordings for it, and should be restored if new recordings are added for that location", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const sidekick = new SidekickSim(project.getAdminUser());
  const deviceHandle = project.getDevice();
  const device = new DeviceSim(deviceHandle, false);

  await test.step("Create initial device location", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(project.locationBase, "home", addMinutes(initialDateTime, 1));
    sidekick.disconnectFromDevice();
  });

  const recording =
    await test.step("Add a recording, check that a station/location is created", async () => {
      device.connectToWifi();
      await device.makeThermalRecording(new ArrayBuffer(100), addMinutes(initialDateTime, 3));
      device.disconnectFromWifi();
      const recordings = (await AdminUser.Recordings.getRecordingsForDeviceInProject(
        deviceHandle.id,
        project.projectHandle.id,
      )) as ApiRecordingResponse[];
      expect(recordings, "recordings exist").toBeTruthy();
      expect(recordings.length, "one recording available").toEqual(1);
      expect(recordings[0].stationId, "recording has station/location").toBeDefined();
      const location = (await AdminUser.Locations.getLocationById(
        recordings[0].stationId as LocationId,
      )) as ApiLocationResponse;
      expect(location, "location exists").toBeTruthy();
      expect(
        location.lastThermalRecordingTime,
        "location has lastThermalRecordingTime",
      ).toBeDefined();

      return { recordingId: recordings[0].id, stationId: recordings[0].stationId };
    });

  await test.step("Delete recording, check that station is no longer active for thermal", async () => {
    const deleteResponse = await AdminUser.Recordings.deleteRecording(recording.recordingId);
    expect(deleteResponse.success, "delete succeeded").toBe(true);
    const location = (await AdminUser.Locations.getLocationById(
      recording.stationId as LocationId,
    )) as ApiLocationResponse;
    expect(location, "location exists").toBeTruthy();
    expect(
      location.lastThermalRecordingTime,
      "location no longer has lastThermalRecordingTime",
    ).toBeUndefined();
  });

  await test.step("Undelete recording, check that station again active for thermal", async () => {
    const deleteResponse = await AdminUser.Recordings.undeleteRecording(recording.recordingId);
    expect(deleteResponse.success, "undelete succeeded").toBe(true);
    const location = (await AdminUser.Locations.getLocationById(
      recording.stationId as LocationId,
    )) as ApiLocationResponse;
    expect(location, "location exists").toBeTruthy();
    expect(
      location.lastThermalRecordingTime,
      "location no longer has lastThermalRecordingTime",
    ).toBeDefined();
  });
});
