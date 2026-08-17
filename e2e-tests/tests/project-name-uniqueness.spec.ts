import { expect, test } from "@/helpers/upload-tests";
import { createUser, getTestName } from "@/helpers/create-test-entities";
import { TestApiImpl } from "@shared/client";

test("Project names can't match hyphenated variants of the same name", async () => {
  const userHandle = await createUser("Test user");
  const testUniqueId = getTestName("");
  await test.step("Add initial project", async () => {
    const projectResponse = await TestApiImpl.Projects.withAuth(userHandle.testId).addNewProject(
      `my project is a cool project ${testUniqueId}`,
    );
    expect(projectResponse.success).toBe(true);
  });
  await test.step("Add project with similar fully hyphenated name", async () => {
    const projectResponse = await TestApiImpl.Projects.withAuth(userHandle.testId).addNewProject(
      `my-project-is-a-cool-project-${testUniqueId}`,
    );
    expect(projectResponse.success).toBe(false);
  });
  await test.step("Add project with similar partially hyphenated name", async () => {
    const projectResponse = await TestApiImpl.Projects.withAuth(userHandle.testId).addNewProject(
      `my-project is a cool project ${testUniqueId}`,
    );
    expect(projectResponse.success).toBe(false);
  });
});
