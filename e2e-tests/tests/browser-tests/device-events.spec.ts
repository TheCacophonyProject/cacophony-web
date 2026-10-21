import { expect, test } from "@/helpers/upload-tests";
import { addMinutes } from "@/helpers/date-helpers";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import { DeviceSim } from "@/helpers/device-sim";
import {
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";

test("User can sign in and see device events, including event types with spaces", async ({
  page,
}) => {
  const { project, projectName, deviceHandle } =
    await test.step("Init project with device events", async () => {
      const initialDateTime = new Date();
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const deviceHandle = project.getDevice();
      const sim = new DeviceSim(deviceHandle);
      // The view renders event types with dashes replaced by spaces, so a hyphenated type and a type
      // with literal spaces should both be displayed as space-separated words.
      sim.addEvent({ type: "test-event" }, addMinutes(initialDateTime, -10));
      sim.addEvent({ type: "event type with spaces" }, addMinutes(initialDateTime, -5));
      await sim.uploadEvents();
      return {
        project,
        projectName: project.projectHandle.testId,
        deviceHandle,
      };
    });

  await test.step("Sign in user", async () => {
    const adminUser = project.getAdminUser();
    await confirmEmailAddressViaApi(adminUser);
    await signInExistingUser(page, adminUser.testId);
    await waitToNavigateToProject(page, projectName);
  });

  await test.step("Go to the device events view", async () => {
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
    await page.getByTestId("device events").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `devices/${deviceHandle.id}/${deviceHandle.testId}/events`,
    );
  });

  await test.step("Both events are listed, most recent first", async () => {
    const events = page.getByTestId("device event");
    await expect(events).toHaveCount(2);
    await expect(events.nth(0).getByTestId("device event title")).toContainText(
      "event type with spaces",
    );
    await expect(events.nth(1).getByTestId("device event title")).toContainText("test event");
  });

  await test.step("Event type with spaces is available as a filter", async () => {
    await page.getByTestId("device events filter").click();
    await page
      .getByTestId("device events filter")
      .getByRole("option", { name: "event type with spaces" })
      .click();
    const events = page.getByTestId("device event");
    await expect(events).toHaveCount(1);
    await expect(events.first().getByTestId("device event title")).toContainText(
      "event type with spaces",
    );
  });
});
