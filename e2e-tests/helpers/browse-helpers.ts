import { expect, Page, test } from "@playwright/test";
import * as crypto from "crypto";
import { URLPattern } from "node:url";
import { openSignupConfirmationEmail } from "./email-utils";

export const uniqueName = (str: string): string => {
  return `${str}-${btoa(crypto.randomUUID().substring(0, 8)).replace(/=/g, "")}`;
};

//export const getEmailConfirmationToken = `${apiRoot}/users/get-email-confirmation-token`;
export const getEmail = (userName: string) =>
  `${userName.replace(/ /g, "-")}@api-test.cacophony.org.nz`.toLowerCase();
export const urlNormaliseProjectName = (name: string): string => {
  return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};

export const clickModalOkayButton = async (page: Page, modalId: string) => {
  await page.locator(`#${modalId} .modal-footer > .btn-primary`).click();
  await expect(page.locator(`#${modalId}`)).toBeHidden();
};

export const registerNewUser = async (page: Page, userName: string, password: string) => {
  await test.step(`Registering user: ${userName}`, async () => {
    await page.goto("/");
    await page.getByTestId("create new account link").click();
    await page.getByTestId("username").fill(userName);
    await page.getByTestId("email address").fill(getEmail(userName));
    await page.getByTestId("password").fill(password);
    await page.getByTestId("password confirmation").fill(password);
    await page.getByTestId("accept eua").click();
    await page.getByTestId("register button").click();
    await page.waitForURL("**/setup");
    // User should be taken to account setup page, where they are prompted to confirm their email address.
    await expect(page.getByTestId("resend confirmation email")).toBeAttached();
  });
};

export const registerNewUserFromEmailLink = async (
  page: Page,
  userName: string,
  password: string,
) => {
  await test.step(`Registering user: ${userName}`, async () => {
    await page.getByTestId("username").fill(userName);
    await page.getByTestId("email address").fill(getEmail(userName));
    await page.getByTestId("password").fill(password);
    await page.getByTestId("password confirmation").fill(password);
    await page.getByTestId("accept eua").click();
    await page.getByTestId("register button").click();
  });
};
export const signOut = async (page: Page) => {
  await test.step("Sign out", async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("sign out link").click();
  });
};

export const signOutFromSetup = async (page: Page) => {
  await test.step("Sign out from setup", async () => {
    await page.getByTestId("sign out link").click();
  });
};

export const signInExistingUser = async (
  page: Page,
  userName: string,
  password: string = "password",
) => {
  await test.step("Sign in existing user", async () => {
    const url = `*/sign-in*`;
    const pattern = new URLPattern({ pathname: url });
    await test.step(`Wait for URL ${url}`, async () => {
      await expect(page).toHaveURL((url) => pattern.test(url));
    });
    await page.getByTestId("email address").fill(getEmail(userName));
    await page.getByTestId("password").fill(password);
    await page.getByTestId("sign in button").click();
    await page.waitForURL("**");
  });
};

export const waitToNavigateToProject = async (page: Page, project: string) => {
  // We should be taken to the project page (probably the dashboard page?)
  const url = `*/${urlNormaliseProjectName(project)}*`;
  const pattern = new URLPattern({ pathname: url });
  await test.step(`Wait for URL ${url}`, async () => {
    await expect(page).toHaveURL((url) => pattern.test(url));
  });
};

export const waitToNavigateToProjectPage = async (
  page: Page,
  project: string,
  urlExtra: string,
) => {
  // We should be taken to the project page (probably the dashboard page?)
  const url = `*/${urlNormaliseProjectName(project)}/${urlExtra}`;
  const pattern = new URLPattern({ pathname: url });
  await test.step(`Wait for URL ${url}`, async () => {
    await expect(page).toHaveURL((url) => pattern.test(url));
  });
};

export const createProjectFromInitialSetup = async (page: Page, project: string) => {
  await test.step(`Create project ${project}`, async () => {
    await page.waitForURL("setup");
    await expect(page.getByTestId("create new project button")).toBeVisible();
    await page.getByTestId("create new project button").click();
    await page.getByTestId("new project name").fill(project);
    await expect(page.getByTestId("new project name")).toHaveValue(project);
    await page.getByTestId("create project button").click();
    await waitToNavigateToProject(page, project);
  });
};

export const createNewProject = async (page: Page, project: string) => {
  await test.step(`Create project ${project}`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("switch or join project button").click();
    await page.getByTestId("create new project button").click();
    await page.getByTestId("new project name").fill(project, { force: true });
    await expect(page.getByTestId("new project name")).toHaveValue(project);
    await page.getByTestId("create project button").click();
    await waitToNavigateToProject(page, project);
  });
};
export const ensureMainNavIsAvailable = async (page: Page) => {
  await test.step(`Ensure main nav is visible`, async () => {
    await page.mouse.move(10, 10);
    await expect(page.getByTestId("switch or join project button")).toBeVisible();
  });
};

export const confirmNewUserEmailAddressWhileLoggedIn = async (page: Page, user: string) => {
  await test.step(`Confirm email address for ${user}`, async () => {
    await openSignupConfirmationEmail(page, user);
    await page.getByTestId("confirm email address").click();

    await page.waitForURL("setup");
    if ((await page.getByTestId("pending project memberships").count()) === 0) {
      await expect(page.getByTestId("create new project button")).toBeAttached();
      await expect(page.getByTestId("join existing project button")).toBeAttached();
    }
  });
};

export const confirmNewUserEmailAddressWhileLoggedOut = async (page: Page, user: string) => {
  await test.step(`Confirm email address for ${user}`, async () => {
    await openSignupConfirmationEmail(page, user);
    await page.getByTestId("confirm email address").click();
    const url = `*/sign-in*`;
    const pattern = new URLPattern({ pathname: url });
    await test.step(`Wait for URL ${url}`, async () => {
      await expect(page).toHaveURL((url) => pattern.test(url));
    });
  });
};

export const confirmExistingUserNewEmailAddress = async (page: Page, user: string) => {
  await test.step(`Confirm new email address for ${user}`, async () => {
    await openSignupConfirmationEmail(page, user);
    await page.getByTestId("confirm email address").click();
  });
};
