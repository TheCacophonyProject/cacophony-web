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

test("Can bulk delete recordings", async ({ standardAudio, page }) => {
  const { projectName } =
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
  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
    await expect(page.getByTestId("recording 0")).toBeVisible();
    await expect(page.getByTestId("search results estimate count")).toBeVisible();
    await expect(page.getByTestId("search results estimate count")).toContainText("4 results");
  });
  await test.step("Bulk delete recordings", async () => {
    await expect(page.getByTestId("bulk delete button")).toBeVisible();
    const bulkDeleteButton = page.getByTestId("bulk delete button");
    await bulkDeleteButton.click();
    await bulkDeleteButton.getByTestId("confirm action").click();
    await expect(page.getByTestId("bulk delete modal")).toBeVisible();
    await page.getByTestId("start bulk delete").click();
    await expect(page.getByTestId("bulk delete modal")).not.toBeVisible();
  });
  await test.step("Check that no recordings exist for search", async () => {
    await expect(page.getByTestId("recording 0")).not.toBeAttached();
    await expect(page.getByTestId("search results estimate count")).not.toBeAttached();
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
});
