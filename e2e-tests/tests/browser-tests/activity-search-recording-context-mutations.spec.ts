import { expect, test } from "@/helpers/upload-tests";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadRecordingsFromDeviceWithTimesAndDurations } from "@/helpers/recording-uploads";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import {
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";

test("Can delete recordings in recording search context", async ({ oneFrameCptv, page }) => {
  const { uploads, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: ["possum"],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 3),
            durationSeconds: 40,
            tracks: ["false-positive"],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 4),
            durationSeconds: 40,
            tracks: [],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 5),
            durationSeconds: 40,
            tracks: ["hedgehog"],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 6),
            durationSeconds: 40,
            tracks: ["rodent"],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      return { uploads, projectName };
    });
  await test.step("Go to activity view, recordings tab", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
    await page.getByTestId("recordings search").click();
    await page.getByTestId("include false triggers").click();
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

test("Make sure tagging a recording updates the classification in the recording context list", async ({
  oneFrameCptv,
  page,
}) => {
  const { recordingId, projectName } =
    await test.step("Init project with classified recording, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const [{ recordingId }] = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: ["possum"],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      return { recordingId, projectName };
    });
  await test.step("Go to activity view, recordings tab", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
    await page.getByTestId("recordings search").click();
  });
  const recordingView = await test.step("Select only recording, open recording modal", async () => {
    await page.getByTestId("recording 0").click();
    await waitToNavigateToProjectPage(page, projectName, `activity/recording/${recordingId}/**`);
    const recordingView = page.getByTestId("recording view");
    await expect(recordingView, "recording selected").toBeVisible();
    await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
    return recordingView;
  });
  await test.step("Expand single track, tag as rodent", async () => {
    const track0 = recordingView.getByTestId("track 0");
    await track0.click();
    const rodentTag = track0.getByTestId(`classification button rodent`);
    await expect(rodentTag, "classifications expanded").toBeVisible();
    await rodentTag.click();
  });
  await test.step("Close recording modal", async () => {
    await recordingView.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `activity`);
  });
  await test.step("Check that recordings list has been updated correctly", async () => {
    await expect(page.getByTestId("recording 0").getByTestId("rodent tag")).toBeVisible();
  });
});
