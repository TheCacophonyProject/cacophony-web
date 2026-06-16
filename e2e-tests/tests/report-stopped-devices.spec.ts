import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { dockerExecNodeScript, dockerExecNodeTestScript } from "@/helpers/docker-exec";
import {
  confirmEmailAddressViaApi,
  receiveAndIgnoreConfirmationEmail,
  waitForEmail,
} from "@/helpers/email-utils";

test("Stopped devices report script executes without errors, sends email if your email is confirmed", async () => {
  const project = await createProjectWithUserAndDevice();
  const device = project.getDevice();
  await confirmEmailAddressViaApi(project.getAdminUser());
  await dockerExecNodeTestScript("test-stopped-devices.js", ["--deviceId", device.id.toString()]);
  await dockerExecNodeScript("report-stopped-devices.js", ["--force"]);
  const email = await waitForEmail(project.getAdminUser().testId, "stopped devices report");
  expect(email.headers.subject, "email subject is correct").toEqual(
    `💔 Possible stopped or offline device in '${project.projectHandle.testId}'`,
  );
  expect(email.body, "email is about correct device").toContain(project.getDevice().testId);

  // Running the report a second time shouldn't send a second alert
  await dockerExecNodeScript("report-stopped-devices.js", ["--force"]);

  // FIXME: This sometimes fails when there's a lot going on running CI tests in parallel.
  const secondEmail = await waitForEmail(
    project.getAdminUser().testId,
    "stopped devices report",
    500,
  );
  expect(secondEmail.error, "second email not sent").toBeDefined();
});

test("Stopped devices report script executes without errors, admin who opts out of these notifications doesn't receive an email", async () => {
  const project = await createProjectWithUserAndDevice();
  const AdminUser = project.api();
  const device = project.getDevice();
  await confirmEmailAddressViaApi(project.getAdminUser());

  const projectSettingsUpdateResponse = await AdminUser.Projects.saveProjectUserSettings(
    project.projectHandle.id,
    {
      notificationPreferences: {
        reportStoppedDevices: false,
      },
    },
  );
  expect(projectSettingsUpdateResponse.success, "project settings update succeeded").toBe(true);

  await dockerExecNodeTestScript("test-stopped-devices.js", ["--deviceId", device.id.toString()]);
  await dockerExecNodeScript("report-stopped-devices.js", ["--force"]);

  const email = await waitForEmail(project.getAdminUser().testId, "stopped devices report", 500);
  expect(email.error, "email not sent").toBeDefined();
});

test("Stopped devices report script executes without errors, does not send email if your email isn't confirmed", async () => {
  const project = await createProjectWithUserAndDevice();
  const device = project.getDevice();

  // Receive account confirmation email.
  await receiveAndIgnoreConfirmationEmail(project.getAdminUser().testId);

  await dockerExecNodeTestScript("test-stopped-devices.js", ["--deviceId", device.id.toString()]);
  await dockerExecNodeScript("report-stopped-devices.js", ["--force"]);

  const email = await waitForEmail(project.getAdminUser().testId, "stopped devices report", 500);
  expect(email.error, "email not sent").toBeDefined();
});
