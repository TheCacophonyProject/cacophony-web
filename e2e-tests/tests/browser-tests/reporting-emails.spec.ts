import { test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { confirmEmailAddressViaApi, waitForEmailAndRenderEmailHtml } from "@/helpers/email-utils";
import { uploadThermalRecordingsFromDeviceWithTimesAndDurations } from "@/helpers/recording-uploads";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { dockerExecNodeScript } from "@/helpers/docker-exec";

test("Project activity digest email sent successfully for weekly and daily digests", async ({
  smallCptv,
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

  const scriptRunTime = addDays(initialDateTime, 2);
  scriptRunTime.setHours(9);
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
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
});
