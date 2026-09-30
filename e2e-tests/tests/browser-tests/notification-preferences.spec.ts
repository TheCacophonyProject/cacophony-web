import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import {
  signInExistingUser,
  urlNormaliseProjectName,
  waitToNavigateToProject,
} from "@/helpers/browse-helpers";

test("Initial user notification preferences visually match the default notification preferences", async ({
  page,
}) => {
  const projectName = await test.step(
    "Create project, sign in user",
    async () => {
      const project = await createProjectWithUserAndDevice();
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      await confirmEmailAddressViaApi(adminUser);
      await signInExistingUser(page, adminUser.testId);
      await waitToNavigateToProject(page, projectName);
      return projectName;
    },
  );

  await test.step("Go to project preferences", async () => {
    await page.goto(`/${urlNormaliseProjectName(projectName)}/my-settings`);
    await expect(
      page.getByText("Project activity email preferences"),
    ).toBeVisible();
  });

  await test.step("Default notification preferences match project admin defaults", async () => {
    await expect(
      page.getByLabel("I want to receive a daily activity digest"),
    ).not.toBeChecked();
    await expect(
      page.getByLabel("I want to receive a weekly activity digest"),
    ).not.toBeChecked();
    // Admins default to opted-in for stopped device notifications, since
    // reportStoppedDevices hasn't been explicitly set yet.
    await expect(
      page.getByLabel(
        "I want to receive emails about devices that might have stopped",
      ),
    ).toBeChecked();
  });
});
