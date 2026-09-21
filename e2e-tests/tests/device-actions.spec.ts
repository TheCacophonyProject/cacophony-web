import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice, createUser } from "@/helpers/create-test-entities";
import {
  ApiDeviceActionResponse,
  ApiDeviceResponse,
  DeviceActionDecision,
  TrapSettings,
} from "@shared/api/device";
import { DeviceSim } from "@/helpers/device-sim";
import { addHours, addMinutes, addSeconds } from "@/helpers/date-helpers";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { confirmEmailAddressViaApi, waitForEmail } from "@/helpers/email-utils";
import { DeviceActionStatus } from "@shared/api/consts";
import { getEmail } from "@/helpers/browse-helpers";
import { ApiGroupResponse } from "@shared/api/group";

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
  });

  {
    const response = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
    if (response.success) {
      expect(response.result.settings, "settings were applied correctly").toMatchObject({
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
    const devicesWithTraps = (await AdminUser.Projects.getDevicesWithActiveTrapsForProject(
      project.projectHandle.id,
    )) as ApiDeviceResponse[];
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
    const devicesWithTraps = (await AdminUser.Projects.getDevicesWithActiveTrapsForProject(
      project.projectHandle.id,
    )) as ApiDeviceResponse[];
    expect(devicesWithTraps, "got devices with traps").toBeTruthy();
    expect(devicesWithTraps.length, "got 1 device").toEqual(1);
    expect(devicesWithTraps[0].id, "got correct device").toEqual(deviceHandle.id);
  }
});

test("A device polls for actions", async ({ smallCptv }) => {
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const userHandle = project.getAdminUser();
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const Camera = project.api(deviceHandle);
  const device = new DeviceSim(deviceHandle);
  await confirmEmailAddressViaApi(userHandle);
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

  const captureTime = addMinutes(initialDateTime, 5);
  const eventUUID = crypto.randomUUID();
  const availableUserActions = ["dispatch", "release"] as DeviceActionDecision[];
  await test.step("The trap triggers on a possum classification", async () => {
    await device.trapActivation(eventUUID, "possum", availableUserActions, captureTime);
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
    const email = await waitForEmail(userHandle.testId, "device action request");
    expect(email.headers.subject).toContain(`Trap activated for Possum`);
    expect(email.error, "user was notified successfully").toBeUndefined();
  });
  let now = new Date(captureTime);
  const releaseTime = addHours(now, 24);
  const userActionTime = addHours(now, 2);
  let userRespondedToActionRequest = false;
  while (now < releaseTime) {
    // Camera/Trap polls every 5 minutes to see if there's a user action
    const deviceActionResponse = (await Camera.Devices.getDeviceActionRequest(
      deviceHandle.id,
      eventUUID,
    )) as ApiDeviceActionResponse;
    expect(deviceActionResponse, "got device action").toBeTruthy();
    if (deviceActionResponse) {
      // Check for a user response, and acknowledge it.
      if (deviceActionResponse.status === "responded") {
        await Camera.Devices.updateDeviceActionRequest(
          deviceHandle.id,
          eventUUID,
          DeviceActionStatus.acknowledged,
          now,
        );
      }
      // Then complete the actual action, and update again.
      if (deviceActionResponse.status === "acknowledged") {
        await Camera.Devices.updateDeviceActionRequest(
          deviceHandle.id,
          eventUUID,
          DeviceActionStatus.completed,
          now,
        );
        // The device is finished, so we're done polling for responses now.
        //  (Technically, this would happen after the 'acknowledged' step)
        break;
      }
    }

    now = addMinutes(now, 5);
    if (!userRespondedToActionRequest && now > userActionTime) {
      // We want to be able to link to the specific trap action request, so should this be on Project or Device?
      const pendingActions = (await AdminUser.Projects.getPendingDeviceActionRequests(
        project.projectHandle.id,
      )) as ApiDeviceActionResponse[];
      expect(pendingActions, "got pending actions").toBeTruthy();
      expect(pendingActions.length, "there is one pending action").toEqual(1);
      const action = pendingActions[0];
      expect(action.availableActions, "user is presented with correct actions").toEqual(
        availableUserActions,
      );
      await AdminUser.Devices.confirmDeviceActionRequest(
        deviceHandle.id,
        action.uuid,
        availableUserActions[1], // User decides to release from the trap
        now,
      );
      userRespondedToActionRequest = true;
    }
  }
  const deviceActionResponse = (await Camera.Devices.getDeviceActionRequest(
    deviceHandle.id,
    eventUUID,
  )) as ApiDeviceActionResponse;
  expect(deviceActionResponse, "got device action").toBeTruthy();
  expect(deviceActionResponse.status).toEqual("completed");
});

test("Once an action is completed, it is an error for the device to try to modify the action", async () => {
  // TODO
  // Just exercising the APIs, making sure they require statuses to be in correct order
});

test("When a camera with a trap connected goes below a certain battery threshold the trap is disabled and a user is notified", async () => {
  // TODO.  The camera really needs to be the one enforcing this behaviour, so I guess the camera itself can advance the APIs?
  //  Otherwise, the user just doesn't need to be notified, we show that it timed out in the events list
});

test("If a camera has a trap config, but no events to indicate that at trap is connected, we surface that to a user somehow", async () => {
  // TODO
  // In the traps dashboard, just query the last trap connected event for each device
});

test("A user gets a notification email if there is a trap action pending, unless they opt out (opt-out works)", async ({
  smallCptv,
}) => {
  // Test that opt-out works for trap notifications
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const userHandle = project.getAdminUser();
  const secondUser = await createUser("second");
  await confirmEmailAddressViaApi(userHandle);
  await confirmEmailAddressViaApi(secondUser);
  const NormalUser = project.api(secondUser);
  await AdminUser.Projects.inviteSomeoneToProject(
    project.projectHandle.id,
    getEmail(secondUser.testId),
  );
  {
    const email = await waitForEmail(secondUser.testId, "project invite");
    expect(email.error, "user got project invite").toBeUndefined();
    expect(email.headers.subject).toContain(
      `You've been invited to join a group on Cacophony Monitoring`,
    );
  }
  await NormalUser.Users.acceptProjectInvitation(project.projectHandle.id);
  {
    const email = await waitForEmail(secondUser.testId, "accepted to project");
    expect(email.error, "user responded to project invite").toBeUndefined();
    expect(email.headers.subject).toContain(`You've been accepted to`);
  }

  const userProjects = await NormalUser.Projects.getCurrentUserProjects();
  expect(userProjects.success).toBe(true);
  expect(
    (userProjects.result as { groups: ApiGroupResponse[] }).groups.some(
      (group) => group.id === project.projectHandle.id,
    ),
    "Second user was added to project",
  ).toBe(true);

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

  await test.step("First trap activation should notify all users", async () => {
    // Both users should receive notification email
    const captureTime = addMinutes(initialDateTime, 5);
    const eventUUID = crypto.randomUUID();
    const availableUserActions = ["dispatch", "release"] as DeviceActionDecision[];
    await test.step("The trap triggers on a possum classification", async () => {
      await device.trapActivation(eventUUID, "possum", availableUserActions, captureTime);
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
      await test.step("Admin user gets notification", async () => {
        const email = await waitForEmail(userHandle.testId, "device action request");
        expect(email.error, "user was notified successfully").toBeUndefined();
        expect(email.headers.subject).toContain(`Trap activated for Possum`);
      });
      await test.step("Second user also gets notification", async () => {
        {
          const email = await waitForEmail(secondUser.testId, "device action request");
          expect(email.error, "user was notified successfully").toBeUndefined();
          expect(email.headers.subject).toContain(`Trap activated for Possum`);
        }
      });
    });
    await test.step("Second use opts out of trap notifications", async () => {
      await NormalUser.Projects.saveProjectUserSettings(project.projectHandle.id, {
        notificationPreferences: {
          trapActions: false,
        },
      });
    });
  });

  await test.step("Second trap activation should only notify one user", async () => {
    const captureTime = addMinutes(initialDateTime, 15);
    const eventUUID = crypto.randomUUID();
    const availableUserActions = ["dispatch", "release"] as DeviceActionDecision[];
    await test.step("The trap triggers on a possum classification", async () => {
      await device.trapActivation(eventUUID, "possum", availableUserActions, captureTime);
    });
    await test.step("The camera uploads the corresponding recording, and the notification is sent to only opted-in users", async () => {
      await uploadThermalRecordingFromDevice({
        deviceHandle,
        location: project.locationBase,
        recordingDateTime: addSeconds(captureTime, -10),
        file: smallCptv,
        duration: 120,
        uploadTime: addSeconds(captureTime, 150), // Recording is uploaded 2.5mins after capture
      });
      await test.step("Admin user gets notification", async () => {
        const email = await waitForEmail(userHandle.testId, "device action request");
        expect(email.error, "user was notified successfully").toBeUndefined();
        expect(email.headers.subject).toContain(`Trap activated for Possum`);
      });
      await test.step("Second gets no notification", async () => {
        {
          const email = await waitForEmail(secondUser.testId, "device action request", 500);
          expect(email.error, "second user doesn't get notified").toBeDefined();
        }
      });
    });
  });
});

test("The last/only user in a project can't opt out from trap email notifications", async () => {
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  await confirmEmailAddressViaApi(project.getAdminUser());
  const AdminUser = project.api();
  const optedOutResponse = await AdminUser.Projects.saveProjectUserSettings(
    project.projectHandle.id,
    {
      notificationPreferences: {
        trapActions: false,
      },
    },
  );
  expect(optedOutResponse.success, "Couldn't apply settings").toBe(false);
});

test(
  "If a user leaves a project, and they were the last user with trap notifications turned on, " +
    "all remaining users have trap notifications re-enabled.",
  async () => {
    // Test that opt-out works for trap notifications
    const initialDateTime = new Date("2026-08-01T10:00:00Z");
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    const AdminUser = project.api();
    const userHandle = project.getAdminUser();

    await confirmEmailAddressViaApi(userHandle);
    const secondUser = await test.step("Invite a second user to the project", async () => {
      const secondUser = await createUser("second");
      await confirmEmailAddressViaApi(secondUser);
      const NormalUser = project.api(secondUser);
      await AdminUser.Projects.inviteSomeoneToProject(
        project.projectHandle.id,
        getEmail(secondUser.testId),
      );
      {
        const email = await waitForEmail(secondUser.testId, "project invite");
        expect(email.error, "user got project invite").toBeUndefined();
        expect(email.headers.subject).toContain(
          `You've been invited to join a group on Cacophony Monitoring`,
        );
      }
      await NormalUser.Users.acceptProjectInvitation(project.projectHandle.id);
      {
        const email = await waitForEmail(secondUser.testId, "accepted to project");
        expect(email.error, "user responded to project invite").toBeUndefined();
        expect(email.headers.subject).toContain(`You've been accepted to`);
      }
      return secondUser;
    });
    await test.step("Admin user turns off trapAction notifications", async () => {
      const optOutResponse = await AdminUser.Projects.saveProjectUserSettings(
        project.projectHandle.id,
        {
          notificationPreferences: {
            trapActions: false,
          },
        },
      );
      expect(optOutResponse.success, "Applied notification settings").toBe(true);
    });
    await test.step("Second user leaves the project", async () => {
      const removalResponse = await AdminUser.Projects.removeProjectUser(
        project.projectHandle.id,
        undefined,
        secondUser.id,
      );
      expect(removalResponse.success, "User removed from project").toBe(true);
    });
    await test.step("Admin users's notification preferences have changed", async () => {
      const adminUserSettings = await AdminUser.Projects.getCurrentUserProjects();
      const settings = (adminUserSettings.result as { groups: ApiGroupResponse[] }).groups[0]
        .userSettings;
      expect(settings, "settings have turned on trap notifications").toMatchObject({
        notificationPreferences: {
          trapActions: true,
        },
      });
    });
  },
);

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
