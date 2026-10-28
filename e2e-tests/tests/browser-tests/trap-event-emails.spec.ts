import { expect, test } from "@/helpers/upload-tests";
import {
  addUserToProject,
  createProjectWithUserAndDevice,
  createUser,
} from "@/helpers/create-test-entities";
import { DeviceSim } from "@/helpers/device-sim";
import {
  confirmEmailAddressViaApi,
  waitForEmail,
  waitForEmailAndRenderEmailHtml,
} from "@/helpers/email-utils";
import { getEmail } from "@/helpers/browse-helpers";
import { addMinutes, addSeconds } from "@/helpers/date-helpers";

// Events must not be dated in the future, so anchor them in the recent past.
const eventBaseTime = () => addMinutes(new Date(), -30);

const setupProjectWithConfirmedAdmin = async () => {
  const project = await createProjectWithUserAndDevice({
    initialDateTime: addMinutes(new Date(), -60),
  });
  await confirmEmailAddressViaApi(project.getAdminUser());
  return { project, device: new DeviceSim(project.getDevice()) };
};

test("Opted-in users are emailed about a 'trapTriggered' event, including the reason", async ({
  page,
}) => {
  const reason = "Found an possum of confidence 83 that needs to be trapped";
  const { project, device } = await setupProjectWithConfirmedAdmin();
  const eventTime = eventBaseTime();
  device.addEvent({ type: "trapTriggered", details: JSON.stringify({ reason }) }, eventTime);
  await device.uploadEvents(addSeconds(eventTime, 30));

  const email = await waitForEmailAndRenderEmailHtml(
    page,
    project.getAdminUser().testId,
    "trapTriggered notification",
    undefined,
    "Trap triggered",
  );
  expect(email.headers.subject).toContain("Trap triggered");
  // The reason is device-supplied, so it must be shown as text rather than interpreted as HTML.
  await expect(page.getByTestId("trap event reason")).toHaveText(reason);
  await expect(page.getByTestId("trap event time")).toHaveCount(1);
});

test("A 'trapTriggered' event without a reason is emailed without a reason section", async ({
  page,
}) => {
  const { project, device } = await setupProjectWithConfirmedAdmin();
  const eventTime = eventBaseTime();
  device.addEvent({ type: "trapTriggered" }, eventTime);
  await device.uploadEvents(addSeconds(eventTime, 30));

  const email = await waitForEmailAndRenderEmailHtml(
    page,
    project.getAdminUser().testId,
    "trapTriggered notification",
    undefined,
    "Trap triggered",
  );
  expect(email.headers.subject).toContain("Trap triggered");
  await expect(page.getByTestId("trap event reason")).toBeHidden();
  await expect(page.getByTestId("trap event time")).toHaveCount(1);
});

test("Multiple events submitted together are consolidated into a single email", async ({
  page,
}) => {
  const { project, device } = await setupProjectWithConfirmedAdmin();
  const firstEventTime = eventBaseTime();
  const eventTimes = [0, 5, 10].map((minutes) => addMinutes(firstEventTime, minutes));
  for (const eventTime of eventTimes) {
    // Identical payloads are batched into a single API request by the device sim.
    device.addEvent({ type: "trapTriggered" }, eventTime);
  }
  await device.uploadEvents(addMinutes(firstEventTime, 11));

  const adminUser = project.getAdminUser();
  await waitForEmailAndRenderEmailHtml(
    page,
    adminUser.testId,
    "consolidated trapTriggered notification",
    undefined,
    "Trap triggered",
  );
  await expect(page.getByTestId("trap event time")).toHaveCount(eventTimes.length);

  await test.step("No further emails are sent for the other events in the batch", async () => {
    const extra = await waitForEmail(
      adminUser.testId,
      "unexpected extra email",
      2000,
      false,
      "Trap triggered",
    );
    expect(extra.error, "only one email was sent").toBeDefined();
  });
});

test("Recipients are blind copied, and users who have opted out are not emailed", async ({
  page,
}) => {
  const { project, device } = await setupProjectWithConfirmedAdmin();
  const adminUser = project.getAdminUser();

  const optedInUser = await createUser("opted in");
  await confirmEmailAddressViaApi(optedInUser);
  await addUserToProject(project, optedInUser);
  const optedOutUser = await createUser("opted out");
  await confirmEmailAddressViaApi(optedOutUser);
  await addUserToProject(project, optedOutUser);
  await test.step("One member opts out of trap notifications", async () => {
    const response = await project
      .api(optedOutUser)
      .Projects.saveProjectUserSettings(project.projectHandle.id, {
        notificationPreferences: { trapActions: false },
      });
    expect(response.success, "opt-out succeeded").toBe(true);
  });

  const eventTime = eventBaseTime();
  device.addEvent({ type: "trapTriggered" }, eventTime);
  await device.uploadEvents(addSeconds(eventTime, 30));

  const email = await waitForEmailAndRenderEmailHtml(
    page,
    adminUser.testId,
    "trapTriggered notification",
    undefined,
    "Trap triggered",
  );
  await test.step("Recipients can't see each other's addresses", async () => {
    const toHeader = String(email.headers.to ?? "");
    for (const user of [adminUser, optedInUser]) {
      expect(toHeader, "recipient is not in the visible 'to' header").not.toContain(
        getEmail(user.testId),
      );
    }
  });

  await test.step("The user who opted out does not receive the email", async () => {
    // A single email is addressed to all recipients, and the mail stub hands it out only once,
    // so a user who was (wrongly) addressed would have been matched by this lookup instead.
    const optedOutEmail = await waitForEmail(
      optedOutUser.testId,
      "trap notification for opted-out user",
      2000,
      false,
      "Trap triggered",
    );
    expect(optedOutEmail.error, "opted-out user was not emailed").toBeDefined();
  });
});
