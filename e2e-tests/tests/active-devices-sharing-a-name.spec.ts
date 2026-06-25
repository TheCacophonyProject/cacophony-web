import { test, expect } from "@/helpers/upload-tests";
import { addDeviceToProject, createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { ApiRecordingResponse, ApiRecordingUploadData } from "@shared/api/recording";
import { RecordingType } from "@shared/api/consts";
import { addMinutes } from "@/helpers/date-helpers";
import { ApiDeviceResponse } from "@shared/api/device";

test("Ensure that multiple devices sharing the same name can be active in separate projects", async ({
  testAudio,
  smallCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const projectA = await createProjectWithUserAndDevice({
    nameBase: "ProjectA",
    initialDateTime,
  });
  const UserA = projectA.api();
  const device1 = await addDeviceToProject(
    "test-device",
    projectA.projectHandle,
    addMinutes(initialDateTime, 1),
    true,
  );

  const projectB = await createProjectWithUserAndDevice({
    nameBase: "ProjectB",
    initialDateTime,
  });
  const UserB = projectB.api();
  const device2 = await addDeviceToProject(
    "test-device",
    projectB.projectHandle,
    addMinutes(initialDateTime, 1),
    true,
  );

  // Verify both devices have the same name but different IDs
  const deviceResponse1 = (await UserA.Devices.getDeviceById(device1.id)) as ApiDeviceResponse;
  const deviceResponse2 = (await UserB.Devices.getDeviceById(device2.id)) as ApiDeviceResponse;
  expect(deviceResponse1.deviceName, "device1 name is correct").toEqual("test-device");
  expect(deviceResponse2.deviceName, "device2 name is correct").toEqual("test-device");
  expect(deviceResponse1.active, "device1 is active").toBe(true);
  expect(deviceResponse2.active, "device2 is active").toBe(true);

  // Verify they are in different groups
  expect(projectA.projectHandle.id).not.toBe(projectB.projectHandle.id);

  // Verify they can perform actions independently
  const recordings1 = (await UserA.Recordings.getRecordingsForDeviceInProject(
    device1.id,
    projectA.projectHandle.id,
  )) as ApiRecordingResponse[];
  expect(recordings1).toBeTruthy();
  const recordings2 = (await UserB.Recordings.getRecordingsForDeviceInProject(
    device2.id,
    projectB.projectHandle.id,
  )) as ApiRecordingResponse[];
  expect(recordings2).toBeTruthy();
  expect(recordings1.length, "no recordings exist yet for projectA").toEqual(0);
  expect(recordings2.length, "no recordings exist yet for projectB").toEqual(0);

  const dummyData1: ApiRecordingUploadData = {
    type: RecordingType.Audio,
    duration: 60,
    recordingDateTime: initialDateTime.toISOString(),
    metadata: {
      "Phone model": "TestPhone",
      "Android API Level": 30,
      "Flight Mode": false,
      "Auto Update": true,
    },
  };
  const dummyData2: ApiRecordingUploadData = {
    type: RecordingType.ThermalRaw,
    duration: 60,
    recordingDateTime: initialDateTime.toISOString(),
    metadata: {
      "Phone model": "TestPhone",
      "Android API Level": 30,
      "Flight Mode": false,
      "Auto Update": true,
    },
  };

  await UserA.Recordings.uploadRecordingOnBehalfOfDevice(
    device1.id,
    dummyData1,
    testAudio,
    "recording1.mp3",
  );
  await UserB.Recordings.uploadRecordingOnBehalfOfDevice(
    device2.id,
    dummyData2,
    smallCptv,
    "recording2.cptv",
  );

  const recordings1After = (await UserA.Recordings.getRecordingsForDeviceInProject(
    device1.id,
    projectA.projectHandle.id,
  )) as ApiRecordingResponse[];
  const recordings2After = (await UserB.Recordings.getRecordingsForDeviceInProject(
    device2.id,
    projectB.projectHandle.id,
  )) as ApiRecordingResponse[];

  expect(recordings1After.length, "recording1 was not added to projectA").toEqual(1);
  expect(recordings2After.length, "recording2 was not added to projectB").toEqual(1);
});
