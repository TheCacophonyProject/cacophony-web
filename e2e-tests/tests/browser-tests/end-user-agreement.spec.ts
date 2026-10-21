import { expect, test } from "@/helpers/upload-tests";
import { TestApiImpl } from "@shared/client";
import { SUPER_USER } from "@/helpers/config";
import { getUserTestName, loginSuperAdminUser } from "@/helpers/create-test-entities";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import { getEmail, signInExistingUser } from "@/helpers/browse-helpers";

const createUserWithoutEUA = async () => {
  const userName = getUserTestName("eua");
  const registerResponse = await TestApiImpl.Users.register(
    userName,
    "password",
    getEmail(userName),
    undefined,
  );
  expect(registerResponse.success, "register user without EUA").toBe(true);
  if (!registerResponse.success) {
    throw new Error("Failed to register user");
  }
  TestApiImpl.registerCredentials(userName, {
    userData: registerResponse.result.userData,
    refreshToken: registerResponse.result.refreshToken,
    apiToken: registerResponse.result.token,
  });
  const user = { testId: userName, id: registerResponse.result.userData.id, type: "user" } as const;
  await confirmEmailAddressViaApi(user);
  return user;
};

const getAcceptedEUAVersion = async (email: string, password: string = "password") => {
  const response = await TestApiImpl.Users.login(email, password);
  expect(response.success, "login").toBe(true);
  return response.success ? response.result.userData.endUserAgreement : undefined;
};

test("User who hasn't accepted the EUA is prompted, and acceptance is saved", async ({ page }) => {
  const user = await createUserWithoutEUA();
  const latest = await TestApiImpl.Users.getEUAVersion();
  expect(latest.success).toBe(true);
  const latestVersion = latest.success ? latest.result.euaVersion : 0;
  expect(await getAcceptedEUAVersion(getEmail(user.testId))).toBeFalsy();

  await page.goto("/");
  await signInExistingUser(page, user.testId);
  await expect(page.getByTestId("eua form")).toBeVisible();

  const patchRequest = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().endsWith("/api/v1/users"),
  );
  await page.getByTestId("eua form").getByRole("checkbox").check({ force: true });
  await page.getByTestId("accept eua button").click();
  expect((await patchRequest).postDataJSON()).toEqual({ endUserAgreement: latestVersion });

  await expect(page.getByTestId("eua form")).toBeHidden();
  expect(await getAcceptedEUAVersion(getEmail(user.testId))).toBe(latestVersion);

  // Not prompted again after reloading.
  await page.reload();
  await expect(page.getByTestId("eua form")).toBeHidden();
});

test("EUA prompt stays open and shows an error if saving fails", async ({ page }) => {
  const user = await createUserWithoutEUA();
  await page.route("**/api/v1/users", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, messages: ["Failed"] }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto("/");
  await signInExistingUser(page, user.testId);
  await page.getByTestId("eua form").getByRole("checkbox").check({ force: true });
  await page.getByTestId("accept eua button").click();

  await expect(page.getByTestId("eua error")).toBeVisible();
  await expect(page.getByTestId("eua form")).toBeVisible();
  expect(await getAcceptedEUAVersion(getEmail(user.testId))).toBeFalsy();
});

test("Super user is prompted for the EUA, and acceptance is saved", async ({ page }) => {
  const latest = await TestApiImpl.Users.getEUAVersion();
  expect(latest.success).toBe(true);
  const latestVersion = latest.success ? latest.result.euaVersion : 0;

  // Reset the super user's accepted EUA version so that they're prompted again.
  const superUser = await loginSuperAdminUser();
  const reset = await TestApiImpl.Users.withAuth(superUser.testId).updateUserFields({
    endUserAgreement: 0,
  });
  expect(reset.success, "reset super user EUA").toBe(true);
  expect(await getAcceptedEUAVersion(SUPER_USER.email, SUPER_USER.password)).toBeFalsy();

  await page.goto("/");
  await page.getByTestId("email address").fill(SUPER_USER.email);
  await page.getByTestId("password").fill(SUPER_USER.password);
  await page.getByTestId("sign in button").click();
  await expect(page.getByTestId("eua form")).toBeVisible();

  const patchRequest = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().endsWith("/api/v1/users"),
  );
  await page.getByTestId("eua form").getByRole("checkbox").check({ force: true });
  await page.getByTestId("accept eua button").click();
  expect((await patchRequest).postDataJSON()).toEqual({ endUserAgreement: latestVersion });

  await expect(page.getByTestId("eua form")).toBeHidden();
  expect(await getAcceptedEUAVersion(SUPER_USER.email, SUPER_USER.password)).toBe(latestVersion);

  await page.reload();
  await expect(page.getByTestId("eua form")).toBeHidden();
});
