import { test } from "@/helpers/upload-tests";
import { dockerExecNodeScript } from "@/helpers/docker-exec";
import { confirmEmailAddressViaApi, waitForEmail } from "@/helpers/email-utils";
import { expect } from "@playwright/test";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { uploadThermalRecordingsFromDeviceWithTimesAndDurations } from "@/helpers/recording-uploads";
import { AudioRecordingMode } from "@shared/api/consts";
import { ApiRecordingResponse } from "@shared/api/recording";
import { ApiDeviceHistorySettings } from "@shared/api/device";

test("Platform usage report successfully generated and sent to admins", async () => {
  // Create some activity?  Or maybe it sends even without any activity?
  await dockerExecNodeScript("platform-usage-report.js", ["--force"]);
  const email = await waitForEmail("usage@example.com", undefined, 500, true);
  expect(email.error, "email was sent").toBeUndefined();
});

test("Project activity digest email sent successfully for weekly and daily digests", async ({
  smallCptv,
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

  const scriptRunTime = addDays(initialDateTime, 2);
  scriptRunTime.setHours(9);
  {
    // Daily
    await dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      `--at-time=${scriptRunTime.toISOString()}`,
    ]);
    const email = await waitForEmail(adminUserHandle.testId);
    expect(email.error, "email was sent").toBeUndefined();
  }
  {
    // Weekly
    await dockerExecNodeScript("project-activity-digest.js", [
      "--force",
      "weekly",
      `--at-time=${scriptRunTime.toISOString()}`,
    ]);
    const email = await waitForEmail(adminUserHandle.testId);
    expect(email.error, "email was sent").toBeUndefined();
  }
});

test("'Rat threshold' script runs and doesn't disrupt device settings", async ({ smallCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const AdminUser = project.api();
  const timeA = addMinutes(initialDateTime, 1);
  await AdminUser.Devices.updateDeviceSettings(
    deviceHandle.id,
    {
      audioRecording: {
        updated: timeA.toISOString(),
        audioMode: AudioRecordingMode.AudioOrThermal,
      },
    },
    timeA,
  );
  const [{ recordingId }] = await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
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

  const recording = (await AdminUser.Recordings.getRecordingById(
    recordingId,
  )) as ApiRecordingResponse;
  expect(recording, "got recording").toBeTruthy();
  expect(recording.tracks.length, "recording has one track").toEqual(1);
  expect(recording.tracks[0].tags.length, "track has one trackTag").toEqual(1);
  expect(recording.tracks[0].tags[0].what, "tagged with rodent").toEqual("rodent");

  // Add human tag of rodent so that this can actually get picked up by the script.
  const addHumanTrackTagResponse = await AdminUser.Recordings.replaceTrackTag(
    { what: "rodent" },
    recordingId,
    recording.tracks[0].id,
  );
  expect(addHumanTrackTagResponse.success, "added trackTag").toBeTruthy();

  await dockerExecNodeScript("ratthreshold.js", ["--force"]);
  const settings = await AdminUser.Devices.getSettingsForDevice(deviceHandle.id);
  expect(settings, "got settings").toBeTruthy();
  expect(
    (settings.result as { settings: ApiDeviceHistorySettings }).settings.ratThresh,
    "has rat threshold",
  ).toBeDefined();
});

test("Make sure subsequent versions of ratThresh update the existing one in settings", async () => {
  // TODO
});
