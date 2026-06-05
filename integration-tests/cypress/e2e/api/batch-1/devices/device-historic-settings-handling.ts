import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDeviceForProject } from "@/helpers/recording-uploads";
import { ImageMimeTypes } from "@shared/api/device";
//TODO
describe.skip("DeviceHistory settings", () => {
  it.only("DeviceHistory settings should get synced with devices", async () => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const deviceId = project.deviceHandles[0].id;
    const initialDeviceHistory =
      await AdminUser.Devices.getDeviceHistoryInTest(deviceId);
    expect(initialDeviceHistory).to.be.an("array").and.to.have.length(1);
    if (initialDeviceHistory) {
      expect(
        initialDeviceHistory[0].settings,
        "initial settings for new device are null",
      ).to.be.null;
    }
    const oneHourAgo = new Date(new Date().setHours(new Date().getHours() - 1));
    await uploadThermalRecordingFromDeviceForProject({
      project,
      recordingDateTime: oneHourAgo,
      location: {
        lat: -39.17179501,
        lng: 173.823101,
      },
    });
    const deviceSettingsAfterInitialRecording =
      await AdminUser.Devices.getDeviceHistoryInTest(deviceId);
    expect(deviceSettingsAfterInitialRecording)
      .to.be.an("array")
      .and.to.have.length(2);
    if (deviceSettingsAfterInitialRecording) {
      expect(
        deviceSettingsAfterInitialRecording[1].settings,
        "updated settings after recording upload are null",
      ).to.be.null;
    }

    const userAddedReferenceImage = {
      referenceImagePOV: "referenceImagePOV_S3Key",
      referenceImagePOVMimeType: "image/webp" as ImageMimeTypes,
      referenceImagePOVFileSize: 1234,
    };
    await AdminUser.Devices.updateDeviceSettings(
      deviceId,
      userAddedReferenceImage,
    );
    const deviceHistoryAfterUserSettings =
      await AdminUser.Devices.getDeviceHistoryInTest(deviceId);
    expect(
      deviceHistoryAfterUserSettings,
      "settings after user added reference image",
    )
      .to.be.an("array")
      .and.to.have.length(3);
    if (deviceHistoryAfterUserSettings) {
      expect(deviceHistoryAfterUserSettings[2].settings).to.deep.equal({
        ...userAddedReferenceImage,
        synced: false,
      });
    }

    // TODO: Add some settings that set some non-standard recording window and power mode
    // TODO: Device sends an initial "config" event for settings added while at the camera via sidekick.
    // TODO: Lots of settings config events happen in quick succession, as the user changes settings via sidekick or management interface
    const Device = project.api(project.deviceHandles[0]);
    // TODO: Does it matter whether the config event was sent by the device, or on behalf of the device?
    await Device.Devices.submitEventsFromDevice({
      dateTimes: [new Date().toISOString()],
      description: {
        type: "config",
        details: {
          gpio: null,
          salt: {
            updated: "2026-01-26T15:06:54+13:00",
            "auto-update": true,
          },
          comms: null,
          ports: null,
          device: {
            id: deviceId,
            name: project.deviceHandles[0].testId,
            group: project.projectHandle.testId,
            server: "https://api.cacophony.org.nz",
            updated: "2026-01-28T08:05:14+13:00",
          },
          lepton: null,
          modemd: null,
          battery: null,
          windows: {
            updated: "2026-03-12T10:48:20.801453202+13:00",
            "power-on": "-30m",
            "power-off": "+30m",
            "stop-recording": "+30m",
            "start-recording": "-30m",
          },
          location: {
            //updated: "2026-03-12T10:38:51+13:00",
            updated: new Date().toISOString(),
            // TODO: Should we even allow low accuracy locations to be set?
            accuracy: 36, // TODO: Should we save location accuracy against device and incorporate that into our fuzzy distance measurements?
            altitude: 31.745842, // TODO: We don't care about altitude, but should we?
            // Config event has *slightly* different lat/lng precision as other location sources, and we
            // need to account for that.
            latitude: -39.171795,
            longitude: 173.8231,
            timestamp: "2026-03-12T10:38:51+13:00",
          },
          "audio-bait": null,
          "test-hosts": null,
          "device-setup": null,
          "thermal-motion": null,
          "audio-recording": {
            updated: "2026-03-12T10:43:20.021024133+13:00",
            "audio-mode": "Disabled",
            "random-seed": 0,
          },
          "thermal-recorder": {
            updated: "2026-01-28T08:05:34+13:00",
            "use-low-power-mode": true,
          },
          "thermal-throttler": null,
        },
      },
    });

    // Some invariants:
    // Config event shouldn't be able to come in before the register event.
    // Config event can come in and be inserted before an "automatic" location entry, and probably we should
    // merge the settings forwards from that point to reconcile things.

    const deviceSettingsAfterConfigEvent =
      await AdminUser.Devices.getDeviceHistoryInTest(deviceId);
    expect(deviceSettingsAfterConfigEvent).to.be.an("array");
    if (deviceSettingsAfterConfigEvent) {
      console.clear();
      console.log("deviceSettings", deviceSettingsAfterConfigEvent);
      expect(
        deviceSettingsAfterConfigEvent[3].settings,
        "user settings are preserved after config event in same location",
      ).is.not.null;
    }
    return;
  });
  it("Config events should get properly merged with device history", () => {
    return;
  });
  it("Reference images and masks should be preserved until a device is moved", () => {
    // Might need to account for ignoring *very* small movement deltas
    return;
  });
  it("Older config events with old location different from current device location (set later) should not change device location", async () => {
    return;
  });

  it("Initial reference image set before location is added should be carried forward once a station is created", async () => {
    return;
  });
});
