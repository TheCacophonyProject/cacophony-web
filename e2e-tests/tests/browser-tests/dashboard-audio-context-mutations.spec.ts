import { expect, test } from "@/helpers/upload-tests";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadAudioRecordingsFromDeviceWithTimesAndDurations } from "@/helpers/recording-uploads";
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
    await expect(page.getByTestId("audio dashboard loading")).not.toBeAttached();
  });
  const recordingView =
    await test.step("Select top ranked species, open recording modal", async () => {
      await page.getByTestId("species fantail").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `audio/recording/${uploads[4].recordingId}/**`,
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
      `audio/recording/${uploads[3].recordingId}/**`,
    );
    await recordingView.getByTestId("goto next recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `audio/recording/${uploads[4].recordingId}/**`,
    );
  });
  await test.step("Delete recording and ensure the next (later) recording is navigated to", async () => {
    await test.step(`Delete selected recording (#${uploads[4].recordingId})`, async () => {
      const deleteButton = recordingView.getByTestId("delete recording");
      await deleteButton.click();
      await deleteButton.getByTestId("confirm action").click();
    });
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `audio/recording/${uploads[3].recordingId}/**`,
    );
    await expect(recordingView.getByTestId("goto next recording")).not.toBeAttached();
    await expect(recordingView.getByTestId("goto previous recording")).not.toBeAttached();
  });
  await test.step("Close recording modal", async () => {
    await recordingView.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `audio`);
  });
  await test.step("Check that recordings list has been updated correctly", async () => {
    await expect(page.getByTestId("species fantail").getByTestId("species count")).toContainText(
      "1",
    );
  });
});

test("Can reclassify recording tracks in dashboard audio context", async ({
  standardAudio,
  page,
}) => {
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
    await expect(page.getByTestId("audio dashboard loading")).not.toBeAttached();
  });
  const recordingView =
    await test.step("Select top ranked species, open recording modal", async () => {
      await page.getByTestId("species chaffinch").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `audio/recording/${uploads[0].recordingId}/**`,
      );
      const recordingView = page.getByTestId("recording view");
      await expect(recordingView, "recording selected").toBeVisible();
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      return recordingView;
    });
  await test.step("Expand single track, tag as kea", async () => {
    const track0 = recordingView.getByTestId("track 0");
    await track0.click();
    const keaTag = track0.getByTestId(`classification button kea`);
    await expect(keaTag, "classifications expanded").toBeVisible();
    await keaTag.click();
  });
  await test.step("Close recording modal", async () => {
    await recordingView.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `audio`);
  });
  await test.step("Check that recordings list has been updated correctly", async () => {
    await expect(page.getByTestId("species chaffinch")).not.toBeAttached();
    await expect(page.getByTestId("species kea")).toBeAttached();
  });
});
