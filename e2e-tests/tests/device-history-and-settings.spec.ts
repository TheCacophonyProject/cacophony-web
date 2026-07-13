import { expect, test } from "@/helpers/upload-tests";
import {
  addDeviceToProject,
  createProject,
  createProjectWithUserAndDevice,
  getDeviceTestName,
} from "@/helpers/create-test-entities";
import { SidekickSim } from "@/helpers/sidekick-sim";
import { DeviceSim } from "@/helpers/device-sim";
import { addMinutes, addSeconds } from "@/helpers/date-helpers";
import { spreadLocations } from "@/helpers/location-helpers";
import { ApiDeviceHistory, ApiDeviceHistorySettings, ApiDeviceResponse } from "@shared/api/device";
import { IsoFormattedDateString, LatLng, LocationId, UserId } from "@shared/api/common";
import { uploadRecording, uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { ApiStationResponse as ApiLocationResponse } from "@shared/api/station";
import { ApiRecordingResponse } from "@shared/api/recording";
import { TestApiImpl } from "@shared/client";
import { DeviceEvent } from "@shared/api/event";
import { AudioRecordingMode, RecordingType } from "@shared/api/consts";
import { JwtToken, LoggedInDeviceCredentials } from "@typedefs/client/types";

test(`When setting up a new device (without modem) and setting a new location via sidekick - with internet connectivity - device location and history location should be immediately updated via sidekick.`, async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const userHandle = project.getAdminUser();
  const device = new DeviceSim(deviceHandle, false);
  const sidekick = new SidekickSim(userHandle);
  const locationName = "test location";
  const locationCreatedAt = addMinutes(initialDateTime, 1);

  await test.step("Sidekick supplies initial device location, syncs with API", async () => {
    sidekick.connectToDevice(device);
    // Sidekick adds a new location
    sidekick.addLocation(project.locationBase, locationName, locationCreatedAt);
    // No events were synced from the device
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  await test.step("Check that device location details are correct", async () => {
    const deviceResponse = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    const deviceHistoryResponse = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(deviceHistoryResponse, "got history").toHaveLength(2);
    expect(deviceResponse, "got device").toBeTruthy();
    if (deviceResponse) {
      expect(deviceResponse.location, "device location is set").toStrictEqual(project.locationBase);
    }
    if (deviceHistoryResponse) {
      const latestHistoryEntry = deviceHistoryResponse[deviceHistoryResponse.length - 1];
      expect(latestHistoryEntry.stationId, "device has a named location").not.toBeNull();
      const deviceLocation = await AdminUser.Locations.getLocationById(
        latestHistoryEntry.stationId as LocationId,
      );
      expect(deviceLocation, "got device location").toBeTruthy();
      if (deviceLocation) {
        expect(deviceLocation.location, "device location is correct").toStrictEqual(
          project.locationBase,
        );
        expect(deviceLocation.name, "location name is correct").toEqual(locationName);
        expect(deviceLocation.activeAt, "location active from correct time").toEqual(
          locationCreatedAt.toISOString(),
        );
        expect(deviceLocation.needsRename, "location was manually assigned").toBeUndefined();
        expect(deviceLocation.automatic, "location was manually created").toBe(false);
      }
    }
  });

  await test.step("Sidekick connects again, offloads events from device", async () => {
    sidekick.connectToDevice(device);
    sidekick.userRequestsOffloadFromDevice();
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  await test.step("Ensure the config event is handled correctly when uploaded", async () => {
    // The offload of the config event shouldn't have changed anything, since the location wasn't updated.
    // TODO: Do we attempt to do settings sync via sidekick from browse?
    const deviceResponse = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    const deviceHistoryResponse = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(deviceHistoryResponse, "got history").toHaveLength(2);
    expect(deviceResponse, "got device").toBeTruthy();
    if (deviceResponse) {
      expect(deviceResponse.location, "device location is set").toStrictEqual(project.locationBase);
    }
    if (deviceHistoryResponse) {
      const latestHistoryEntry = deviceHistoryResponse[deviceHistoryResponse.length - 1];
      expect(latestHistoryEntry.stationId, "device has a named location").not.toBeNull();
      const deviceLocation = await AdminUser.Locations.getLocationById(
        latestHistoryEntry.stationId as LocationId,
      );
      expect(deviceLocation, "got device location").toBeTruthy();
      if (deviceLocation) {
        expect(deviceLocation.location, "device location is correct").toStrictEqual(
          project.locationBase,
        );
        expect(deviceLocation.name, "location name is correct").toEqual(locationName);
        expect(deviceLocation.activeAt, "location active from correct time").toEqual(
          locationCreatedAt.toISOString(),
        );
        expect(deviceLocation.needsRename, "location was manually assigned").toBeUndefined();
        expect(deviceLocation.automatic, "location was manually created").toBe(false);
      }
    }
  });
});

test("Two recordings with different precisions of lat/lng location should resolve to the same DeviceHistory entry", async ({
  smallCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const locationA = { lat: -42.123456789, lng: 172.987654321 };
  const locationB = { lat: -42.1234567, lng: 172.9876543 };
  const recordingDateTimeA = addMinutes(initialDateTime, 2);
  const recordingDateTimeB = addMinutes(initialDateTime, 1);

  await test.step("Add recording with high precision lat/lng location", async () => {
    await uploadThermalRecordingFromDevice({
      recordingDateTime: recordingDateTimeA,
      location: locationA,
      file: smallCptv,
      deviceHandle,
    });
  });

  await test.step("Check that device has location assigned, device activity bookkeeping is correct", async () => {
    const device = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(device, "device exists").toBeTruthy();
    if (device) {
      expect(device.location, "device location is correct").toStrictEqual(locationA);
      expect(
        device.lastThermalRecordingTime,
        "device bookkeeping for `lastThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeA.toISOString());
      expect(
        device.earliestThermalRecordingTime,
        "device bookkeeping for `earliestThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeA.toISOString());
    }
    const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(deviceHistory, "device history exists").toBeTruthy();
    if (deviceHistory) {
      expect(deviceHistory.length, "device history has entries").toBeGreaterThan(0);
      const latestHistoryEntry = deviceHistory[deviceHistory.length - 1];
      expect(
        latestHistoryEntry.location,
        "device history entry has correct location",
      ).toStrictEqual(locationA);
      expect(
        latestHistoryEntry.fromDateTime,
        "device history entry starts at correct time",
      ).toEqual(recordingDateTimeA.toISOString());
    }
  });

  await test.step("Add another recording from an *earlier* time, with truncated location precision", async () => {
    await uploadThermalRecordingFromDevice({
      recordingDateTime: recordingDateTimeB,
      location: locationB,
      file: smallCptv,
      deviceHandle,
    });
  });

  await test.step("Check device still has first location set", async () => {
    const device = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(device, "device exists").toBeTruthy();
    if (device) {
      expect(device.location, "device location is correct").toStrictEqual(locationA);
      expect(
        device.lastThermalRecordingTime,
        "device bookkeeping for `lastThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeA.toISOString());
      expect(
        device.earliestThermalRecordingTime,
        "device bookkeeping for `earliestThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeB.toISOString());
    }
    const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(deviceHistory, "device history exists").toBeTruthy();
    if (deviceHistory) {
      expect(deviceHistory.length, "device history has entries").toBeGreaterThan(0);
      expect(deviceHistory.length, "device history has correct number of entries").toEqual(2);
      const latestHistoryEntry = deviceHistory[deviceHistory.length - 1];
      expect(
        latestHistoryEntry.location,
        "device history entry has correct location",
      ).toStrictEqual(locationA);
      expect(
        latestHistoryEntry.fromDateTime,
        "device history entry starts at correct time",
      ).toEqual(recordingDateTimeB.toISOString());
    }
  });
});

test("Two recordings with different *rounded* precisions of lat/lng location should resolve to the same DeviceHistory entry", async ({
  smallCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const locationA = { lat: -36.360367, lng: 174.81726 };
  const locationB = { lat: -36.36036682128906, lng: 174.8172607421875 };
  const recordingDateTimeA = addMinutes(initialDateTime, 2);
  const recordingDateTimeB = addMinutes(initialDateTime, 1);

  await test.step("Add recording with high precision lat/lng location", async () => {
    await uploadThermalRecordingFromDevice({
      recordingDateTime: recordingDateTimeA,
      location: locationA,
      file: smallCptv,
      deviceHandle,
    });
  });

  await test.step("Check that device has location assigned, device activity bookkeeping is correct", async () => {
    const device = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(device, "device exists").toBeTruthy();
    if (device) {
      expect(device.location, "device location is correct").toStrictEqual(locationA);
      expect(
        device.lastThermalRecordingTime,
        "device bookkeeping for `lastThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeA.toISOString());
      expect(
        device.earliestThermalRecordingTime,
        "device bookkeeping for `earliestThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeA.toISOString());
    }
    const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(deviceHistory, "device history exists").toBeTruthy();
    if (deviceHistory) {
      expect(deviceHistory.length, "device history has entries").toBeGreaterThan(0);
      const latestHistoryEntry = deviceHistory[deviceHistory.length - 1];
      expect(
        latestHistoryEntry.location,
        "device history entry has correct location",
      ).toStrictEqual(locationA);
      expect(
        latestHistoryEntry.fromDateTime,
        "device history entry starts at correct time",
      ).toEqual(recordingDateTimeA.toISOString());
    }
  });

  await test.step("Add another recording from an *earlier* time, with truncated location precision", async () => {
    await uploadThermalRecordingFromDevice({
      recordingDateTime: recordingDateTimeB,
      location: locationB,
      file: smallCptv,
      deviceHandle,
    });
  });

  await test.step("Check device still has first location set", async () => {
    const device = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(device, "device exists").toBeTruthy();
    if (device) {
      expect(device.location, "device location is correct").toStrictEqual(locationA);
      expect(
        device.lastThermalRecordingTime,
        "device bookkeeping for `lastThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeA.toISOString());
      expect(
        device.earliestThermalRecordingTime,
        "device bookkeeping for `earliestThermalRecordingTime` is correct",
      ).toEqual(recordingDateTimeB.toISOString());
    }
    const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(deviceHistory, "device history exists").toBeTruthy();
    if (deviceHistory) {
      expect(deviceHistory.length, "device history has entries").toBeGreaterThan(0);
      expect(deviceHistory.length, "device history has correct number of entries").toEqual(2);
      const latestHistoryEntry = deviceHistory[deviceHistory.length - 1];
      expect(
        latestHistoryEntry.location,
        "device history entry has correct location",
      ).toStrictEqual(locationA);
      expect(
        latestHistoryEntry.fromDateTime,
        "device history entry starts at correct time",
      ).toEqual(recordingDateTimeB.toISOString());
    }
  });
});

test("When deleting the last recording from a location/station the location should be preserved, but shouldn't show up when asking for locations with recordings", async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const recordingTime = addMinutes(initialDateTime, 1);
  const initialLocationName = "initial location";
  const project = await createProjectWithUserAndDevice();
  // Add a location and a recording
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const sidekick = new SidekickSim(project.getAdminUser());
  // Device has no modem, but that shouldn't really matter for this test either way.
  const device = new DeviceSim(deviceHandle, false);

  await test.step("Sidekick supplies initial recording and named location, syncs with API", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(project.locationBase, initialLocationName, initialDateTime);
    await sidekick.makeTestThermalRecording(new ArrayBuffer(100), recordingTime);
    sidekick.userRequestsOffloadFromDevice();
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  const namedLocation =
    await test.step("Check that project has expected named location", async () => {
      const allLocations = (await AdminUser.Projects.getLocationsForProject(
        project.projectHandle.id,
      )) as ApiLocationResponse[];
      expect(allLocations, "locations exist").toBeTruthy();
      const namedLocation = allLocations.find((location) => location.name === initialLocationName);
      expect(namedLocation, "named location exists").not.toBeUndefined();
      expect(namedLocation!.lastThermalRecordingTime, "last thermal time is set").toEqual(
        recordingTime.toISOString(),
      );
      expect(namedLocation!.earliestThermalRecordingTime, "earliest thermal time is set").toEqual(
        recordingTime.toISOString(),
      );
      expect(
        namedLocation!.lastActiveThermalTime,
        "last active thermal time is set for sidekick uploaded recording",
      ).toBeUndefined();
      return namedLocation;
    });

  const recording = await test.step("Check recording exists at expected location", async () => {
    const recordings = (await AdminUser.Recordings.getRecordingsForLocationsInProject(
      (namedLocation as ApiLocationResponse).id,
      project.projectHandle.id,
    )) as ApiRecordingResponse[];
    expect(recordings, "recordings exists").toBeTruthy();
    expect(recordings.length, "a single recording exists").toEqual(1);
    return recordings[0];
  });

  await test.step("Delete recording", async () => {
    const deleteRecordingResponse = await AdminUser.Recordings.deleteRecording(recording.id);
    expect(deleteRecordingResponse.success, "recording deleted successfully").toBe(true);
  });

  await test.step("Location still exists, but bookkeeping has it inactive", async () => {
    const allLocations = (await AdminUser.Projects.getLocationsForProject(
      project.projectHandle.id,
    )) as ApiLocationResponse[];
    expect(allLocations, "locations exist").toBeTruthy();
    const namedLocation = allLocations.find((location) => location.name === initialLocationName);
    expect(namedLocation, "named location exists").not.toBeUndefined();
    expect(namedLocation?.lastThermalRecordingTime).toBeUndefined();
    expect(namedLocation?.earliestThermalRecordingTime).toBeUndefined();
  });

  await test.step("Asking for only active locations with recordings doesn't return location", async () => {
    const allLocations = (await AdminUser.Projects.getLocationsForProject(
      project.projectHandle.id,
      false,
      false,
    )) as ApiLocationResponse[];
    expect(allLocations, "got locations array").toBeTruthy();
    expect(allLocations.length, "location with no recordings is filtered out of results").toEqual(
      0,
    );
  });

  await test.step("Undelete recording should restore location bookkeeping times", async () => {
    const undeleteRecordingResponse = await AdminUser.Recordings.undeleteRecording(recording.id);
    expect(undeleteRecordingResponse.success, "recording undeleted successfully").toBe(true);
  });

  await test.step("Check that the device location is the named location set via sidekick, location bookkeeping shows it active", async () => {
    // Should have a named location as set
    const allLocations = (await AdminUser.Projects.getLocationsForProject(
      project.projectHandle.id,
    )) as ApiLocationResponse[];
    expect(allLocations, "locations exist").toBeTruthy();
    const namedLocation = allLocations.find((location) => location.name === initialLocationName);
    expect(namedLocation, "named location exists").not.toBeUndefined();
    console.log("here", namedLocation);
    expect(namedLocation!.lastThermalRecordingTime, "last thermal time is set").toEqual(
      recordingTime.toISOString(),
    );
    expect(namedLocation!.earliestThermalRecordingTime, "earliest thermal time is set").toEqual(
      recordingTime.toISOString(),
    );
    expect(
      namedLocation!.lastActiveThermalTime,
      "last active thermal time is set for sidekick uploaded recording",
    ).toBeUndefined();
  });
});

test("Attempting to add a reference image to a device with no known location fails", async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  await test.step("User tries to add reference image for device with location", async () => {
    const response = await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      project.getDevice().id,
      new ArrayBuffer(100),
    );
    expect(response.success, "adding image failed").toBe(false);
    expect(response.result).toMatchObject({
      messages: ["No location for device to tag with reference"],
    });
  });
});

test(`Changing a device location should clear the current device reference image from DeviceHistory from the time of moving`, async ({
  deviceReferenceImage,
}) => {
  // Moving the device clears the latest reference image from settings from the time the device was moved.
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const sidekick = new SidekickSim(project.getAdminUser());

  const firstLocationSetTime = addMinutes(initialDateTime, 1);
  const referenceImageSetTime = addMinutes(initialDateTime, 2);

  // Device has no modem, but that shouldn't really matter for this test either way.
  const device = new DeviceSim(deviceHandle, false);
  const locations = spreadLocations(project.locationBase, 2);
  await test.step("Sidekick supplies initial location and reference image, syncs with API", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(locations[0], "initial location", firstLocationSetTime);
    sidekick.addReferencePhoto(deviceReferenceImage, referenceImageSetTime);
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  await test.step(`Check device history and current settings for device #${deviceHandle.id}`, async () => {
    // Check that the device history is what we would expect, and there is a current reference image.
    const deviceResponse = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(deviceResponse).toBeTruthy();
    if (deviceHandle) {
      expect((deviceResponse as ApiDeviceResponse).location).toStrictEqual(locations[0]);
    }
    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settingsResponse.success, "settings request succeeded").toBe(true);
    expect(
      (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings
        .referenceImagePOV,
      "reference image set in latest settings",
    ).toBeDefined();

    const deviceReferenceImageExists = await AdminUser.Devices.hasReferenceImageForDeviceAtTime(
      deviceHandle.id,
    );
    expect(deviceReferenceImageExists.success, "reference image should exist").toBe(true);
    if (deviceReferenceImageExists.success) {
      // FIXME: Make sidekick correctly add the fromDateTime for the reference image.
      expect(deviceReferenceImageExists.result.fromDateTime).toEqual(
        firstLocationSetTime.toISOString(),
      );
    }
  });

  await test.step("Later, sidekick changes the device location, syncs with API", async () => {
    // 1 hr later
    sidekick.connectToDevice(device);
    sidekick.addLocation(locations[1], "second location", addMinutes(initialDateTime, 60));
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  await test.step(`Re-check device history and current settings for device #${deviceHandle.id}`, async () => {
    // Check that the device history is what we would expect, and there is now no current reference image.
    const deviceResponse = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(deviceResponse).toBeTruthy();
    if (deviceHandle) {
      expect(
        (deviceResponse as ApiDeviceResponse).location,
        "device location is the second location",
      ).toStrictEqual(locations[1]);
    }
    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settingsResponse.success, "settings request succeeded").toBe(true);
    expect(
      (settingsResponse.result as { settings: ApiDeviceHistorySettings | null }).settings
        ?.referenceImagePOV,
      "no reference image set in latest settings",
    ).toBeUndefined();

    const deviceReferenceImageExists = await AdminUser.Devices.hasReferenceImageForDeviceAtTime(
      deviceHandle.id,
    );
    expect(deviceReferenceImageExists.success, "no reference image at current time").toBe(false);
  });
});

test(`Changing a device location by uploading a recording in a new location should clear the current device reference image from DeviceHistory`, async ({
  deviceReferenceImage,
}) => {
  // Uploading a new recording with a different location clears the latest reference image from settings from the recordingDateTime.
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const sidekick = new SidekickSim(project.getAdminUser());

  const firstLocationSetTime = addMinutes(initialDateTime, 1);
  const referenceImageSetTime = addMinutes(initialDateTime, 2);

  // Device has no modem, but that shouldn't really matter for this test either way.
  const device = new DeviceSim(deviceHandle, false);
  const locations = spreadLocations(project.locationBase, 2);

  await test.step("Sidekick supplies initial location and reference image for device, syncs with API", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(locations[0], "initial location", firstLocationSetTime);
    sidekick.addReferencePhoto(deviceReferenceImage, referenceImageSetTime);
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  await test.step(`Check device history and current settings for device #${deviceHandle.id}`, async () => {
    // Check that the device history is what we would expect, and there is a current reference image.
    const deviceResponse = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(deviceResponse).toBeTruthy();
    if (deviceHandle) {
      expect((deviceResponse as ApiDeviceResponse).location).toStrictEqual(locations[0]);
    }
    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settingsResponse.success, "settings request succeeded").toBe(true);
    expect(
      (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings
        .referenceImagePOV,
      "reference image set in latest settings",
    ).toBeDefined();

    const deviceReferenceImageExists = await AdminUser.Devices.hasReferenceImageForDeviceAtTime(
      deviceHandle.id,
    );
    expect(deviceReferenceImageExists.success, "reference image should exist").toBe(true);
    if (deviceReferenceImageExists.success) {
      // FIXME: Make sidekick correctly add the fromDateTime for the reference image.
      expect(deviceReferenceImageExists.result.fromDateTime).toEqual(
        firstLocationSetTime.toISOString(),
      );
    }
  });

  await test.step("Later, sidekick makes test recording, and then device syncs with API", async () => {
    // ~1 hr later
    sidekick.connectToDevice(device);
    sidekick.addLocation(locations[1], "second location", addMinutes(initialDateTime, 50));
    await sidekick.makeTestThermalRecording(new ArrayBuffer(100), addMinutes(initialDateTime, 60));
    sidekick.disconnectFromDevice();
    device.connectToWifi();
    await device.syncWithApi();
    device.disconnectFromWifi();
  });

  await test.step(`Re-check device history and current settings for device #${deviceHandle.id}`, async () => {
    // Check that the device history is what we would expect, and there is now no current reference image.
    const deviceResponse = await AdminUser.Devices.getDeviceById(deviceHandle.id);
    expect(deviceResponse).toBeTruthy();
    if (deviceHandle) {
      expect(
        (deviceResponse as ApiDeviceResponse).location,
        "device location is the second location",
      ).toStrictEqual(locations[1]);
    }
    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settingsResponse.success, "settings request succeeded").toBe(true);
    console.log();
    expect(
      (settingsResponse.result as { settings: ApiDeviceHistorySettings | null }).settings
        ?.referenceImagePOV,
      "no reference image set in latest settings",
    ).toBeUndefined();

    const deviceReferenceImageExists = await AdminUser.Devices.hasReferenceImageForDeviceAtTime(
      deviceHandle.id,
    );
    expect(deviceReferenceImageExists.success, "no reference image at current time").toBe(false);
  });
});

test(`Moving a device between projects that has no recordings should make that device inactive`, async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const secondProject = await createProject("second project", project.getAdminUser());
  const deviceHandle = project.getDevice();
  const newDeviceHandle =
    await test.step("Move device from first project to second project", async () => {
      const device = new DeviceSim(deviceHandle, false);
      const adminUserCreds = (await TestApiImpl.getCredentials(
        project.getAdminUser().testId,
      )) as JwtToken<UserId>;
      return await device.reRegisterInProject(
        adminUserCreds,
        secondProject.id,
        addMinutes(initialDateTime, 5),
        getDeviceTestName("moved device"),
      );
    });

  await test.step("Check visibility of devices in each project", async () => {
    const firstDevice = await AdminUser.Devices.getDeviceById(deviceHandle.id, false);
    expect(firstDevice, "device in first project is inaccessible").toEqual(false);
    const firstDeviceActiveAndInactive = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(firstDeviceActiveAndInactive, "device in first project still exists").toBeTruthy();
    expect(firstDeviceActiveAndInactive.active, "device in first project is inactive").toBe(false);

    const secondDevice = await AdminUser.Devices.getDeviceById(newDeviceHandle.id);
    expect(secondDevice, "moved device in second project can be accessed").toBeTruthy();
  });
});

test(`Moving a device between projects`, async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const secondProject = await createProject("second project", project.getAdminUser());
  const deviceHandle = project.getDevice();

  const sidekick = new SidekickSim(project.getAdminUser());
  const device = new DeviceSim(deviceHandle, false);
  const location = { ...project.locationBase };

  const firstLocationTime = addMinutes(initialDateTime, 1);
  const firstRecordingTime = addMinutes(initialDateTime, 2);
  const secondRecordingTime = addMinutes(initialDateTime, 3);
  const deviceMovedProjectsAt = addMinutes(initialDateTime, 5);
  const firstCustomEventTime = addMinutes(initialDateTime, 4);
  const secondCustomEventTime = addMinutes(initialDateTime, 6);
  const firstRecordingForMovedDeviceTime = addMinutes(initialDateTime, 7);

  await test.step("Make initial recording with location and sync with API", async () => {
    sidekick.hostHotspot();
    sidekick.connectToDevice(device);
    sidekick.addLocation(location, "initial location", firstLocationTime);
    // When we re-register a device, if it hasn't made any recordings yet it will be deleted.
    // For this test, make a recording and sync first, then make another.
    await device.makeThermalRecording(new ArrayBuffer(100), firstRecordingTime);
    sidekick.disconnectFromDevice();
    sidekick.disconnectHotspot();
    device.connectToWifi();

    // Upon sync, device gets an automatic device history entry + location at time t+2 minute, then gets a config event
    // at time t+1 containing an initial location (the same as the recording).  That should push the device history entry
    // back to time t+1.
    await device.syncWithApi();
    device.disconnectFromWifi();
  });

  await test.step("Make sure first device has expected settings and history", async () => {
    const firstDevice = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(firstDevice, "device in first project can be accessed").toBeTruthy();
    const deviceHistory = (await AdminUser.Devices.getDeviceHistoryInTest(
      deviceHandle.id,
    )) as ApiDeviceHistory[];
    expect(deviceHistory, "device history exists").toBeTruthy();
    expect(deviceHistory.length, "device history has entries").toEqual(2);
    expect(
      deviceHistory[0].fromDateTime,
      "device history registration fromDateTime is correct",
    ).toEqual(initialDateTime.toISOString());
    expect(deviceHistory[1].fromDateTime, "device history config fromDateTime is correct").toEqual(
      addMinutes(initialDateTime, 1).toISOString(),
    );
  });

  const newDeviceHandle = await test.step("Move the device to the second project", async () => {
    // Make a recording with the initial device so that there's an old recording to attribute to the initial
    // device after the move to another project
    await device.makeThermalRecording(new ArrayBuffer(100), secondRecordingTime);

    // Move the device to another project via sidekick.  Sidekick needs to be connected to the internet to do this,
    // so we model *sidekick* hosting the hotspot for the device, as this device is not configured with a modem.
    sidekick.hostHotspot();
    sidekick.connectToDevice(device);

    // Add an event with the initial device so we can make sure it's correctly attributed after the move.
    device.addEvent({ type: "custom", details: { test: true } }, firstCustomEventTime);

    const adminUserCreds = (await TestApiImpl.getCredentials(
      project.getAdminUser().testId,
    )) as JwtToken<UserId>;
    const newDeviceHandle = await sidekick.changeDeviceProject(
      adminUserCreds,
      secondProject.id,
      deviceMovedProjectsAt,
      getDeviceTestName("moved device"),
    );

    sidekick.disconnectFromDevice();
    sidekick.disconnectHotspot();
    // Add another event so there are two events from different devices when we offload them.
    device.addEvent({ type: "custom", details: { test: true } }, secondCustomEventTime);
    return newDeviceHandle;
  });

  await test.step("Check that both devices can still be accessed, first device inactive, moved device has same location initially", async () => {
    const firstDevice = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(firstDevice, "device in first project can still be accessed").toBeTruthy();
    expect(firstDevice.active, "device in first project was set inactive").toBe(false);

    const secondDevice = (await AdminUser.Devices.getDeviceById(
      newDeviceHandle.id,
    )) as ApiDeviceResponse;
    expect(secondDevice, "second device can be accessed").toBeTruthy();
    expect(
      secondDevice.location,
      "second device retains location of first initially",
    ).toStrictEqual(location);
  });

  await test.step("Check device history", async () => {
    const deviceHistoryA = (await AdminUser.Devices.getDeviceHistoryInTest(
      deviceHandle.id,
    )) as ApiDeviceHistory[];
    const deviceHistoryB = (await AdminUser.Devices.getDeviceHistoryInTest(
      newDeviceHandle.id,
    )) as ApiDeviceHistory[];
    expect(deviceHistoryA).toBeTruthy();
    expect(deviceHistoryB).toBeTruthy();
    expect(deviceHistoryB.length, "moved device history has entries").toEqual(1);
    expect(deviceHistoryB[0].fromDateTime, "moved device fromDateTime is the move time").toEqual(
      deviceMovedProjectsAt.toISOString(),
    );
    expect(deviceHistoryB[0].setBy, "earliest entry for moved device is 're-register'").toEqual(
      "re-register",
    );
  });

  await test.step("Device makes a recording, connects to wifi and syncs with API", async () => {
    // Make a recording in the new project (this isn't strictly necessary for event testing)
    await device.makeThermalRecording(new ArrayBuffer(200), firstRecordingForMovedDeviceTime);
    device.connectToWifi();

    // FIXME: Maybe we could also solve duplicate events?
    // Now the device connects and syncs recordings and events, from *before* the move to another project, and after.
    await device.syncWithApi();
    device.disconnectFromWifi();
  });

  await test.step("Check that recordings are attributed to correct projects/devices", async () => {
    const projectARecordings =
      (await AdminUser.Recordings.getRecordingsForLocationsAndDevicesInProject(
        project.projectHandle.id,
      )) as ApiRecordingResponse[];
    expect(projectARecordings, "project recordings exist").toBeTruthy();
    expect(projectARecordings.length, "first project has two recordings").toEqual(2);

    const projectBRecordings =
      (await AdminUser.Recordings.getRecordingsForLocationsAndDevicesInProject(
        secondProject.id,
      )) as ApiRecordingResponse[];
    expect(projectBRecordings, "second project recordings exist").toBeTruthy();
    expect(projectBRecordings.length, "second project has one recording").toEqual(1);
  });

  await test.step("Check that each event was attributed to the correct device", async () => {
    const eventsAResponse = await AdminUser.Devices.getLatestEventsByDeviceId(deviceHandle.id);
    expect(eventsAResponse.success).toBe(true);
    const eventsA = (eventsAResponse.result as { rows: DeviceEvent[] }).rows;
    expect(eventsA.length, "first device has events").toEqual(2);
    expect(eventsA[1].EventDetail.type).toEqual("config");
    expect(eventsA[0].EventDetail.type).toEqual("custom");
    expect(eventsA[0].dateTime).toEqual(firstCustomEventTime.toISOString());

    const eventsBResponse = await AdminUser.Devices.getLatestEventsByDeviceId(newDeviceHandle.id);
    expect(eventsBResponse.success).toBe(true);
    const eventsB = (eventsBResponse.result as { rows: DeviceEvent[] }).rows;
    expect(eventsB.length, "second device has events").toEqual(1);
    expect(eventsB[0].EventDetail.type).toEqual("custom");
    expect(eventsB[0].dateTime).toEqual(secondCustomEventTime.toISOString());
  });

  await test.step("Check device history is as expected", async () => {
    const deviceHistoryA = (await AdminUser.Devices.getDeviceHistoryInTest(
      deviceHandle.id,
    )) as ApiDeviceHistory[];
    const deviceHistoryB = (await AdminUser.Devices.getDeviceHistoryInTest(
      newDeviceHandle.id,
    )) as ApiDeviceHistory[];
    expect(deviceHistoryA).toBeTruthy();
    expect(deviceHistoryB).toBeTruthy();

    expect(deviceHistoryB.length, "moved device history has entries").toEqual(1);
    expect(deviceHistoryB[0].fromDateTime, "moved device fromDateTime is the move time").toEqual(
      deviceMovedProjectsAt.toISOString(),
    );
    expect(deviceHistoryB[0].setBy, "earliest entry for moved device is 're-register'").toEqual(
      "re-register",
    );
  });
});

test("Devices moved to a different project should have new recordings attributed correctly", async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const secondProject = await createProject("second project", project.getAdminUser());
  const deviceHandle = project.getDevice();
  const sidekick = new SidekickSim(project.getAdminUser());
  const device = new DeviceSim(deviceHandle, true);
  const location = { ...project.locationBase };
  device.updateLocation(location, addMinutes(initialDateTime, 1));

  await test.step("Create a recording for the device", async () => {
    await device.makeThermalRecording(new ArrayBuffer(100), addMinutes(initialDateTime, 2));
  });

  const newDeviceHandle = await test.step("Move the device to another project", async () => {
    sidekick.hostHotspot();
    sidekick.connectToDevice(device);
    const adminUserCreds = (await TestApiImpl.getCredentials(
      project.getAdminUser().testId,
    )) as JwtToken<UserId>;
    const newDeviceHandle = await sidekick.changeDeviceProject(
      adminUserCreds,
      secondProject.id,
      addMinutes(initialDateTime, 5),
      getDeviceTestName("moved device"),
    );
    sidekick.disconnectFromDevice();
    sidekick.disconnectHotspot();
    return newDeviceHandle;
  });

  await test.step("Check that moved device lastConnectionTime and last/earliest thermalRecordingTime are cleared", async () => {
    const deviceResponse = (await AdminUser.Devices.getDeviceById(
      newDeviceHandle.id,
    )) as ApiDeviceResponse;
    expect(deviceResponse, "got device response").toBeTruthy();
    expect(deviceResponse.lastConnectionTime, "Last connection time is the move time").toEqual(
      addMinutes(initialDateTime, 5).toISOString(),
    );
    expect(
      deviceResponse.earliestThermalRecordingTime,
      "Earliest thermal recording time cleared",
    ).toBeUndefined();
    expect(
      deviceResponse.lastThermalRecordingTime,
      "Last thermal recording time cleared",
    ).toBeUndefined();
  });

  await test.step("Create a recording for the moved device", async () => {
    await device.makeThermalRecording(new ArrayBuffer(100), addMinutes(initialDateTime, 7));
  });

  await test.step("Check that the recording device id is correct", async () => {
    const projectBRecordings =
      (await AdminUser.Recordings.getRecordingsForLocationsAndDevicesInProject(
        secondProject.id,
      )) as ApiRecordingResponse[];
    expect(projectBRecordings, "second project recordings exist").toBeTruthy();
    expect(projectBRecordings.length, "second project has one recording").toEqual(1);
    expect(projectBRecordings[0].deviceId, "recording device id is correct").toEqual(
      newDeviceHandle.id,
    );
  });
});

test("Devices renamed in the same project should retain prior location and settings", async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const sidekick = new SidekickSim(project.getAdminUser());
  const device = new DeviceSim(deviceHandle, false);

  const initialSettingsAndLocation =
    await test.step("Add some settings and a location to device", async () => {
      await AdminUser.Devices.updateDeviceSettings(
        deviceHandle.id,
        {
          thermalRecording: {
            updated: addSeconds(initialDateTime, 30).toISOString(),
            useLowPowerMode: true,
          },
        },
        addSeconds(initialDateTime, 30),
      );
      await AdminUser.Devices.updateDeviceLocation(
        deviceHandle.id,
        project.locationBase,
        addSeconds(initialDateTime, 50),
      );
      const settingsResponse = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
      expect(settingsResponse.success).toBe(true);
      return settingsResponse.result as { settings: ApiDeviceHistorySettings; location: LatLng };
    });

  const renamedDeviceHandle = await test.step("Rename device in project", async () => {
    sidekick.hostHotspot();
    sidekick.connectToDevice(device);
    const adminUserCreds = (await TestApiImpl.getCredentials(
      project.getAdminUser().testId,
    )) as JwtToken<UserId>;
    const renamedDeviceHandle = await sidekick.changeDeviceProject(
      adminUserCreds,
      project.projectHandle.id,
      addMinutes(initialDateTime, 1),
      getDeviceTestName("renamed device"),
    );
    sidekick.disconnectFromDevice();
    sidekick.disconnectHotspot();
    return renamedDeviceHandle;
  });

  await test.step("Check that settings and location have not changed", async () => {
    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(renamedDeviceHandle.id);
    expect(settingsResponse.success, "got settings").toBe(true);
    const newSettingsAndLocation = settingsResponse.result as {
      settings: ApiDeviceHistorySettings;
      location: LatLng;
    };
    expect(newSettingsAndLocation.settings, "settings are unchanged").toStrictEqual(
      initialSettingsAndLocation.settings,
    );
    expect(newSettingsAndLocation.location, "location is unchanged").toStrictEqual(
      initialSettingsAndLocation.location,
    );
  });
});

test("Devices moved between projects should retain prior settings, but not reference images etc", async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const projectA = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = projectA.api();
  const deviceHandleA = projectA.getDevice();
  const projectB = await createProject("Project B", projectA.getAdminUser());

  const sidekick = new SidekickSim(projectA.getAdminUser());
  const device = new DeviceSim(deviceHandleA, false);
  await test.step("Sidekick supplies initial location", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(projectA.locationBase, "initial location", addMinutes(initialDateTime, 1));
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  const projectInvariantSettings: ApiDeviceHistorySettings = {
    audioRecording: {
      updated: addMinutes(initialDateTime, 1).toISOString(),
      audioMode: AudioRecordingMode.AudioOnly,
    },
  };
  const initialSettings: ApiDeviceHistorySettings = {
    ...projectInvariantSettings,
    referenceImagePOV: "Foo",
    referenceImagePOVFileSize: 100,
    referenceImagePOVMimeType: "image/jpeg",
  };

  await test.step("Set initial settings in Project A", async () => {
    await AdminUser.Devices.updateDeviceSettings(
      deviceHandleA.id,
      initialSettings,
      addMinutes(initialDateTime, 2),
    );
    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(deviceHandleA.id);
    expect(settingsResponse.success, "settings request succeeded").toBe(true);
    expect(
      (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings,
      "settings are as expected",
    ).toMatchObject(initialSettings);
  });

  const newDeviceHandle = await test.step("Move device to Project B", async () => {
    sidekick.hostHotspot();
    sidekick.connectToDevice(device);
    const adminUserCreds = (await TestApiImpl.getCredentials(
      projectA.getAdminUser().testId,
    )) as JwtToken<UserId>;
    const newDeviceHandle = await sidekick.changeDeviceProject(
      adminUserCreds,
      projectB.id,
      addMinutes(initialDateTime, 5),
      getDeviceTestName("moved device"),
    );
    sidekick.disconnectFromDevice();
    sidekick.disconnectHotspot();
    return newDeviceHandle;
  });

  await test.step("Verify only project invariant settings are in Project B", async () => {
    const deviceResponse = (await AdminUser.Devices.getDeviceById(
      newDeviceHandle.id,
    )) as ApiDeviceResponse;
    expect(deviceResponse, "got moved device").toBeTruthy();
    expect(deviceResponse.location, "location stayed the same").toStrictEqual(
      projectA.locationBase,
    );

    const settingsResponse = await AdminUser.Devices.getSettingsForDevice(newDeviceHandle.id);
    expect(settingsResponse.success, "settings request succeeded").toBe(true);
    expect(
      (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings,
      "settings retain project invariant settings",
    ).toStrictEqual({
      ...projectInvariantSettings,
      synced: false,
    });
  });
});

test("Replacing a device in a project (already has a device with the same name, should 'become' that device)", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const userHandle = project.getAdminUser();
  const secondProject = await createProject("second", userHandle);
  const secondProjectDevice = await addDeviceToProject(
    deviceHandle.testId,
    secondProject,
    initialDateTime,
    true,
  );
  const sidekick = new SidekickSim(project.getAdminUser());
  const device = new DeviceSim(deviceHandle, false);

  await test.step("Sidekick supplies initial location", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(project.locationBase, "initial location", addMinutes(initialDateTime, 1));
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  const projectInvariantSettings: ApiDeviceHistorySettings = {
    audioRecording: {
      updated: addMinutes(initialDateTime, 1).toISOString(),
      audioMode: AudioRecordingMode.AudioOnly,
    },
  };
  const initialSettings: ApiDeviceHistorySettings = {
    ...projectInvariantSettings,
    referenceImagePOV: "Foo",
    referenceImagePOVFileSize: 100,
    referenceImagePOVMimeType: "image/jpeg",
  };

  await test.step("Add settings and reference image to first (broken) device", async () => {
    await AdminUser.Devices.updateDeviceSettings(
      deviceHandle.id,
      initialSettings,
      addMinutes(initialDateTime, 2),
    );
  });

  await test.step("Check that both devices share the same name", async () => {
    const firstDevice = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(firstDevice, "got first device").toBeTruthy();
    const secondDevice = (await AdminUser.Devices.getDeviceById(
      secondProjectDevice.id,
    )) as ApiDeviceResponse;
    expect(secondDevice, "got second device").toBeTruthy();
    expect(
      firstDevice.deviceName,
      `names match: ${firstDevice.deviceName} == ${secondDevice.deviceName}`,
    ).toEqual(secondDevice.deviceName);
  });

  await test.step("Add a recording for the device to be replaced, so that deleting it will just set it inactive.", async () => {
    // Add a recording for the device to be replaced, so that deleting it will just set it inactive.
    const recordingId = await uploadRecording(userHandle, {
      recordingDateTime: addMinutes(initialDateTime, 7),
      location: { ...project.locationBase },
      file: new ArrayBuffer(400),
      deviceId: secondProjectDevice.id,
      type: RecordingType.ThermalRaw,
    });
    expect(recordingId, "uploaded recording").toBeTruthy();
    const recording = (await AdminUser.Recordings.getRecordingById(
      recordingId,
    )) as ApiRecordingResponse;
    expect(recording, "got recording").toBeTruthy();
    expect(recording.deviceId, "recording has correct device id").toEqual(secondProjectDevice.id);
    expect(recording.groupId, "recording has correct project id").toEqual(secondProject.id);
  });

  await test.step("Set target device inactive", async () => {
    // Set target device/device to be replaced inactive first.
    const deletedResponse = await AdminUser.Devices.deleteDevice(
      secondProject.id,
      secondProjectDevice.id,
    );
    expect(deletedResponse.success).toBe(true);

    const secondDevice = (await AdminUser.Devices.getDeviceById(
      secondProjectDevice.id,
    )) as ApiDeviceResponse;
    expect(secondDevice, "got second device").toBeTruthy();
    expect(secondDevice.active, "device is inactive").toBe(false);
  });

  const replacementDeviceInTargetProject =
    await test.step("Move replacement device into project with broken device", async () => {
      const device = new DeviceSim(deviceHandle, false);
      const adminUserCreds = (await TestApiImpl.getCredentials(
        userHandle.testId,
      )) as JwtToken<UserId>;
      const newDeviceHandle = await device.reRegisterInProject(
        adminUserCreds,
        secondProject.id,
        addMinutes(initialDateTime, 5),
        deviceHandle.testId,
      );
      expect(newDeviceHandle.id, "replacement device got replaced devices' id").toEqual(
        secondProjectDevice.id,
      );

      // Now there should be two devices, the old one made inactive
      const replacedDevice = (await AdminUser.Devices.getDeviceById(
        secondProjectDevice.id,
      )) as ApiDeviceResponse;
      expect(replacedDevice, "got replaced device").toBeTruthy();

      const repairedReplacementDevice = (await AdminUser.Devices.getDeviceById(
        newDeviceHandle.id,
      )) as ApiDeviceResponse;
      expect(repairedReplacementDevice, "got replacement device").toBeTruthy();

      const movedDevice = (await AdminUser.Devices.getDeviceById(
        deviceHandle.id,
      )) as ApiDeviceResponse;
      expect(movedDevice, "moved device still exists in original project").toBeTruthy();
      expect(movedDevice.active, "moved device is inactive in original project").toBe(false);
      return newDeviceHandle;
    });

  await test.step("Replacement device has no settings or reference images", async () => {
    const settings = await AdminUser.Devices.getSettingsForDevice(
      replacementDeviceInTargetProject.id,
    );
    expect(settings, "got settings").toBeTruthy();
    const settingsAndLocation = settings.result as {
      settings: ApiDeviceHistorySettings;
      location: LatLng;
    };
    expect(settingsAndLocation.settings, "settings were cleared").toBeNull();
    expect(settingsAndLocation.location, "location was inherited").toStrictEqual(
      project.locationBase,
    );
  });
});

test(`Adding a reference image - at a given time via sidekick for a device with its own internet connection - and retrieving it works`, async ({
  testHighPowerCptv,
}) => {
  // Checking the device history shows us both reference images.
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  // 1. Setup the device and add it to a project while connected to the internet.
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();

  const deviceHandle = project.getDevice();
  const userHandle = project.getAdminUser();
  const sidekick = new SidekickSim(userHandle);
  const device = new DeviceSim(deviceHandle);

  // 2. Connect to devices' hotspot and set an initial location, and a reference image.
  sidekick.connectToDevice(device);
  // Sidekick wants to pre-create a named location, which will be added as a location in the API when online.
  sidekick.addLocation(project.locationBase, "Initial location", addMinutes(initialDateTime, 1));
  await sidekick.makeTestThermalRecording(testHighPowerCptv, addSeconds(initialDateTime, 90));

  // NOTE: For setting reference images in test, any ArrayBuffer of bytes will do; there's no server-side
  // image processing or validation
  sidekick.addReferencePhoto(new ArrayBuffer(100), addMinutes(initialDateTime, 2));
  await sidekick.makeTestThermalRecording(testHighPowerCptv, addMinutes(initialDateTime, 3));
  sidekick.disconnectFromDevice();
  await sidekick.syncWithApi();

  // NOTE: Device should have already synced when a recording was made, this is probably redundant
  await device.syncWithApi();

  // TODO: For offline devices, match sidekick behaviour if sidekick keeps a list of uploaded recordings,
  //  to ensure they are deleted from the device next time sidekick connects?  Not sure that's even a thing.
  await test.step("Check device", async () => {
    // TODO: We really need to be able to update a device location at a given time in the past, for sidekick sync to work.
    const checkDevice = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(checkDevice, "got device info").toBeTruthy();
    expect(checkDevice.location, "location is what was set").toStrictEqual(project.locationBase);
  });
  await test.step("Check device settings", async () => {
    const deviceSettings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(deviceSettings.success, "got device settings response").toBe(true);
    expect(
      (deviceSettings.result as { settings: ApiDeviceHistorySettings }).settings,
      "settings exists",
    ).toMatchObject({
      referenceImagePOVFileSize: 100,
    });
  });

  await test.step("Check initial reference image", async () => {
    const referenceImage = await AdminUser.Devices.getReferenceImageForDeviceAtCurrentLocation(
      deviceHandle.id,
    );
    // Reference image should be the one that was initially set.
    expect(referenceImage.success, "got reference image").toBe(true);
    expect((referenceImage.result as Blob).size, "reference image is the correct size").toEqual(
      100,
    );
  });

  await test.step("Add a second later reference image", async () => {
    await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      deviceHandle.id,
      new ArrayBuffer(200),
      addMinutes(initialDateTime, 60),
    );
  });

  await test.step("Check second reference image", async () => {
    const referenceImage = await AdminUser.Devices.getReferenceImageForDeviceAtCurrentLocation(
      deviceHandle.id,
    );
    // Reference image should be the one that was set second (at a later time).
    expect(referenceImage.success, "got reference image").toBe(true);
    expect((referenceImage.result as Blob).size, "reference image is the correct size").toEqual(
      200,
    );
  });

  await test.step("Check device settings history", async () => {
    const history = (await AdminUser.Devices.getDeviceHistoryInTest(
      deviceHandle.id,
    )) as ApiDeviceHistory[];
    expect(history, "got device settings history").toBeTruthy();
    console.log(history);
  });

  await test.step("Check first reference image again", async () => {
    const referenceImage = await AdminUser.Devices.getReferenceImageForDeviceAtTime(
      deviceHandle.id,
      addMinutes(initialDateTime, 30),
    );
    // Reference image should be the one original one, at this time offset.
    expect(referenceImage.success, "got reference image").toBe(true);
    expect((referenceImage.result as Blob).size, "reference image is the correct size").toEqual(
      100,
    );
  });
});

test("Setting a reference image shouldn't clobber device settings", async ({
  deviceReferenceImage,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const device = project.getDevice();

  await test.step("Make sure device is initialised with no settings or location", async () => {
    const uninitialisedSettings = await AdminUser.Devices.getSettingsForDevice(device.id);
    expect(uninitialisedSettings.success, "getting null settings succeeds").toBe(true);
    expect(
      (uninitialisedSettings.result as { settings: ApiDeviceHistorySettings | null }).settings,
      "settings are empty",
    ).toBeNull();
    expect(
      (uninitialisedSettings.result as { location: LatLng }).location,
      "location is null",
    ).toBeNull();
  });

  const initialSettings = await test.step("Add initial settings for device", async () => {
    const initialSettings = {
      audioRecording: {
        updated: initialDateTime.toISOString(),
        audioMode: AudioRecordingMode.AudioOnly,
      },
    };

    // Add some settings to the device
    const updatedSettingsResponse = await AdminUser.Devices.updateDeviceSettings(
      device.id,
      initialSettings,
      addMinutes(initialDateTime, 1),
    );
    expect(updatedSettingsResponse.success, "settings were updated").toBe(true);
    const settings = (updatedSettingsResponse.result as { settings: ApiDeviceHistorySettings })
      .settings;
    expect(settings, "settings are updated and set to 'unsynced'").toEqual({
      ...initialSettings,
      synced: false,
    });
    {
      const settingsResponse = await AdminUser.Devices.getSettingsForDevice(device.id);
      const settings = (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings;
      expect(settings, "actual retrieved settings are updated and set to 'unsynced'").toEqual({
        ...initialSettings,
        synced: false,
      });
    }
    return initialSettings;
  });

  await test.step("Add a location and check that settings are the same as initially set", async () => {
    // Add a location (so we can add a reference image)
    await AdminUser.Devices.updateDeviceLocation(
      device.id,
      project.locationBase,
      addMinutes(initialDateTime, 2),
    );

    {
      const settingsResponse = await AdminUser.Devices.getSettingsForDevice(device.id);
      const settings = (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings;
      expect(settings, "settings are updated and set to 'unsynced'").toEqual({
        ...initialSettings,
        synced: false,
      });
    }
  });

  await test.step("Add a reference image, check settings are correctly updated", async () => {
    const addedResponse = await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      device.id,
      deviceReferenceImage,
      addMinutes(initialDateTime, 3),
    );
    expect(addedResponse.success, "adding image succeeded").toBe(true);
    const referenceImageDetails = addedResponse.result as { key: string; size: number };
    {
      const settingsResponse = await AdminUser.Devices.getSettingsForDevice(device.id);
      const settings = (settingsResponse.result as { settings: ApiDeviceHistorySettings }).settings;
      expect(
        settings,
        "settings are updated to include reference image and previous settings",
      ).toEqual({
        ...initialSettings,
        referenceImagePOV: referenceImageDetails.key,
        referenceImagePOVFileSize: referenceImageDetails.size,
        referenceImagePOVMimeType: "image/webp",
        synced: false,
      });
    }
  });
});

test("Older device config events that come in after some newer settings changes preserve later settings", async () => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const adminUserHandle = project.getAdminUser();
  const sidekick = new SidekickSim(adminUserHandle);
  const device = new DeviceSim(deviceHandle, true);
  const initialLocationName = "initial location";
  const initialLocationTime = addMinutes(initialDateTime, 1);

  await test.step("Create some initial settings state for device", async () => {
    // Sidekick does some stuff.
    sidekick.connectToDevice(device);
    sidekick.addLocation(project.locationBase, initialLocationName, initialLocationTime);
    sidekick.addReferencePhoto(new ArrayBuffer(100), addMinutes(initialDateTime, 2));
    await sidekick.makeTestThermalRecording(new ArrayBuffer(200), addMinutes(initialDateTime, 3));
    // Sidekick disconnects
    sidekick.disconnectFromDevice();
    await device.syncWithApi();
  });

  let locationId: LocationId = -1;
  let initialDeviceHistory: ApiDeviceHistory[] = [];
  await test.step("Check that state of device/settings is as expected", async () => {
    // Test recording, and then events were uploaded,
    // and a location/station should be created along with initial device history.
    const history = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(history).toBeDefined();
    if (history) {
      initialDeviceHistory = history;
      const latestHistoryEntry = history[history.length - 1];
      console.log(history);
      expect(latestHistoryEntry.stationId, "stationId exists").not.toBeNull();
      const location = await AdminUser.Locations.getLocationById(
        latestHistoryEntry.stationId as LocationId,
      );
      expect(location).toBeTruthy();
      if (location) {
        // The location should have been created by the recording upload, but then it should have been back-dated
        // to the original location creation time by syncing the 'config' event from the camera which was set
        // when the location was set.
        expect(location.location, "location is correct").toStrictEqual(project.locationBase);
        expect(location.automatic, "location is automatic").toBe(true);
        expect(location.needsRename, "location needs rename").toBe(true);
        expect(location.activeAt, "location active from time it was created in sidekick").toEqual(
          initialLocationTime.toISOString(),
        );
        locationId = location.id;
      }
    }
  });

  await test.step("Device adds recordings and syncs: settings/history unchanged", async () => {
    // Device makes some recordings
    await device.makeThermalRecording(new ArrayBuffer(100), addMinutes(initialDateTime, 4));
    // Device uploads recordings and events as it goes
    await device.syncWithApi();
    const history = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(history).toBeDefined();
    expect(history, "history is unchanged").toStrictEqual(initialDeviceHistory);
  });

  await test.step("Sidekick syncs the config event from the device, settings are correctly updated", async () => {
    await sidekick.syncWithApi();
    const history = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
    expect(history).toBeDefined();
    if (history) {
      const latestHistoryEntry = history[history.length - 1];
      expect(latestHistoryEntry.settings, "settings has been populated").not.toBeNull();
    }

    // Make sure location was created with supplied name.
    // If the location exists and has an automatic name, it should get the stored name.

    // Sidekick does a `syncLocations` thing, which is mostly wrong (especially in how it matches by distance)
    // It's unclear exactly where that would happen in the sidekick sync sequence, so it's hard to test at the moment.

    const location = await AdminUser.Locations.getLocationById(locationId);
    expect(location).toBeTruthy();
    if (location) {
      expect(location.name, "location has the name that was set via sidekick").toEqual(
        initialLocationName,
      );
      expect(location.automatic, "location is no longer automatic").toBe(false);
      expect(location.needsRename, "location no longer needs rename").toBeUndefined();
      expect(
        location.activeAt,
        "location is active from the date it was created in sidekick",
      ).toEqual(initialLocationTime.toISOString());
    }
  });
});

test("When there are settings on device but no settings in API, device sync should transfer the settings from device to api", async () => {
  // TODO
});

test("Backdating a new reference image to apply to earlier recordings in that location", async () => {
  // NOTE: Add a device with a location, add some recordings, change some settings,
  //  and then make sure the reference image gets applied backwards to all the previous settings at that
  //  location until it finds a different location, or another reference image?
  //  ***This is DANGEROUS, because the camera viewport may have changed, but it's probably the right thing.***

  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const userHandle = project.getAdminUser();

  const sidekick = new SidekickSim(userHandle);
  const device = new DeviceSim(deviceHandle, true);
  const initialLocationName = "initial location";
  const initialLocationTime = addMinutes(initialDateTime, 1);
  const locations = spreadLocations(project.locationBase, 2);

  await test.step("Sidekick supplies initial location", async () => {
    // Sidekick does some stuff.
    sidekick.connectToDevice(device);
    sidekick.addLocation(locations[0], initialLocationName, initialLocationTime);
    // Sidekick disconnects
    sidekick.disconnectFromDevice();
    await device.syncWithApi();
  });

  await test.step("Recordings made at initial location", async () => {
    await uploadThermalRecordingFromDevice({
      recordingDateTime: addMinutes(initialDateTime, 10),
      location: locations[0],
      file: new ArrayBuffer(100),
      deviceHandle,
    });

    // NOTE: We update the device settings via the device, so that the settings are set to "synced"
    await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
      deviceHandle.id,
      {
        audioRecording: {
          updated: addMinutes(initialDateTime, 15).toISOString(),
          audioMode: AudioRecordingMode.AudioOnly,
        },
      },
      addMinutes(initialDateTime, 15),
    );

    await uploadThermalRecordingFromDevice({
      recordingDateTime: addMinutes(initialDateTime, 20),
      location: locations[1],
      file: new ArrayBuffer(100),
      deviceHandle,
    });

    await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
      deviceHandle.id,
      {
        audioRecording: {
          updated: addMinutes(initialDateTime, 25).toISOString(),
          audioMode: AudioRecordingMode.AudioAndThermal,
        },
      },
      addMinutes(initialDateTime, 25),
    );

    await uploadThermalRecordingFromDevice({
      recordingDateTime: addMinutes(initialDateTime, 30),
      location: locations[1],
      file: new ArrayBuffer(100),
      deviceHandle,
    });

    await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
      deviceHandle.id,
      {
        audioRecording: {
          updated: addMinutes(initialDateTime, 35).toISOString(),
          audioMode: AudioRecordingMode.AudioOrThermal,
        },
      },
      addMinutes(initialDateTime, 35),
    );

    const deviceHistory = (await AdminUser.Devices.getDeviceHistoryInTest(
      deviceHandle.id,
    )) as ApiDeviceHistory[];
    expect(deviceHistory, "history exists").toBeTruthy();
    console.log(deviceHistory);
  });

  await test.step("Add reference image at a later time", async () => {
    // This reference image should apply all the way back to the earliest instance of this location
    const refImage = new ArrayBuffer(500);
    await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      deviceHandle.id,
      refImage,
      addMinutes(initialDateTime, 40),
    );
  });

  await test.step("Verify reference image applies to earlier recordings in same location", async () => {
    {
      const refImageAtEarlierTimeBeforeLocationChange =
        await AdminUser.Devices.getReferenceImageForDeviceAtTime(
          deviceHandle.id,
          addMinutes(initialDateTime, 15),
        );

      expect(
        refImageAtEarlierTimeBeforeLocationChange.success,
        "Reference image should be not found",
      ).toBe(false);
    }
    {
      const refImageAtEarlierTime = await AdminUser.Devices.getReferenceImageForDeviceAtTime(
        deviceHandle.id,
        addMinutes(initialDateTime, 25),
      );
      expect(refImageAtEarlierTime.success, "Reference image should be found").toBe(true);
      expect(
        (refImageAtEarlierTime.result as Blob).size,
        "Should match the size of the added reference image",
      ).toEqual(500);
    }
  });
});

test("Backdating device history seems problematic.  We want to backdate start times for a device in a location, but not settings?", async () => {
  // TODO.  Maybe we don't backdate if settings is not null?
});

test("Synchronisation of user settings to the device, and device set settings to the API", async () => {
  // TODO
  // A user should be able to set settings in the API.
  // A device should be able to pick up these settings and mark the settings as "synced".
  // Multiple user settings changes between device syncs should collapse to the same settings change.
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const userSuppliedReferenceImage: ApiDeviceHistorySettings = {
    referenceImagePOV: "foo",
    referenceImagePOVFileSize: 12314,
    referenceImageInSituMimeType: "image/jpeg",
  };
  const userSuppliedSettings: ApiDeviceHistorySettings = {
    ...userSuppliedReferenceImage,
    audioRecording: {
      audioMode: AudioRecordingMode.AudioOnly,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };
  const deviceSuppliedSettings = {
    audioRecording: {
      audioMode: AudioRecordingMode.Disabled,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };
  const newerDeviceSuppliedSettings = {
    audioRecording: {
      audioMode: AudioRecordingMode.Disabled,
      updated: addMinutes(initialDateTime, 3).toISOString(),
    },
  };

  await test.step("Add user settings and then confirm they were added", async () => {
    const addedSettings = await AdminUser.Devices.updateDeviceSettings(
      deviceHandle.id,
      userSuppliedSettings,
    );
    console.log(addedSettings);
    const settings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settings, "settings exist").toBeTruthy();
    expect(
      (settings.result as { settings: ApiDeviceHistorySettings }).settings,
      "settings are as expected",
    ).toStrictEqual({
      ...userSuppliedSettings,
      synced: false,
    });
  });
  await test.step("Device merges its own settings, where the audio settings are older", async () => {
    const resolvedSettings = await TestApiImpl.Devices.withAuth(
      deviceHandle.testId,
    ).updateDeviceSettings(deviceHandle.id, deviceSuppliedSettings);
    expect(resolvedSettings, "settings exist").toBeTruthy();
    expect(
      (resolvedSettings.result as { settings: ApiDeviceHistorySettings }).settings,
      "settings are as expected",
    ).toStrictEqual({
      ...userSuppliedSettings,
      synced: true,
    });
  });

  await test.step("Device merges its own settings, where the audio settings are newer", async () => {
    const resolvedSettings = await TestApiImpl.Devices.withAuth(
      deviceHandle.testId,
    ).updateDeviceSettings(deviceHandle.id, newerDeviceSuppliedSettings);
    expect(resolvedSettings, "settings exist").toBeTruthy();
    expect(
      (resolvedSettings.result as { settings: ApiDeviceHistorySettings }).settings,
      "settings are as expected",
    ).toStrictEqual({
      ...userSuppliedReferenceImage,
      ...newerDeviceSuppliedSettings,
      synced: true,
    });
  });
});

test("Project member can add recordings by device on behalf - for inactive devices, and the recordings are attributed to the correct devices", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const userHandle = project.getAdminUser();
  const device = new DeviceSim(deviceHandle, false);
  const adminUserCreds = (await TestApiImpl.getCredentials(userHandle.testId)) as JwtToken<UserId>;

  const newDeviceHandle = await test.step("Rename device in same project", async () => {
    return await device.reRegisterInProject(
      adminUserCreds,
      project.projectHandle.id,
      addMinutes(initialDateTime, 5),
      getDeviceTestName("moved device"),
    );
  });

  const newerDeviceHandle = await test.step("Rename device *again* in same project", async () => {
    return await device.reRegisterInProject(
      adminUserCreds,
      project.projectHandle.id,
      addMinutes(initialDateTime, 10),
      getDeviceTestName("re-moved device"),
    );
  });

  await test.step("upload recordings in project at various times as different devices (active and inactive), check they belong to the correct device", async () => {
    const recordingIdA = await uploadRecording(userHandle, {
      recordingDateTime: addMinutes(initialDateTime, 20),
      location: { ...project.locationBase },
      file: new ArrayBuffer(100),
      deviceId: newDeviceHandle.id,
      type: RecordingType.ThermalRaw,
    });

    const recordingIdB = await uploadRecording(userHandle, {
      recordingDateTime: addMinutes(initialDateTime, 22),
      location: { ...project.locationBase },
      file: new ArrayBuffer(200),
      deviceId: deviceHandle.id,
      type: RecordingType.ThermalRaw,
    });

    const recordingIdC = await uploadRecording(userHandle, {
      recordingDateTime: addMinutes(initialDateTime, 3),
      location: { ...project.locationBase },
      file: new ArrayBuffer(300),
      deviceId: deviceHandle.id,
      type: RecordingType.ThermalRaw,
    });

    const recordingIdD = await uploadRecording(userHandle, {
      recordingDateTime: addMinutes(initialDateTime, 7),
      location: { ...project.locationBase },
      file: new ArrayBuffer(400),
      deviceId: deviceHandle.id,
      type: RecordingType.ThermalRaw,
    });
    {
      const recording = (await AdminUser.Recordings.getRecordingById(
        recordingIdA,
      )) as ApiRecordingResponse;
      expect(recording, "got recording A").toBeTruthy();
      expect(recording.deviceId, "device is correct").toEqual(newerDeviceHandle.id);
    }
    {
      const recording = (await AdminUser.Recordings.getRecordingById(
        recordingIdB,
      )) as ApiRecordingResponse;
      expect(recording, "got recording B").toBeTruthy();
      expect(recording.deviceId, "device is correct").toEqual(newerDeviceHandle.id);
    }
    {
      const recording = (await AdminUser.Recordings.getRecordingById(
        recordingIdC,
      )) as ApiRecordingResponse;
      expect(recording, "got recording C").toBeTruthy();
      expect(recording.deviceId, "device is correct").toEqual(deviceHandle.id);
    }
    {
      const recording = (await AdminUser.Recordings.getRecordingById(
        recordingIdD,
      )) as ApiRecordingResponse;
      expect(recording, "got recording D").toBeTruthy();
      expect(recording.deviceId, "device is correct").toEqual(newDeviceHandle.id);
    }
  });
});

test("Adding a sequence of reference images in quick succession with no recordings in the interim should collapse to the latest one", async () => {
  // NOTE: This checks to see if the previous device history entry had a stationId or not.  If not, then we
  // can safely assume that no recordings were added at that location yet, and each new reference image can supercede
  // the last.
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const addLocationTime = addMinutes(initialDateTime, 1);
  await test.step("Add a device location and a sequence of reference images in succession", async () => {
    await AdminUser.Devices.updateDeviceLocation(
      deviceHandle.id,
      project.locationBase,
      addLocationTime,
    );
    await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      deviceHandle.id,
      new ArrayBuffer(100),
      addMinutes(initialDateTime, 2),
    );
    await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      deviceHandle.id,
      new ArrayBuffer(200),
      addMinutes(initialDateTime, 3),
    );
    await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      deviceHandle.id,
      new ArrayBuffer(300),
      addMinutes(initialDateTime, 4),
    );
    await AdminUser.Devices.addReferenceImageForDeviceAtTime(
      deviceHandle.id,
      new ArrayBuffer(400),
      addMinutes(initialDateTime, 5),
    );
  });

  await test.step("Ensure device history has collapsed to only include the latest reference image at the earliest location time", async () => {
    const deviceHistory = (await AdminUser.Devices.getDeviceHistoryInTest(
      deviceHandle.id,
    )) as ApiDeviceHistory[];
    expect(deviceHistory, "device history exists").toBeDefined();

    const referenceImageExistsCheck = await AdminUser.Devices.hasReferenceImageForDeviceAtTime(
      deviceHandle.id,
      addLocationTime,
    );
    expect(referenceImageExistsCheck.success, "exists check succeeds").toBe(true);
    const payload = referenceImageExistsCheck.result as {
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    };
    expect(payload.fromDateTime, "fromDateTime matches initial time").toEqual(
      addLocationTime.toISOString(),
    );
    expect(payload.untilDateTime, "untilDateTime open ended").toBeUndefined();

    // Expected, the last reference image should collapse into the entry for addLocationTime
    const referenceImage = await AdminUser.Devices.getReferenceImageForDeviceAtTime(
      deviceHandle.id,
      addLocationTime,
    );
    expect(referenceImage.success, "A reference image exists").toBe(true);
    expect((referenceImage.result as Blob).size, "size matches final reference image size").toEqual(
      400,
    );
  });
});

test("Uploading a recording via sidekick when the device hasn't connected in over 25hrs should set Device.lastConnectionTime to NULL", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const sidekick = new SidekickSim(project.getAdminUser());
  const deviceHandle = project.getDevice();
  const device = new DeviceSim(deviceHandle, false); // This is an "offline" device, but initially it will connect via wifi

  await test.step("Create initial device location", async () => {
    sidekick.connectToDevice(device);
    sidekick.addLocation(project.locationBase, "home", addMinutes(initialDateTime, 1));
    sidekick.disconnectFromDevice();
  });

  await test.step("Make an initial thermal recording and connect the device to wifi to upload it directly", async () => {
    await device.makeThermalRecording(new ArrayBuffer(100), addMinutes(initialDateTime, 3));
    device.connectToWifi();
    await device.syncWithApi(addMinutes(initialDateTime, 4));
    device.disconnectFromWifi();
  });

  await test.step("Check device lastConnectionTime", async () => {
    const deviceResponse = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(deviceResponse, "device exists").toBeTruthy();
    expect(deviceResponse.lastConnectionTime, "has last connection time").toBeDefined();
  });

  await test.step("Add a recording 26hrs later and offload/upload it via sidekick", async () => {
    await device.makeThermalRecording(new ArrayBuffer(200), addMinutes(initialDateTime, 60 * 27));
    sidekick.connectToDevice(device);
    sidekick.userRequestsOffloadFromDevice();
    sidekick.disconnectFromDevice();
    await sidekick.syncWithApi();
  });

  await test.step("Check device lastConnectionTime", async () => {
    const deviceResponse = (await AdminUser.Devices.getDeviceById(
      deviceHandle.id,
    )) as ApiDeviceResponse;
    expect(deviceResponse, "device exists").toBeTruthy();
    expect(
      deviceResponse.lastConnectionTime,
      "no last connection time, device is now treated as 'offline'",
    ).toBeUndefined();
  });
});

test("Getting latest unsynced and latest synced settings for a device works", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();

  const userSuppliedSettings: ApiDeviceHistorySettings = {
    audioRecording: {
      audioMode: AudioRecordingMode.Disabled,
      updated: addMinutes(initialDateTime, 1).toISOString(),
    },
  };

  const deviceSuppliedSettings: ApiDeviceHistorySettings = {
    thermalRecording: {
      useLowPowerMode: true,
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  };

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    userSuppliedSettings,
    addMinutes(initialDateTime, 1),
  );

  await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
    deviceHandle.id,
    deviceSuppliedSettings,
    addMinutes(initialDateTime, 2),
  );

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      battery: {
        updated: addMinutes(initialDateTime, 3).toISOString(),
        chemistry: "Foo",
      },
    },
    addMinutes(initialDateTime, 3),
  );

  const settings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
  console.log(JSON.stringify(settings, null, 2));

  const allSettings = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
  console.log(JSON.stringify(allSettings, null, 2));
  // TODO
});

test("Test deleting reference images, apparently you can actually do that, maybe from Sidekick?", async ({
  deviceReferenceImage,
}) => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  await AdminUser.Devices.updateDeviceLocation(
    deviceHandle.id,
    project.locationBase,
    addMinutes(initialDateTime, 1),
  );
  await AdminUser.Devices.addReferenceImageForDeviceAtTime(
    deviceHandle.id,
    deviceReferenceImage,
    addMinutes(initialDateTime, 3),
  );
  const response = await AdminUser.Devices.deleteAllReferenceImagesForDeviceAtTime(deviceHandle.id);
  expect(response.success, "delete succeeded").toBe(true);
  expect(response.result, "image was deleted").toMatchObject({
    messages: ["Reference image deleted successfully"],
  });

  const deviceSettings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
  const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(deviceHandle.id);
  // TODO: Flesh out assertions
  const referenceImageResponse = await AdminUser.Devices.getReferenceImageForDeviceAtTime(
    deviceHandle.id,
    addMinutes(initialDateTime, 4),
  );
  expect(referenceImageResponse.success, "can't get deleted reference image").toBe(false);
});

test("Settings merge/sync rules: device has older settings that get changed from browse", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: true,
        updated: addMinutes(initialDateTime, 2).toISOString(),
      },
    },
    addMinutes(initialDateTime, 2),
  );

  // The device has some older initial settings
  await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: false,
        updated: addMinutes(initialDateTime, 1).toISOString(),
      },
    },
    addMinutes(initialDateTime, 4),
  );

  const deviceHistory = (await AdminUser.Devices.getDeviceHistoryInTest(
    deviceHandle.id,
  )) as ApiDeviceHistory[];
  expect(deviceHistory, "got history").toBeTruthy();
  expect(deviceHistory.length, "got correct number of entries in history").toEqual(2);
  expect(deviceHistory.map((item) => item.settings)).toStrictEqual([
    null,
    {
      synced: true,
      thermalRecording: { updated: "2026-01-01T00:02:00.000Z", useLowPowerMode: true },
    },
  ]);
});

test("Settings merge/sync rules: device has older same settings as unsynced from browse", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: true,
        updated: addMinutes(initialDateTime, 2).toISOString(),
      },
    },
    addMinutes(initialDateTime, 2),
  );

  // The device has some older initial settings
  await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: true,
        updated: addMinutes(initialDateTime, 1).toISOString(),
      },
    },
    addMinutes(initialDateTime, 4),
  );

  // Because the device had the same settings as the API, and the only thing that changed was the sync state,
  // we can update the sync state in place in the DeviceHistory entry.
  const deviceHistory = (await AdminUser.Devices.getDeviceHistoryInTest(
    deviceHandle.id,
  )) as ApiDeviceHistory[];
  expect(deviceHistory, "got history").toBeTruthy();
  console.log(deviceHistory);
  expect(deviceHistory.length, "got correct number of entries in history").toEqual(2);
  expect(deviceHistory.map((item) => item.settings)).toStrictEqual([
    null,
    {
      synced: true,
      thermalRecording: { updated: "2026-01-01T00:02:00.000Z", useLowPowerMode: true },
    },
  ]);
});

test("Settings merge/sync rules: user sets multiple unsynced settings in a row", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: true,
        updated: addMinutes(initialDateTime, 2).toISOString(),
      },
    },
    addMinutes(initialDateTime, 2),
  );

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: false,
        updated: addMinutes(initialDateTime, 3).toISOString(),
      },
    },
    addMinutes(initialDateTime, 3),
  );

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: true,
        updated: addMinutes(initialDateTime, 4).toISOString(),
      },
    },
    addMinutes(initialDateTime, 4),
  );

  // Multiple unsynced updates result in the last one being used.
  const deviceHistory = (await AdminUser.Devices.getDeviceHistoryInTest(
    deviceHandle.id,
  )) as ApiDeviceHistory[];
  expect(deviceHistory, "got history").toBeTruthy();
  expect(deviceHistory.length, "got correct number of entries in history").toEqual(2);
  // Should only retain the last `fromDateTime`
  expect(deviceHistory[1].fromDateTime).toEqual(addMinutes(initialDateTime, 4).toISOString());
  console.log(deviceHistory);
  expect(deviceHistory.map((item) => item.settings)).toStrictEqual([
    null,
    {
      synced: false,
      thermalRecording: { updated: "2026-01-01T00:04:00.000Z", useLowPowerMode: true },
    },
  ]);
});

test("Settings merge/sync rules: device sync shouldn't care about mask regions and reference images", async () => {
  // TODO
});

test("Adding a reference image on top of already synced settings should not change sync status", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      thermalRecording: {
        useLowPowerMode: true,
        updated: addMinutes(initialDateTime, 2).toISOString(),
      },
    },
    addMinutes(initialDateTime, 2),
  );

  {
    const settings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settings, "got settings").toBeTruthy();
    expect((settings.result as { settings: ApiDeviceHistorySettings }).settings.synced).toBe(false);
  }

  // Device calls update to sync?
  await TestApiImpl.Devices.withAuth(deviceHandle.testId).updateDeviceSettings(
    deviceHandle.id,
    {},
    addMinutes(initialDateTime, 4),
  );

  {
    const settings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settings, "got settings").toBeTruthy();
    expect((settings.result as { settings: ApiDeviceHistorySettings }).settings.synced).toBe(true);
  }

  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      referenceImagePOV: "foo",
    },
    addMinutes(initialDateTime, 5),
  );

  {
    const settings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    expect(settings, "got settings").toBeTruthy();
    expect((settings.result as { settings: ApiDeviceHistorySettings }).settings.synced).toBe(true);
  }
});

test("Should be able to submit events on behalf of inactive devices, so long as the user has access to the same device via device uuid", async () => {
  const initialDateTime = new Date("2026-01-01T00:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  {
    const eventAddedResponse = await AdminUser.Devices.submitEventsOnBehalfOfDevice(
      deviceHandle.id,
      {
        description: {
          type: "foo",
          details: { bar: true },
        },
        dateTimes: [addMinutes(initialDateTime, 2).toISOString()],
      },
    );
    expect(eventAddedResponse, "added event").toBeTruthy();
  }

  const newDeviceName = getDeviceTestName("moved-device");
  const project2 = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser2 = project2.api();
  const movedResponse = (await TestApiImpl.Devices.withAuth(
    deviceHandle.testId,
  ).reRegisterDeviceWithoutAuthorization(
    project2.projectHandle.id,
    newDeviceName,
    "password",
    addMinutes(initialDateTime, 5),
  )) as {
    result: LoggedInDeviceCredentials;
    success: boolean;
  };
  expect(movedResponse.success, "moved device").toBe(true);
  TestApiImpl.registerCredentials(newDeviceName, movedResponse.result);
  const deviceId = movedResponse.result.id;
  const movedDeviceHandle = {
    id: deviceId,
    testId: newDeviceName,
    type: "device",
  };

  const device = (await AdminUser.Devices.getDeviceById(deviceHandle.id)) as ApiDeviceResponse;
  expect(device.active, "moved device is inactive").toBe(false);

  const movedDevice = (await TestApiImpl.Devices.withAuth(
    project2.getAdminUser().testId,
  ).getDeviceById(movedDeviceHandle.id)) as ApiDeviceResponse;
  expect(movedDevice.active, "re-registered device is active").toBe(true);

  {
    // Use the endpoint containing the moved device id to submit on behalf of moved device by admin user from
    // project where the device was re-registered
    const eventAddedResponse = await AdminUser2.Devices.submitEventsOnBehalfOfDevice(
      deviceHandle.id,
      {
        description: {
          type: "foo",
          details: { bar: true },
        },
        dateTimes: [addMinutes(initialDateTime, 4).toISOString()],
      },
    );
    expect(eventAddedResponse, "added event").toBeTruthy();
  }
});
