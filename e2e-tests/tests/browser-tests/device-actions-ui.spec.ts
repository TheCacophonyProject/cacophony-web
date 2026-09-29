import { expect, test } from "@/helpers/upload-tests";
import { addDays, addHours, addSeconds } from "@/helpers/date-helpers";
import { createProjectWithUserAndDevice, ProjectBundle } from "@/helpers/create-test-entities";
import { confirmEmailAddressViaApi, waitForEmail } from "@/helpers/email-utils";
import {
  clickModalOkayButton,
  ensureMainNavIsAvailable,
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { Page } from "@playwright/test";
import { DeviceSim } from "@/helpers/device-sim";
import { DeviceActionDecision } from "@shared/api/device";

const signInNewAdminUserAndEnableATrap = async (page: Page, project: ProjectBundle) => {
  const adminUser = project.getAdminUser();
  const projectName = project.projectHandle.testId;
  const deviceHandle = project.getDevice();
  await test.step("Sign in user", async () => {
    await confirmEmailAddressViaApi(adminUser);
    // Log in user.
    await signInExistingUser(page, adminUser.testId);
    await waitToNavigateToProject(page, projectName);
    await ensureMainNavIsAvailable(page);
    // Navigate to device settings
    await page.getByTestId("manage devices").click();
    await waitToNavigateToProjectPage(page, projectName, "devices");
    // Click individual device table row
    await page
      .locator("tr")
      .filter({ has: page.getByTestId(`device ${deviceHandle.testId}`) })
      .click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/status`,
    );
    await page.getByTestId(`device configuration`).click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/configuration/*`,
    );
  });
  await test.step("Setup trap", async () => {
    await page.getByTestId("trap settings").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/configuration/trap-settings`,
    );
    await expect(page.getByTestId("trap enabled state")).toContainText("No");
    await page.getByTestId("toggle trap enabled").click();
    await expect(page.getByTestId("trap enabled state")).toContainText("Yes");

    // A newly enabled trap requires at least one target animal to be selected
    // before it will arm.
    await page.getByTestId("trap mode safe").click();
    await expect(page.getByTestId("selected capture targets")).toContainText(
      "No capture targets defined",
    );

    await page.getByTestId("manage capture targets").click();
    await page.getByTestId("capture target possum").click();
    await clickModalOkayButton(page, "capture-targets-modal");

    await expect(page.getByTestId("selected capture targets")).toContainText("possum");
  });
};

const uploadInitialRecording = async (project: ProjectBundle, atTime: Date, file: ArrayBuffer) => {
  const deviceHandle = project.getDevice();
  await test.step("Upload a test recording for device", async () => {
    const recordingId = await uploadThermalRecordingFromDevice({
      deviceHandle,
      location: { ...project.locationBase },
      file,
      recordingDateTime: atTime,
    });
    expect(recordingId, "recording succeeded").toBeDefined();
  });
};

test("A user can setup camera actions, and view pending trap actions", async ({
  page,
  smallCptv,
}) => {
  const now = new Date();
  now.setHours(11, 16, 0);
  const initialDateTime = addDays(now, -5);
  const project = await test.step("Init project, sign in user", async () => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await uploadInitialRecording(project, addDays(initialDateTime, 1), smallCptv);
    await signInNewAdminUserAndEnableATrap(page, project);
    return project;
  });
  const { device, eventUUID, captureTime } =
    await test.step("Simulate trap triggering", async () => {
      const device = new DeviceSim(project.getDevice());
      // Pull down the trap settings that were just configured via the UI, so the
      // simulated device is in sync before it reports a trigger.
      await device.syncSettings();
      const eventUUID = crypto.randomUUID();
      const captureTime = addHours(addDays(initialDateTime, 4), 10);
      // "safe" mode with no kill mechanism configured, so "dispatch" isn't an option.
      const availableUserActions: DeviceActionDecision[] = ["release", "hold"];
      await device.trapActivation(eventUUID, "possum", availableUserActions, captureTime);
      return { device, eventUUID, captureTime, availableUserActions };
    });
  await test.step("Upload recording which would trigger the trap", async () => {
    await uploadThermalRecordingFromDevice({
      deviceHandle: project.getDevice(),
      location: { ...project.locationBase },
      file: smallCptv,
      recordingDateTime: addSeconds(captureTime, -10),
      duration: 120,
      uploadTime: addSeconds(captureTime, 150), // Recording is uploaded 2.5mins after capture
    });
    const email = await waitForEmail(project.getAdminUser().testId, "device action request");
    expect(email.error, "user was notified successfully").toBeUndefined();
    expect(email.headers.subject).toContain(`Trap activated for Possum`);
  });
  await test.step("A user can see pending trap actions for a project with a device setup with a trap", async () => {
    // Refresh page to make sure the trap icon shows on the main app navigation.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.reload();
    await ensureMainNavIsAvailable(page);
    await expect(page.getByTestId("view traps")).toBeVisible();
    await expect(page.getByTestId("trap action pending indicator")).toBeAttached();

    // Navigate to the trap actions page from the main navigation.
    await page.getByTestId("view traps").click();
    await waitToNavigateToProjectPage(page, project.projectHandle.testId, "traps");

    // The user should see all trap actions for the current project listed on this page
    const deviceHandle = project.getDevice();
    const trapCard = page.getByTestId(`trap ${deviceHandle.testId}`);
    await expect(trapCard).toBeVisible();
    await expect(trapCard).toContainText(deviceHandle.testId);
    await expect(trapCard.getByTestId("trap action pending")).toBeVisible();
    await expect(trapCard).toContainText("Captured");
    await expect(trapCard.getByTestId("take action")).toBeEnabled();

    // The user can take action by clicking the `Take action` button, and selecting `release` from the available actions.
    await trapCard.getByTestId("take action").click();

    // The associated recording should be visible in the CPTV player component,
    // and should actually finish loading (not get stuck buffering) - the
    // player emits "ready-to-play" once it has, which we surface into the DOM.
    const player = page.getByTestId("trap action recording");
    await expect(player).toBeVisible();
    await expect(player.locator("canvas").first()).toBeVisible();
    await expect(page.getByTestId("trap action recording ready")).toBeAttached();

    // Only the actions the device said were available ("release" and "hold") should be offered.
    await expect(page.getByTestId("trap action release")).toBeVisible();
    await expect(page.getByTestId("trap action hold")).toBeVisible();

    await page.getByTestId("trap action release").click();

    // Taking action resolves the pending state for this trap.
    await expect(trapCard.getByTestId("trap action pending")).not.toBeVisible();
    await expect(trapCard.getByTestId("take action")).toBeDisabled();

    // This was the only pending trap action in the project, so the "pending"
    // throbber on the main nav's trap icon should disappear immediately too -
    // no page reload should be needed to notice it's resolved.
    await expect(page.getByTestId("trap action pending indicator")).not.toBeAttached();
  });
  await test.step("Device acknowledges response, and UI is updated", async () => {
    const deviceHandle = project.getDevice();
    const trapCard = page.getByTestId(`trap ${deviceHandle.testId}`);

    // Simulate the device polling the API, noticing the user's response, and
    // acknowledging it. The traps page is still open and polls in the
    // background (at a much shorter interval in this e2e build - based on
    // whether VITE_ENVIRONMENT is E2E, so the UI
    // should pick this up without a manual page reload.
    const acknowledged = await device.pollAndAcknowledgeAction(eventUUID);
    expect(acknowledged, "device acknowledged the action").toBe(true);
    await expect(trapCard.getByTestId("trap action acknowledged")).toBeVisible();
    await expect(trapCard.getByTestId("trap action responded")).not.toBeVisible();

    // Simulate the device completing the action. A completed action is no
    // longer "active", so the trap card should return to its steady state.
    const completed = await device.pollAndCompleteAction(eventUUID);
    expect(completed, "device completed the action").toBe(true);
    await expect(trapCard.getByTestId("trap action acknowledged")).not.toBeVisible();
    await expect(trapCard).not.toContainText("Captured");
  });
});

test("A trap action failure persists until the trap is serviced and triggers again", async ({
  page,
  smallCptv,
}) => {
  const now = new Date();
  now.setHours(11, 16, 0);
  const initialDateTime = addDays(now, -5);
  const project = await test.step("Init project, sign in user", async () => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await uploadInitialRecording(project, addDays(initialDateTime, 1), smallCptv);
    await signInNewAdminUserAndEnableATrap(page, project);
    return project;
  });

  // Triggers the trap, uploads the recording that correlates with the
  // trigger, and waits for the resulting notification - the same sequence
  // used for the initial trigger can be reused to simulate the trap being
  // serviced and triggering again later.
  const triggerTrapAndUploadRecording = async (
    device: DeviceSim,
    eventUUID: string,
    captureTime: Date,
  ) => {
    const availableUserActions: DeviceActionDecision[] = ["release", "hold"];
    await device.trapActivation(eventUUID, "possum", availableUserActions, captureTime);
    await uploadThermalRecordingFromDevice({
      deviceHandle: project.getDevice(),
      location: { ...project.locationBase },
      file: smallCptv,
      recordingDateTime: addSeconds(captureTime, -10),
      duration: 120,
      uploadTime: addSeconds(captureTime, 150), // Recording is uploaded 2.5mins after capture
    });
    const email = await waitForEmail(project.getAdminUser().testId, "device action request");
    expect(email.error, "user was notified successfully").toBeUndefined();
  };

  const reloadOnTrapsPage = async () => {
    await page.reload();
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("view traps").click();
    await waitToNavigateToProjectPage(page, project.projectHandle.testId, "traps");
  };

  const device = new DeviceSim(project.getDevice());
  const deviceHandle = project.getDevice();
  const trapCard = page.getByTestId(`trap ${deviceHandle.testId}`);

  const eventUUID =
    await test.step("Trigger the trap, and have the user respond to it", async () => {
      await device.syncSettings();
      const eventUUID = crypto.randomUUID();
      const captureTime = addHours(addDays(initialDateTime, 4), 10);
      await triggerTrapAndUploadRecording(device, eventUUID, captureTime);

      await reloadOnTrapsPage();
      await trapCard.getByTestId("take action").click();
      await expect(page.getByTestId("trap action recording ready")).toBeAttached();
      await page.getByTestId("trap action release").click();
      await expect(trapCard.getByTestId("trap action pending")).not.toBeVisible();

      return eventUUID;
    });

  await test.step("The device acknowledges the action, then fails to actually carry it out - e.g. the trap door motor jams, a piece of physical hardware that can malfunction", async () => {
    const acknowledged = await device.pollAndAcknowledgeAction(eventUUID);
    expect(acknowledged, "device acknowledged the action").toBe(true);
    await expect(trapCard.getByTestId("trap action acknowledged")).toBeVisible();

    const failed = await device.pollAndFailAction(eventUUID);
    expect(failed, "device reported failure").toBe(true);
    await expect(trapCard.getByTestId("trap action failed")).toBeVisible();
    await expect(trapCard.getByTestId("trap action acknowledged")).not.toBeVisible();
    await expect(trapCard.getByTestId("take action")).toBeDisabled();
  });

  await test.step("The failure keeps showing - it's a terminal state, so it isn't cleared by further background polling or a page reload", async () => {
    // Give the background poll several more chances to (incorrectly) change
    // or clear the failure indicator, before checking it's still there.
    await page.waitForTimeout(4000);
    await expect(trapCard.getByTestId("trap action failed")).toBeVisible();

    await reloadOnTrapsPage();
    await expect(trapCard.getByTestId("trap action failed")).toBeVisible();
  });

  await test.step("Once someone services the trap and it triggers again, the new action replaces the failure indicator", async () => {
    const newEventUUID = crypto.randomUUID();
    const newCaptureTime = addHours(addDays(initialDateTime, 4), 12);
    await triggerTrapAndUploadRecording(device, newEventUUID, newCaptureTime);

    await reloadOnTrapsPage();
    await expect(trapCard.getByTestId("trap action failed")).not.toBeVisible();
    await expect(trapCard.getByTestId("trap action pending")).toBeVisible();
    await expect(trapCard.getByTestId("take action")).toBeEnabled();
  });

  await test.step("Make sure it's possible to follow the Trap settings link to the correct location", async () => {
    await trapCard.getByTestId("trap settings link").click();
    await waitToNavigateToProjectPage(
      page,
      project.projectHandle.testId,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/configuration/trap-settings`,
    );
    // Make sure we've landed on this device's own trap settings, reflecting
    // the trap that was enabled for it earlier in the test.
    await expect(page.getByTestId("trap enabled state")).toContainText("Yes");
  });
});

test("A device can have a trap enabled, but later be moved into low power mode.  The trap should be displayed as 'misconfigured' in the traps list", async ({
  page,
  smallCptv,
}) => {
  const now = new Date();
  now.setHours(11, 16, 0);
  const initialDateTime = addDays(now, -5);
  const project = await test.step("Init project, sign in user, enable trap", async () => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await uploadInitialRecording(project, addDays(initialDateTime, 1), smallCptv);
    await signInNewAdminUserAndEnableATrap(page, project);
    return project;
  });
  const projectName = project.projectHandle.testId;
  const deviceHandle = project.getDevice();
  const trapCard = page.getByTestId(`trap ${deviceHandle.testId}`);

  await test.step("The trap isn't misconfigured to begin with", async () => {
    // No page reload here - enabling a trap should update the main nav's
    // "view traps" link visibility immediately.
    await page.getByTestId("view traps").click();
    await waitToNavigateToProjectPage(page, projectName, "traps");
    await expect(trapCard).toBeVisible();
    await expect(trapCard.getByTestId("trap misconfigured")).not.toBeVisible();
  });

  await test.step("Move the device into low power mode", async () => {
    await page.getByTestId("manage devices").click();
    await waitToNavigateToProjectPage(page, projectName, "devices");
    await page
      .locator("tr")
      .filter({ has: page.getByTestId(`device ${deviceHandle.testId}`) })
      .click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/status`,
    );
    await page.getByTestId(`device configuration`).click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/configuration/*`,
    );
    await page.getByTestId("recording settings").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/configuration/recording-options`,
    );
    await page.getByTestId("use low power mode").click();
    // Wait for the setting change to actually be persisted before moving on.
    await expect(page.getByTestId("saving power mode settings")).not.toBeVisible();
  });

  await test.step("The trap now shows as misconfigured in the traps list", async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("view traps").click();
    await waitToNavigateToProjectPage(page, projectName, "traps");
    await expect(trapCard.getByTestId("trap misconfigured")).toBeVisible();
  });
});
