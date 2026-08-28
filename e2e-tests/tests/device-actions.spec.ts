import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { ApiDeviceActionResponse, ApiDeviceResponse, DeviceAction, TrapSettings } from "@shared/api/device";
import { DeviceSim } from "@/helpers/device-sim";
import { addHours, addMinutes, addSeconds } from "@/helpers/date-helpers";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { waitForEmail } from "@/helpers/email-utils";
import { TestApiImpl } from "@shared/client";
import { DeviceActionStatus } from "@shared/api/consts";


test("A user sets trap configuration", async () => {
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const device = new DeviceSim(deviceHandle);

  const trapSettings: TrapSettings = {
    protect: [],
    target: [],
    defaultState: "armed",
    hasKillMechanism: true,
    updated: addMinutes(initialDateTime, 1).toISOString(),
    enabled: true,
  };

  // NOTE: When a user sets trap settings via browse, if existing trap settings
  //  are low power, we'll set them to high power and display a notification that
  //  we've done that.  If the user then sets low power mode, we'll display a notification
  //  that trap settings are disabled.
  // TODO: UI tests for these cases.
  await AdminUser.Devices.updateDeviceSettings(deviceHandle.id, {
    trap: trapSettings,
  })

  {
    const response = await AdminUser.Devices.getSettingsForDevice(
      deviceHandle.id,
    );
    if (response.success) {
      expect(
        response.result.settings,
        "settings were applied correctly",
      ).toMatchObject({
        trap: trapSettings,
      });
    }
  }

  const settings = await device.syncSettings();
  expect(settings).not.toBeNull();
  expect(settings, "after sync, settings were correct").toMatchObject({
    trap: trapSettings,
  });
  expect(settings!.synced).toBe(true);

  {
    const devicesWithTraps = await AdminUser.Projects.getDevicesWithActiveTrapsForProject(project.projectHandle.id) as ApiDeviceResponse[];
    expect(devicesWithTraps, "got devices with traps").toBeTruthy();
    expect(devicesWithTraps.length, "got 0 device").toEqual(0);
  }
  // Now update the settings to be actually active, with something in the protect list and the trap list.

  // TODO: Probably can't have target list empty and have something in protect list?
  await AdminUser.Devices.updateDeviceSettings(deviceHandle.id, {
    trap: {
      ...trapSettings,
      protect: ["bird"],
      updated: addMinutes(initialDateTime, 2).toISOString(),
    },
  });

  {
    const devicesWithTraps =
      (await AdminUser.Projects.getDevicesWithActiveTrapsForProject(
        project.projectHandle.id,
      )) as ApiDeviceResponse[];
    expect(devicesWithTraps, "got devices with traps").toBeTruthy();
    expect(devicesWithTraps.length, "got 1 device").toEqual(1);
    expect(devicesWithTraps[0].id, "got correct device").toEqual(deviceHandle.id);
  }
});


test("A device polls for actions", async ({smallCptv}) => {
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const device = new DeviceSim(deviceHandle);

  const trapSettings: TrapSettings = {
    protect: ["bird"],
    target: ["possum", "cat"],
    defaultState: "armed",
    hasKillMechanism: true,
    updated: addMinutes(initialDateTime, 1).toISOString(),
    enabled: true,
  };
  await AdminUser.Devices.updateDeviceSettings(deviceHandle.id, {
    trap: trapSettings,
  });
  await device.syncSettings();

  const thumbnail = new ArrayBuffer(4096);
  const captureTime = addMinutes(initialDateTime, 5);
  const eventUUID = "foo"; // TODO: Actual uuid v4
  await test.step("The trap triggers on a possum classification", async () => {

    await device.trapActivation(eventUUID, "possum", captureTime, thumbnail);
  });
  await test.step("The camera uploads the corresponding recording, and the notification is sent to user(s)", async () => {
    await uploadThermalRecordingFromDevice({
      deviceHandle,
      location: project.locationBase,
      recordingDateTime: addSeconds(captureTime, -10),
      file: smallCptv,
      duration: 120,
      uploadTime: addSeconds(captureTime, 150), // Recording is uploaded 2.5mins after capture
    });
    // TODO: Check that we got the email with the action request
    const email = await waitForEmail(project.getAdminUser().testId, "device action request");
    expect(email.error, "user was notified successfully").toBeUndefined();
  });
  let now = new Date(captureTime);
  const releaseTime = addHours(now, 24);
  const userActionTime = addHours(now, 2);
  while (now < releaseTime) {
    // Camera/Trap polls every 5 minutes to see if there's a user action
    const deviceActionResponse = await TestApiImpl.Devices.withAuth(project.getDevice().testId).getDeviceActionRequest(project.getDevice().id, eventUUID) as ApiDeviceActionResponse;
    expect(deviceActionResponse, "got device action").toBeTruthy();
    // TODO: Check if the deviceAction has a user response yet.
    if (deviceActionResponse) {
      if (deviceActionResponse.chosenAction) {
        // Cool, break;
        await TestApiImpl.Devices.withAuth(project.getDevice().testId).updateDeviceActionRequest(project.getDevice().id, eventUUID, DeviceActionStatus.completed);
      }
    }

    now = addMinutes(now, 5);
    if (now > userActionTime) {
      // We want to be able to link to the specific trap action request, so should this be on Project or Device?
      const pendingActions = await AdminUser.Projects.getPendingDeviceActionRequests(project.projectHandle.id) as ApiDeviceActionResponse[];
      expect(pendingActions, "got pending actions").toBeTruthy();
      const action = pendingActions[0];

      // TODO: Does this API need an `atTime` param for testing purposes?
      await AdminUser.Projects.confirmDeviceActionRequest(project.projectHandle.id, action.uuid, "release");
      break;
      // TODO: User decides to release the captured animal.
      // TODO: Maybe first the user asks for more information - gets the device to
      //  upload associated recording.  Or if the recording has already been uploaded,
      //  it needs to be associated with the action.
    }
  }


  // First the device says it's got something in a trap, and waits for user
  // feedback on what to do about it.

  // Then a user confirms the action to take on browse (or maybe via email)
  // and then the device polls, acknowledges, and then does the action,
  // adding completed or failed.

  // Do we need any audit trail about how long it took the user to respond to
  // the action?  Or for the device to get the response and action it?
});


test("When a camera with a trap connected goes below a certain battery threshold the trap is disabled and a user is notified", async () => {

});

test("If a camera has a trap config, but no events to indicate that at trap is connected, we surface that to a user somehow", async () => {

});

// Device comes online, syncs settings.
// Device is in recording/trap active window, and triggers a recording.



// The on device AI causes the trap to trigger.

// The trap sends a message saying that a target species has been caught.

// Need to make sure trap active time doesn't conflict with camera active time.

// Need to make sure camera is in high power mode if a trap is connected.

// What should happen when there is a trap config, but no trap is connected?
// Do we get notifications in that case?

// What happens if the power to the trap is low/empty?

// What happens if the camera loses power - does it "safe" the trap at a given battery level?

// We need to disallow audio recording mode if there is a trap configured.

// What if there is a trap connected, but no trap config?


// NOTE: As discussed, in the enabled by default mode, the trap triggers and then catches something,
//  and then there may be an AI classification after the fact (or not).
//  We decided that in this mode, the trap was in a "dumb" mode.
//  Any target or protect lists are ignored (in fact, we won't even allow them to be filled in the UI in this mode).
//  I briefly wondered if this is correct?
//  Should we actually still have those lists in this mode, and in the event that we get a classification that's not
//  in the target list, we'd automatically release without involving the user?
