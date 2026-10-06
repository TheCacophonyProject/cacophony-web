import { expect, test } from "@/helpers/upload-tests";
import {
  addDeviceToProject,
  createProjectWithUserAndDevice,
  createUser,
} from "@/helpers/create-test-entities";
import {
  ApiDeviceAction,
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
    const devicesWithTraps = await AdminUser.Projects.getDevicesWithActiveTrapsForProject(
      project.projectHandle.id,
    );
    expect(devicesWithTraps.success, "got devices with traps").toBe(true);
    const devices = (devicesWithTraps.result as { devices: ApiDeviceResponse[] }).devices;
    expect(devices.length, "got 1 device").toEqual(1);
    expect(devices[0].id, "got correct device").toEqual(deviceHandle.id);
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
      )) as ApiDeviceAction[];
      expect(pendingActions, "got pending actions").toBeTruthy();
      expect(pendingActions.length, "there is one pending action").toEqual(1);
      const action = pendingActions[0];
      expect(action.history[0].availableActions, "user is presented with correct actions").toEqual(
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

  await test.step("The user can't complete the same action twice", async () => {
    now = addMinutes(now, 1);
    const response = await AdminUser.Devices.confirmDeviceActionRequest(
      deviceHandle.id,
      eventUUID,
      availableUserActions[1], // User decides to release from the trap
      now,
    );
    expect(response.success, "setting completed again fails").toBe(false);
  });
});

test("Ensure getPendingDeviceActionRequests API only returns the latest action for each device", async () => {
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const deviceAHandle = project.getDevice();
  const deviceBHandle = await addDeviceToProject("second", project.projectHandle, initialDateTime);
  const deviceA = new DeviceSim(deviceAHandle);
  const deviceB = new DeviceSim(deviceBHandle);
  const availableUserActions: DeviceActionDecision[] = ["dispatch", "release"];

  // Device A gets two actions over time - only the later one should still be
  // considered current, even though the older one is never resolved.
  const deviceAFirstActionUUID = crypto.randomUUID();
  await deviceA.trapActivation(
    deviceAFirstActionUUID,
    "possum",
    availableUserActions,
    addMinutes(initialDateTime, 5),
  );
  const deviceALatestActionUUID = crypto.randomUUID();
  await deviceA.trapActivation(
    deviceALatestActionUUID,
    "possum",
    availableUserActions,
    addMinutes(initialDateTime, 10),
  );

  // Device B only ever gets a single action.
  const deviceBActionUUID = crypto.randomUUID();
  await deviceB.trapActivation(
    deviceBActionUUID,
    "cat",
    availableUserActions,
    addMinutes(initialDateTime, 6),
  );

  const pendingActions = (await AdminUser.Projects.getPendingDeviceActionRequests(
    project.projectHandle.id,
  )) as ApiDeviceAction[];
  expect(pendingActions, "got pending actions").toBeTruthy();
  expect(pendingActions.length, "exactly one action is returned per device").toEqual(2);

  const deviceAAction = pendingActions.find((a) => a.deviceId === deviceAHandle.id);
  expect(deviceAAction, "got an action for device A").toBeTruthy();
  expect(
    deviceAAction!.uuid,
    "only the most recently created action for device A is returned",
  ).toEqual(deviceALatestActionUUID);

  const deviceBAction = pendingActions.find((a) => a.deviceId === deviceBHandle.id);
  expect(deviceBAction, "got an action for device B").toBeTruthy();
  expect(deviceBAction!.uuid, "device B's only action is returned").toEqual(deviceBActionUUID);
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
      `You've been invited to join a project on Cacophony Monitoring`,
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
          `You've been invited to join a project on Cacophony Monitoring`,
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
