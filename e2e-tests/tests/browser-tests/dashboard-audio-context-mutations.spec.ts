import { expect, test } from "@/helpers/upload-tests";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import {
  uploadAudioRecordingsFromDeviceWithTimesAndDurations,
  uploadThermalRecordingsFromDeviceWithTimesAndDurations,
} from "@/helpers/recording-uploads";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import {
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";

test("Can delete recordings in dashboard audio context", async ({ standardAudio, page }) => {
  const { uploads, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadAudioRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: ["chaffinch"],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 3),
            durationSeconds: 40,
            tracks: ["bellbird"],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 4),
            durationSeconds: 40,
            tracks: [],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 5),
            durationSeconds: 40,
            tracks: ["fantail"],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 6),
            durationSeconds: 40,
            tracks: ["fantail"],
          },
        ],
        project.getDevice(),
        project.locationBase,
        standardAudio,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      return { uploads, projectName };
    });
  await test.step("Go to dashboard view, audio tab", async () => {
    await page.getByTestId("audio dashboard").click();
    await waitToNavigateToProjectPage(page, projectName, "audio");
  });
  const recordingView =
    await test.step("Select middle recording, open recording modal", async () => {
      await page.getByTestId("recording 2").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/recording/${uploads[2].recordingId}/**`,
      );
      const recordingView = page.getByTestId("recording view");
      await expect(recordingView, "recording selected").toBeVisible();
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      return recordingView;
    });
  await test.step("Check that previous and next recordings are correct", async () => {
    await recordingView.getByTestId("goto previous recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[1].recordingId}/**`,
    );
    await recordingView.getByTestId("goto next recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[2].recordingId}/**`,
    );
    await recordingView.getByTestId("goto next recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[3].recordingId}/**`,
    );
    await recordingView.getByTestId("goto previous recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[2].recordingId}/**`,
    );
  });
  await test.step("Delete recording and ensure the next (later) recording is navigated to", async () => {
    await test.step(`Delete selected recording (#${uploads[2].recordingId})`, async () => {
      await recordingView.getByTestId("delete recording").click();
      await page.getByTestId("confirm action").click();
    });
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[3].recordingId}/**`,
    );
  });
  await test.step("Close recording modal", async () => {
    await recordingView.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `activity`);
  });
  await test.step("Check that recordings list has been updated correctly", async () => {
    await expect(page.getByTestId("recording 2")).not.toBeVisible();
  });
});
