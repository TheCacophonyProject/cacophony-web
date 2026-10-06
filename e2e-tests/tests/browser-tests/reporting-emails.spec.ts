import { expect, test } from "@/helpers/upload-tests";
import {
  addUserToProject,
  createProjectWithUserAndDevice,
  createUser,
} from "@/helpers/create-test-entities";
import { TestApiImpl } from "@shared/client";
import { TestUserHandle } from "@shared/client/types";
import {
  confirmEmailAddressViaApi,
  waitForEmail,
  waitForEmailAndRenderEmailHtml,
} from "@/helpers/email-utils";
import {
  uploadAudioRecordingsFromDeviceWithTimesAndDurations,
  uploadThermalRecordingsFromDeviceWithTimesAndDurations,
} from "@/helpers/recording-uploads";
import { addDays, addHours, addMinutes } from "@/helpers/date-helpers";
import { dockerExecNodeScript, dockerExecNodeTestScript } from "@/helpers/docker-exec";
import {
  signInExistingUser,
  urlNormaliseProjectName,
  waitToNavigateToProject,
} from "@/helpers/browse-helpers";
import { ApiGroupResponse as ApiProjectResponse } from "@shared/api/group";

test("Users can opt into fine-grained options of activity digest emails", async ({ page }) => {
  const project = await createProjectWithUserAndDevice();
  const adminUser = project.getAdminUser();
  const AdminUser = project.api();
  await confirmEmailAddressViaApi(adminUser);
  await signInExistingUser(page, adminUser.testId);
  await waitToNavigateToProject(page, project.projectHandle.testId);
  await page.goto(`/${urlNormaliseProjectName(project.projectHandle.testId)}/my-settings`);
  await expect(page.getByTestId("activity digest preferences")).toBeVisible();

  const savedPreferences = async () => {
    const savedProject = await AdminUser.Projects.getProjectById(project.projectHandle.id);
    return (savedProject as ApiProjectResponse)?.userSettings?.notificationPreferences;
  };

  for (const interval of ["daily", "weekly"] as const) {
    const digestKey = `${interval}Digest`;
    const section = page.getByTestId(`${interval} digest options`);
    await test.step(`Sub-options for the ${interval} digest are only shown once opted in`, async () => {
      await expect(section).toBeHidden();
      await page.getByTestId(`${interval} digest toggle`).check();
      await expect(section).toBeVisible();
      for (const report of ["visits report", "audio report", "battery report"]) {
        await expect(section.getByTestId(report)).toBeChecked();
      }
    });

    await test.step(`Opting in saves all sections of the ${interval} digest`, async () => {
      await expect
        .poll(async () => (await savedPreferences())?.[digestKey])
        .toEqual({ visitsReport: true, audioReport: true, batteryReport: true });
    });

    await test.step(`Deselecting a section is saved for the ${interval} digest`, async () => {
      await section.getByTestId("audio report").uncheck();
      await expect
        .poll(async () => (await savedPreferences())?.[digestKey])
        .toEqual({ visitsReport: true, audioReport: false, batteryReport: true });
    });
  }

  await test.step("Options for each digest are independent of each other", async () => {
    await expect
      .poll(async () => (await savedPreferences())?.weeklyDigest)
      .toEqual({ visitsReport: true, audioReport: false, batteryReport: true });
    await page.getByTestId("weekly digest options").getByTestId("visits report").uncheck();
    await expect
      .poll(async () => (await savedPreferences())?.weeklyDigest)
      .toEqual({ visitsReport: false, audioReport: false, batteryReport: true });
    expect((await savedPreferences())?.dailyDigest).toEqual({
      visitsReport: true,
      audioReport: false,
      batteryReport: true,
    });
  });

  await test.step("Saved sub-options are restored when the page is reloaded", async () => {
    await page.reload();
    const weekly = page.getByTestId("weekly digest options");
    await expect(weekly.getByTestId("visits report")).not.toBeChecked();
    await expect(weekly.getByTestId("audio report")).not.toBeChecked();
    await expect(weekly.getByTestId("battery report")).toBeChecked();
  });

  await test.step("Opting out of a digest saves it as disabled", async () => {
    await page.getByTestId("daily digest toggle").uncheck();
    await expect(page.getByTestId("daily digest options")).toBeHidden();
    await expect.poll(async () => (await savedPreferences())?.dailyDigest).toEqual(false);
  });
});

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
      `--group-id=${project.projectHandle.id}`,
      `--at-time=${scriptRunTime.toISOString()}`,
    ]);

    const _email = await waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      "project daily activity digest",
      undefined,
      "Daily activity report",
    );
    // The device name text also matches ancestor <tr> layout rows, so narrow to the innermost one.
    await expect(page.locator("tr", { hasText: deviceHandle.testId }).last()).toContainText(
      `${latestBatteryLevel}%`,
    );
  }
  {
    // Weekly
    await dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      `--group-id=${project.projectHandle.id}`,
      "weekly",
      `--at-time=${scriptRunTime.toISOString()}`,
    ]);

    const _email = await waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      "project weekly activity digest",
      undefined,
      "Weekly activity report",
    );
    // The device name text also matches ancestor <tr> layout rows, so narrow to the innermost one.
    await expect(page.locator("tr", { hasText: deviceHandle.testId }).last()).toContainText(
      `${latestBatteryLevel}%`,
    );
  }
});

for (const { interval, periodDays, subject, noThermalText } of [
  {
    interval: "daily",
    periodDays: 1,
    subject: "Daily activity report",
    noThermalText: "no thermal activity during the last day",
  },
  {
    interval: "weekly",
    periodDays: 7,
    subject: "Weekly activity report",
    noThermalText: "no thermal activity during the last week",
  },
]) {
  test(`Emails for ${interval} activity digests without activity behave correctly`, async ({
    smallCptv,
    page,
  }) => {
    // When a digest period ends without activity for *all* of the digest categories the user
    // has opted in for, an email is sent saying that there is no activity,
    // and that no further emails will be sent until there is some new activity.
    const initialDateTime = new Date("2026-05-01T10:00:00Z");
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    const AdminUser = project.api();
    const adminUserHandle = project.getAdminUser();
    await confirmEmailAddressViaApi(adminUserHandle);
    const deviceHandle = project.getDevice();

    await AdminUser.Projects.saveProjectUserSettings(project.projectHandle.id, {
      notificationPreferences: {
        dailyDigest: interval === "daily",
        weeklyDigest: interval === "weekly",
      },
    });

    // The digest for the Nth period after the initial recording covers the period ending
    // at 9am, N * periodDays after the initial date.
    const runTimeForPeriod = (period: number) => {
      const runTime = addDays(initialDateTime, period * periodDays);
      runTime.setHours(9);
      return runTime;
    };
    const runDigest = (period: number) =>
      dockerExecNodeScript("project-activity-digest.js", [
        "--force",
        `--group-id=${project.projectHandle.id}`,
        ...(interval === "weekly" ? ["weekly"] : []),
        `--at-time=${runTimeForPeriod(period).toISOString()}`,
      ]);
    const waitForDigest = (timeout?: number) =>
      waitForEmail(
        adminUserHandle.testId,
        `project ${interval} activity digest`,
        timeout,
        false,
        subject,
      );
    const expectNoDigest = async (message: string) => {
      const email = await waitForDigest(500);
      expect(email.error, message).toBeDefined();
    };

    // Some activity in the first period.
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

    // Period 2 has no activity, but period 1 did, so a "no activity" email is sent.
    await runDigest(2);
    const noActivityEmail = await waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      `project ${interval} activity digest`,
      undefined,
      subject,
    );
    expect(noActivityEmail.html, "email says there was no thermal activity").toContain(
      noThermalText,
    );

    // Period 3 also has no activity, but we've already said so.
    await runDigest(3);
    await expectNoDigest("second consecutive 'no activity' email not sent");

    // Some new activity in period 4 means emails resume.
    await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
      [
        {
          tracks: ["rodent"],
          recordingDateTime: addHours(runTimeForPeriod(4), -2),
        },
      ],
      deviceHandle,
      project.locationBase,
      smallCptv,
    );
    await runDigest(4);
    const activityEmail = await waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      `project ${interval} activity digest`,
      undefined,
      subject,
    );
    expect(activityEmail.html, "email reports thermal activity").not.toContain(noThermalText);

    // And when that activity stops, we get a single "no activity" email again.
    await runDigest(5);
    const noActivityAgainEmail = await waitForDigest();
    expect(noActivityAgainEmail.error, "'no activity' email sent after activity").toBeUndefined();
    expect(noActivityAgainEmail.html).toContain(noThermalText);
    await runDigest(6);
    await expectNoDigest("'no activity' email only sent once after activity stops");
  });
}

test("Emails for activity digests without activity only consider the categories the user has opted into", async ({
  smallCptv,
  standardAudio,
  page,
}) => {
  // Only activity in categories the user is opted into counts: bird detections don't prevent a
  // "no activity" email for a user who is only opted into thermal visits, and vice versa.
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const adminUserHandle = project.getAdminUser();
  await confirmEmailAddressViaApi(adminUserHandle);
  const deviceHandle = project.getDevice();
  const subject = "Daily activity report";

  const setOptIns = async (opts: { visits: boolean; audio: boolean }) => {
    await AdminUser.Projects.saveProjectUserSettings(project.projectHandle.id, {
      notificationPreferences: {
        dailyDigest: {
          visitsReport: opts.visits,
          audioReport: opts.audio,
          batteryReport: false,
        },
      },
    });
  };
  // Digest period N covers the 24 hours up to 9am, N days after the initial date.
  const runTimeForPeriod = (period: number) => {
    const runTime = addDays(initialDateTime, period);
    runTime.setHours(9);
    return runTime;
  };
  const withinPeriod = (period: number) => addHours(runTimeForPeriod(period), -2);
  const uploadThermalActivity = (period: number) =>
    uploadThermalRecordingsFromDeviceWithTimesAndDurations(
      [{ tracks: ["rodent"], recordingDateTime: withinPeriod(period) }],
      deviceHandle,
      project.locationBase,
      smallCptv,
    );
  const uploadBirdActivity = (period: number) =>
    uploadAudioRecordingsFromDeviceWithTimesAndDurations(
      [
        {
          tracks: ["kea"],
          durationSeconds: 40,
          recordingDateTime: withinPeriod(period),
        },
      ],
      deviceHandle,
      project.locationBase,
      standardAudio,
    );
  const runDigest = (period: number) =>
    dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      `--group-id=${project.projectHandle.id}`,
      `--at-time=${runTimeForPeriod(period).toISOString()}`,
    ]);
  const expectNoDigest = async (message: string) => {
    const email = await waitForEmail(
      adminUserHandle.testId,
      "project daily activity digest",
      500,
      false,
      subject,
    );
    expect(email.error, message).toBeDefined();
  };
  const renderDigest = () =>
    waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      "project daily activity digest",
      undefined,
      subject,
    );

  // Opted into thermal visits only.
  await setOptIns({ visits: true, audio: false });

  // Period 1: thermal activity, so a normal digest.
  await uploadThermalActivity(1);
  await runDigest(1);
  const activityEmail = await renderDigest();
  expect(activityEmail.html, "digest reports thermal activity").not.toContain(
    "no thermal activity",
  );

  // Period 2: bird activity only, which the user isn't opted into, so it's "no activity".
  await uploadBirdActivity(2);
  // Battery events don't count either, as the user isn't opted into those.
  await AdminUser.Devices.submitEventsOnBehalfOfDevice(deviceHandle.id, {
    description: {
      type: "rpiBattery",
      details: { battery: 80, voltage: 3.9 },
    },
    dateTimes: [withinPeriod(2).toISOString()],
  });
  await runDigest(2);
  const noActivityEmail = await renderDigest();
  expect(noActivityEmail.html, "digest says no thermal activity").toContain(
    "no thermal activity during the last day",
  );
  expect(noActivityEmail.html, "digest doesn't mention bird detections").not.toContain(
    "bird detections",
  );

  // Period 3: still only bird activity, we've already sent the "no activity" email.
  await uploadBirdActivity(3);
  await runDigest(3);
  await expectNoDigest("no repeated 'no activity' email while only opted-out activity occurs");

  // Switch to bird detections only.  The bird activity in period 3 now counts as activity
  // in the previous period, but there's only thermal activity in period 4, which the user
  // is no longer opted into, so we get a "no activity" email.
  await setOptIns({ visits: false, audio: true });
  await uploadThermalActivity(4);
  await runDigest(4);
  const noBirdActivityEmail = await renderDigest();
  expect(noBirdActivityEmail.html, "digest says no bird detections").toContain(
    "no bird detections in the last day",
  );
  expect(noBirdActivityEmail.html, "digest doesn't mention thermal activity").not.toContain(
    "thermal activity",
  );

  // Period 5: bird activity, which the user is opted into, so the digest resumes.
  await uploadBirdActivity(5);
  await runDigest(5);
  const resumedEmail = await renderDigest();
  expect(resumedEmail.html, "digest reports bird detections").not.toContain("no bird detections");
});

test("No activity digest email is sent if the user has opted out of all digest categories", async ({
  smallCptv,
  standardAudio,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const adminUserHandle = project.getAdminUser();
  await confirmEmailAddressViaApi(adminUserHandle);
  const deviceHandle = project.getDevice();

  await AdminUser.Projects.saveProjectUserSettings(project.projectHandle.id, {
    notificationPreferences: {
      dailyDigest: {
        visitsReport: false,
        audioReport: false,
        batteryReport: false,
      },
    },
  });

  // Activity of every kind in the digest period.
  const withinPeriod = addHours(
    (() => {
      const runTime = addDays(initialDateTime, 1);
      runTime.setHours(9);
      return runTime;
    })(),
    -2,
  );
  await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
    [{ tracks: ["rodent"], recordingDateTime: withinPeriod }],
    deviceHandle,
    project.locationBase,
    smallCptv,
  );
  await uploadAudioRecordingsFromDeviceWithTimesAndDurations(
    [{ tracks: ["kea"], durationSeconds: 40, recordingDateTime: withinPeriod }],
    deviceHandle,
    project.locationBase,
    standardAudio,
  );
  await AdminUser.Devices.submitEventsOnBehalfOfDevice(deviceHandle.id, {
    description: {
      type: "rpiBattery",
      details: { battery: 80, voltage: 3.9 },
    },
    dateTimes: [withinPeriod.toISOString()],
  });

  const runTime = addDays(initialDateTime, 1);
  runTime.setHours(9);
  await dockerExecNodeScript("project-activity-digest.js", [
    "--force",
    `--group-id=${project.projectHandle.id}`,
    `--at-time=${runTime.toISOString()}`,
  ]);
  const email = await waitForEmail(
    adminUserHandle.testId,
    "project daily activity digest",
    500,
    false,
    "Daily activity report",
  );
  expect(email.error, "no digest sent when opted out of everything").toBeDefined();
});

test("Battery status digest emails are always sent when there is battery activity, for users only opted into battery status", async ({
  smallCptv,
  page,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const adminUserHandle = project.getAdminUser();
  await confirmEmailAddressViaApi(adminUserHandle);
  const deviceHandle = project.getDevice();
  const subject = "Daily activity report";

  await AdminUser.Projects.saveProjectUserSettings(project.projectHandle.id, {
    notificationPreferences: {
      dailyDigest: {
        visitsReport: false,
        audioReport: false,
        batteryReport: true,
      },
    },
  });

  const runTimeForPeriod = (period: number) => {
    const runTime = addDays(initialDateTime, period);
    runTime.setHours(9);
    return runTime;
  };
  const withinPeriod = (period: number) => addHours(runTimeForPeriod(period), -2);
  const submitBattery = (period: number, battery: number) =>
    AdminUser.Devices.submitEventsOnBehalfOfDevice(deviceHandle.id, {
      description: {
        type: "rpiBattery",
        details: { battery, voltage: 3.8 },
      },
      dateTimes: [withinPeriod(period).toISOString()],
    });
  const runDigest = (period: number) =>
    dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      `--group-id=${project.projectHandle.id}`,
      `--at-time=${runTimeForPeriod(period).toISOString()}`,
    ]);
  const renderDigest = () =>
    waitForEmailAndRenderEmailHtml(
      page,
      adminUserHandle.testId,
      "project daily activity digest",
      undefined,
      subject,
    );
  const expectNoDigest = async (message: string) => {
    const email = await waitForEmail(
      adminUserHandle.testId,
      "project daily activity digest",
      500,
      false,
      subject,
    );
    expect(email.error, message).toBeDefined();
  };

  // Periods 1 and 2 both have battery events, so we get an email for each, rather than the second
  // being suppressed.
  for (const [period, battery] of [
    [1, 61],
    [2, 42],
  ]) {
    await submitBattery(period, battery);
    await runDigest(period);
    await renderDigest();
    // The device name text also matches ancestor <tr> layout rows, so narrow to the innermost one.
    await expect(page.locator("tr", { hasText: deviceHandle.testId }).last()).toContainText(
      `${battery}%`,
    );
  }

  // Period 3: only thermal activity, which the user isn't opted into, so there's no activity
  // that they care about.  Period 2 had some, so we get a single "no activity" email.
  await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
    [{ tracks: ["rodent"], recordingDateTime: withinPeriod(3) }],
    deviceHandle,
    project.locationBase,
    smallCptv,
  );
  await runDigest(3);
  const noActivityEmail = await renderDigest();
  expect(
    noActivityEmail.html,
    "no battery readings listed in the 'no activity' email",
  ).not.toContain(deviceHandle.testId);

  // Period 4: still nothing, and we've already said so.
  await runDigest(4);
  await expectNoDigest("no repeated 'no activity' email");

  // Period 5: battery activity again, so emails resume.
  await submitBattery(5, 30);
  await runDigest(5);
  await renderDigest();
  await expect(page.locator("tr", { hasText: deviceHandle.testId }).last()).toContainText("30%");
});

test("No activity is worked out per recipient, based on the categories each of them has opted into", async ({
  smallCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  // User A is opted into thermal visits only, user B into battery status only.
  const userA = project.getAdminUser();
  const userB = await createUser("Test");
  await addUserToProject(project, userB);
  await confirmEmailAddressViaApi(userA);
  await confirmEmailAddressViaApi(userB);
  for (const [user, visitsReport, batteryReport] of [
    [userA, true, false],
    [userB, false, true],
  ] as const) {
    await TestApiImpl.Projects.withAuth(user.testId).saveProjectUserSettings(
      project.projectHandle.id,
      {
        notificationPreferences: {
          dailyDigest: { visitsReport, audioReport: false, batteryReport },
        },
      },
    );
  }

  const runTimeForPeriod = (period: number) => {
    const runTime = addDays(initialDateTime, period);
    runTime.setHours(9);
    return runTime;
  };
  const withinPeriod = (period: number) => addHours(runTimeForPeriod(period), -2);
  const thermalActivity = (period: number) =>
    uploadThermalRecordingsFromDeviceWithTimesAndDurations(
      [{ tracks: ["rodent"], recordingDateTime: withinPeriod(period) }],
      deviceHandle,
      project.locationBase,
      smallCptv,
    );
  const batteryActivity = (period: number) =>
    project.api().Devices.submitEventsOnBehalfOfDevice(deviceHandle.id, {
      description: {
        type: "rpiBattery",
        details: { battery: 50, voltage: 3.8 },
      },
      dateTimes: [withinPeriod(period).toISOString()],
    });
  const runDigest = (period: number) =>
    dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      `--group-id=${project.projectHandle.id}`,
      `--at-time=${runTimeForPeriod(period).toISOString()}`,
    ]);
  const digestFor = async (user: TestUserHandle) => {
    const email = await waitForEmail(
      user.testId,
      "project daily activity digest",
      undefined,
      false,
      "Daily activity report",
    );
    expect(email.error, "digest sent").toBeUndefined();
    return email.html;
  };
  const noDigestFor = async (user: TestUserHandle, message: string) => {
    const email = await waitForEmail(
      user.testId,
      "project daily activity digest",
      500,
      false,
      "Daily activity report",
    );
    expect(email.error, message).toBeDefined();
  };
  const noThermalText = "no thermal activity during the last day";

  // Period 1: activity in both categories, so both users get a normal digest, each showing only
  // their own category.
  await thermalActivity(1);
  await batteryActivity(1);
  await runDigest(1);
  const aPeriod1 = await digestFor(userA);
  expect(aPeriod1).not.toContain(noThermalText);
  expect(aPeriod1).not.toContain("Devices Status");
  const bPeriod1 = await digestFor(userB);
  expect(bPeriod1).toContain(deviceHandle.testId);
  expect(bPeriod1).not.toContain("Thermal Visits");

  // Period 2: only battery activity.  B gets a digest.  A has no activity, but had some in
  // period 1, so gets a single "no activity" email.
  await batteryActivity(2);
  await runDigest(2);
  expect(await digestFor(userA)).toContain(noThermalText);
  expect(await digestFor(userB)).toContain(deviceHandle.testId);

  // Period 3: only thermal activity.  A gets a digest.  B has no activity, but had some in
  // period 2, so gets a single "no activity" email, without any battery readings.
  await thermalActivity(3);
  await runDigest(3);
  expect(await digestFor(userA)).not.toContain(noThermalText);
  expect(await digestFor(userB)).not.toContain(deviceHandle.testId);

  // Period 4: no activity at all.  A had some in period 3, so gets a "no activity" email, but
  // B has already been told.
  await runDigest(4);
  expect(await digestFor(userA)).toContain(noThermalText);
  await noDigestFor(userB, "B isn't sent a second 'no activity' email");

  // Period 5: still nothing, so no emails for anyone.
  await runDigest(5);
  await noDigestFor(userA, "A isn't sent a second 'no activity' email");
  await noDigestFor(userB, "B still isn't sent a 'no activity' email");
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
    undefined,
    "stopped or offline device",
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
