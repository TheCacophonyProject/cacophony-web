import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { confirmEmailAddressViaApi, waitForEmailAndRenderEmailHtml } from "@/helpers/email-utils";
import {
  uploadAudioRecordingsFromDeviceWithTimesAndDurations,
  uploadThermalRecordingsFromDeviceWithTimesAndDurations,
} from "@/helpers/recording-uploads";
import { addDays, addHours, addMinutes } from "@/helpers/date-helpers";
import { dockerExecNodeScript, dockerExecNodeTestScript } from "@/helpers/docker-exec";
import { signInExistingUser } from "@/helpers/browse-helpers";

test("Project activity digest email sent successfully for weekly and daily digests", async ({
  smallCptv,
  standardAudio,
  page,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z"); // What day of the week is this?
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const adminUserHandle = project.getAdminUser();
  await confirmEmailAddressViaApi(adminUserHandle);
  const deviceHandle = project.getDevice();

  // Opt into emails
  await AdminUser.Projects.saveProjectUserSettings(project.projectHandle.id, {
    notificationPreferences: {
      dailyDigest: true,
      weeklyDigest: true,
    },
  });
  await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        tracks: ["rodent"],
        recordingDateTime: addMinutes(initialDateTime, 3),
      },
    ],
    deviceHandle,
    project.locationBase,
    smallCptv,
  );

  const birdTags = ["kea", "grey warbler", "bellbird", "fantail", "bird"];
  await uploadAudioRecordingsFromDeviceWithTimesAndDurations(
    birdTags.map((tag, index) => ({
      tracks: [tag],
      durationSeconds: 40,
      recordingDateTime: addMinutes(initialDateTime, 4 + index),
    })),
    deviceHandle,
    project.locationBase,
    standardAudio,
  );

  const scriptRunTime = addDays(initialDateTime, 2);
  scriptRunTime.setHours(9);

  // Anchored to scriptRunTime (rather than initialDateTime) so that "latest" is unambiguous
  // regardless of the digest's "from"/"until" window length (daily vs weekly) and immune to
  // local-timezone shifts introduced by scriptRunTime.setHours(9) above.
  const latestBatteryLevel = 23;
  for (const { hoursBeforeScriptRun, battery, voltage } of [
    { hoursBeforeScriptRun: 50, battery: 95, voltage: 4.1 }, // outside the daily window, inside the weekly one
    { hoursBeforeScriptRun: 20, battery: 60, voltage: 3.9 }, // inside the daily window, but not the latest
    { hoursBeforeScriptRun: 2, battery: latestBatteryLevel, voltage: 3.6 }, // the latest reading in both windows
  ]) {
    await AdminUser.Devices.submitEventsOnBehalfOfDevice(deviceHandle.id, {
      description: {
        type: "rpiBattery",
        details: { battery, voltage },
      },
      dateTimes: [addHours(scriptRunTime, -hoursBeforeScriptRun).toISOString()],
    });
  }
  {
    // Daily
    await dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      `--at-time=${scriptRunTime.toISOString()}`,
    ]);

    const _email = await waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      "project daily activity digest",
    );
    // The device name text also matches ancestor <tr> layout rows, so narrow to the innermost one.
    await expect(page.locator("tr", { hasText: deviceHandle.testId }).last()).toContainText(
      `${latestBatteryLevel}%`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  {
    // Weekly
    await dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      "weekly",
      `--at-time=${scriptRunTime.toISOString()}`,
    ]);

    const _email = await waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      "project weekly activity digest",
    );
    // The device name text also matches ancestor <tr> layout rows, so narrow to the innermost one.
    await expect(page.locator("tr", { hasText: deviceHandle.testId }).last()).toContainText(
      `${latestBatteryLevel}%`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

test("Stopped devices emails are sent and render correctly", async ({ page }) => {
  const project = await createProjectWithUserAndDevice();
  const device = project.getDevice();
  await confirmEmailAddressViaApi(project.getAdminUser());

  await dockerExecNodeTestScript("test-stopped-devices.js", ["--deviceId", device.id.toString()]);
  await dockerExecNodeScript("report-stopped-devices.js", ["--force"]);

  const _email = await waitForEmailAndRenderEmailHtml(
    page,
    project.getAdminUser().testId,
    "stopped devices report",
  );
});

test("Animal alert emails are sent and render correctly", async ({ page, smallCptv }) => {
  // Alerts are only sent for recordings less than 24 hours old, but recordings also need to be older than now
  const initialDateTime = addHours(addDays(new Date(), -1), 5);
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const adminUserHandle = project.getAdminUser();
  await confirmEmailAddressViaApi(adminUserHandle);
  const deviceHandle = project.getDevice();

  await AdminUser.Alerts.createAlertForScope("project", project.projectHandle.id, ["possum"], 0);

  const [{ recordingId, tracks }] = await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        tracks: ["possum"],
        recordingDateTime: addMinutes(initialDateTime, 1),
      },
    ],
    deviceHandle,
    project.locationBase,
    smallCptv,
  );
  const trackId = tracks[0];

  const _email = await waitForEmailAndRenderEmailHtml(page, adminUserHandle.testId, "possum alert");

  await test.step("Follow the 'View the recording' link and log in", async () => {
    await page.getByTestId("view the recording").click();
    await signInExistingUser(page, adminUserHandle.testId);
  });

  await test.step("The linked recording is shown", async () => {
    await page.waitForURL(`**/thermal/recording/${recordingId}/tracks/${trackId}`);
    await expect(page.getByTestId("recording view")).toBeVisible();
    await expect(page.getByTestId("track 0")).toContainText("possum");
  });
});
