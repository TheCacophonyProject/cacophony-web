import { test, expect } from "@playwright/test";
import {
  clearMailServerLog,
  openResetPasswordRequestEmail,
  receiveAndIgnoreConfirmationEmail,
} from "@/helpers/email-utils";
import {
  confirmNewUserEmailAddressWhileLoggedIn,
  createProjectFromInitialSetup,
  getEmail,
  clickModalOkayButton,
  registerNewUser,
  signOut,
  uniqueName,
  signInExistingUser,
  waitToNavigateToProject,
  confirmExistingUserNewEmailAddress,
  signOutFromSetup,
  confirmNewUserEmailAddressWhileLoggedOut,
} from "@/helpers/browse-helpers";

test("New user signup works, and email confirmation works while user is logged in", async ({
  page,
}) => {
  const user = uniqueName("Bob");
  const password = uniqueName("pass");
  await registerNewUser(page, user, password);
  await confirmNewUserEmailAddressWhileLoggedIn(page, user);
});

test("Resend confirmation email button works correctly, shows support address after failed attempts", async ({
  page,
}) => {
  const user = uniqueName("Bob");
  const password = uniqueName("pass");
  await registerNewUser(page, user, password);
  await receiveAndIgnoreConfirmationEmail(user);
  await page.getByTestId("resend confirmation email").click();
  await expect(page.getByTestId("email send failure fallback")).toBeVisible();
});

test("New user signup works, and email confirmation works if the user is not signed in, after signing in.", async ({
  page,
}) => {
  const user = uniqueName("Bob");
  const password = uniqueName("pass");
  await registerNewUser(page, user, password);
  await signOutFromSetup(page);
  await confirmNewUserEmailAddressWhileLoggedOut(page, user);
  await signInExistingUser(page, user, password);
  await test.step(`${user} is taken to correct setup page`, async () => {
    await expect(page).toHaveURL("setup");
    await expect(page.getByTestId("create new project button")).toBeAttached();
    await expect(page.getByTestId("join existing project button")).toBeAttached();
  });
});

test("Existing new user is able to create a new project from setup view", async ({ page }) => {
  const user = uniqueName("Bob");
  const password = uniqueName("pass");
  const project = uniqueName("project");
  await registerNewUser(page, user, password);
  await confirmNewUserEmailAddressWhileLoggedIn(page, user);
  await createProjectFromInitialSetup(page, project);
  await signOut(page);
});

test("User is able to reset their forgotten password", async ({ page }) => {
  const user = uniqueName("Bob");
  const password = uniqueName("pass");
  const newPassword = uniqueName("pass");
  const project = uniqueName("project");
  await test.step(`${user} creates account and project`, async () => {
    await registerNewUser(page, user, password);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user);
    await createProjectFromInitialSetup(page, project);
    await signOut(page);
  });
  await test.step(`${user} completes forgot password flow, resets password`, async () => {
    await page.getByTestId("forgotten password link").click();
    await expect(page).toHaveURL("forgot-password");
    await page.getByTestId("user email address").fill(getEmail(user));
    await page.getByTestId("send reset password email button").click();
    await openResetPasswordRequestEmail(page, user);
    await page.getByTestId("reset password").click();
    await page.getByTestId("new password field").fill(newPassword);
    await page.getByTestId("new password confirmation field").fill(newPassword);
    await page.getByTestId("reset password button").click();
    await page.getByTestId("sign in button").click();
  });
  await test.step(`${user} successfully signs in using new password`, async () => {
    await expect(page).toHaveURL("sign-in");
    await signInExistingUser(page, user, newPassword);
    await waitToNavigateToProject(page, project);
  });
});

test("Legacy browse users can sign in and have the option of confirming their current email address or choosing a new one", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const password = uniqueName("pass");
  const project = uniqueName("project");
  await test.step("Create an existing user with projects but without confirming email address", async () => {
    await registerNewUser(page, user1, password);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  const newDisplayName = uniqueName("Bob updated");
  await test.step(`${user1} alters their user settings`, async () => {
    await page.goto("/my-settings");
    // TODO - various things filling the fields incorrectly for changing username and email and
    //  making sure we get good validation error messages.
    await test.step(`${user1} changes their display name`, async () => {
      await page.getByTestId("change display name button").click();
      await page.getByTestId("display name").fill(newDisplayName);
      await clickModalOkayButton(page, "change-display-name");
      await expect(page.getByTestId("user display name")).toContainText(newDisplayName);
    });
    await test.step(`${user1} "un-confirms" their email address by changing it`, async () => {
      await page.getByTestId("change email address button").click();
      const newEmailAddress = getEmail(newDisplayName);
      await page.getByTestId("email address").fill(newEmailAddress);
      await clickModalOkayButton(page, "change-email-address");
      await expect(page, "should be redirected to setup").toHaveURL("setup");
      await signOutFromSetup(page);
    });
  });
  await test.step(`${user1} signs in using new email ${newDisplayName}, and is asked to confirm it`, async () => {
    await signInExistingUser(page, newDisplayName, password);
    await test.step(`${newDisplayName} is taken to correct setup page`, async () => {
      await expect(page).toHaveURL("setup");
      await expect(page.getByTestId("resend confirmation email")).toBeAttached();
      await expect(page.getByTestId("new email address")).toBeAttached();
    });
    await test.step(`${user1} chooses a new email address instead, and confirms that`, async () => {
      const userStub = uniqueName("Bob3");
      const evenNewerEmailAddress = getEmail(userStub);
      await page.getByTestId("new email address").fill(evenNewerEmailAddress);
      await clearMailServerLog();
      await page.getByTestId("update email address button").click();
      await confirmExistingUserNewEmailAddress(page, userStub);
    });
  });
  await waitToNavigateToProject(page, project);
});
