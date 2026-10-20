import { startMailServerStub } from "@/helpers/email-utils";
import { SUPER_USER } from "@/helpers/config";
import { loginSuperAdminUser } from "@/helpers/create-test-entities";
import { TestApiImpl } from "@shared/client";
import { expect, test as setup } from "@playwright/test";

setup("startup mail-server stub", async () => {
  const result = await startMailServerStub();
  console.log(result);
});

// The emulated thermal camera device registers into the "new" group.
setup("ensure 'new' group exists", async () => {
  // The super user's email isn't confirmed by default. Confirming is idempotent.
  const tokenResponse = await TestApiImpl.Users.debugGetEmailConfirmationToken(SUPER_USER.email);
  expect(tokenResponse.success, "get email confirmation token").toBe(true);
  if (tokenResponse.success) {
    const confirmResponse = await TestApiImpl.Users.validateEmailConfirmationToken(
      tokenResponse.result.token,
    );
    expect(confirmResponse.success, "confirm super user email").toBe(true);
  }

  const superUser = await loginSuperAdminUser();
  const projects = TestApiImpl.Projects.withAuth(superUser.testId);
  const allProjects = await projects.getAllProjects();
  expect(allProjects.success, "fetch all projects").toBe(true);
  if (!allProjects.success) {
    return;
  }
  if (!allProjects.result.groups.some(({ groupName }) => groupName === "new")) {
    const created = await projects.addNewProject("new");
    expect(created.success, "create 'new' project").toBe(true);
  }
});
