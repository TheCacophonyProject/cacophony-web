import { expect, test } from "@/helpers/upload-tests";
import {
  addDeviceToProject,
  createProject,
  createProjectWithUserAndDevice,
  createUser,
} from "@/helpers/create-test-entities";
import { getEmail } from "@/helpers/browse-helpers";
import { TestApiImpl } from "@shared/client";
import { HttpStatusCode } from "@shared/api/consts";

test.describe("Authentication", () => {
  test("Can authenticate using deviceId", async () => {
    const { getDevice } = await createProjectWithUserAndDevice();
    const device = getDevice();
    const authResponse = await TestApiImpl.Devices.authenticateDevice("password", {
      deviceId: device.id,
    });
    expect(authResponse.success, "authenticate device by id succeeded").toBe(true);
    if (authResponse.success) {
      expect(authResponse.result.id).toBe(device.id);
      expect(authResponse.result.token).toBeTruthy();
    }
  });

  test("Can authenticate as a device", async () => {
    const { getDevice, projectHandle } = await createProjectWithUserAndDevice();
    const device = getDevice();
    const authResponse = await TestApiImpl.Devices.authenticateDevice("password", {
      deviceName: device.testId,
      groupName: projectHandle.testId,
    });
    expect(authResponse.success, "authenticate device by name succeeded").toBe(true);
    if (authResponse.success) {
      expect(authResponse.result.id).toBe(device.id);
      expect(authResponse.result.token).toBeTruthy();
    }
  });

  test("Device is correctly rejected if password is wrong", async () => {
    const { getDevice, projectHandle } = await createProjectWithUserAndDevice();
    const authResponse = await TestApiImpl.Devices.authenticateDevice("wrong-password", {
      deviceName: getDevice().testId,
      groupName: projectHandle.testId,
    });
    expect(authResponse.success, "authenticate device with wrong password failed").toBe(false);
    expect(authResponse.status).toBe(HttpStatusCode.AuthorizationError);
  });

  test("Device is correctly rejected if deviceName is wrong", async () => {
    const { projectHandle, getDevice } = await createProjectWithUserAndDevice();
    await addDeviceToProject("other", projectHandle);
    const authResponse = await TestApiImpl.Devices.authenticateDevice("password", {
      deviceName: `${getDevice().testId}-wrong`,
      groupName: projectHandle.testId,
    });
    expect(authResponse.success, "authenticate device with wrong deviceName failed").toBe(false);
    expect(authResponse.status).toBe(HttpStatusCode.AuthorizationError);
  });

  test("Device is correctly rejected if groupName is wrong", async () => {
    const { getDevice, getOwner } = await createProjectWithUserAndDevice();
    const otherProject = await createProject("other", getOwner());
    const authResponse = await TestApiImpl.Devices.authenticateDevice("password", {
      deviceName: getDevice().testId,
      groupName: otherProject.testId,
    });
    expect(authResponse.success, "authenticate device with wrong groupName failed").toBe(false);
    expect(authResponse.status).toBe(HttpStatusCode.AuthorizationError);
  });

  test("Can authenticate as a user using email", async () => {
    const user = await createUser("user");
    const loginResponse = await TestApiImpl.Users.login(getEmail(user.testId), "password");
    expect(loginResponse.success, "login with email succeeded").toBe(true);
    if (loginResponse.success) {
      expect(loginResponse.result.userData.id).toBe(user.id);
      expect(loginResponse.result.token).toBeTruthy();
    }
  });

  test("User is rejected for wrong password", async () => {
    const user = await createUser("user");
    const loginResponse = await TestApiImpl.Users.login(getEmail(user.testId), "bad_password");
    expect(loginResponse.success, "login with wrong password failed").toBe(false);
    expect(loginResponse.status).toBe(HttpStatusCode.AuthorizationError);
  });

  test("Superuser can authenticate as another user and receive their permissions", async () => {
    const bundleA = await createProjectWithUserAndDevice({ nameBase: "userA" });
    const bundleB = await createProjectWithUserAndDevice({ nameBase: "userB" });
    const userB = bundleB.getOwner();
    const superUser = await bundleA.getTestSuperUser();

    const loginResponse = await TestApiImpl.Users.withAuth(superUser.testId).loginOther(
      getEmail(userB.testId),
    );
    expect(loginResponse.success, "superuser login as other user succeeded").toBe(true);
    if (!loginResponse.success) {
      return;
    }
    expect(loginResponse.result.userData.id).toBe(userB.id);

    const onBehalfOfUserB = `${userB.testId}_on_behalf`;
    TestApiImpl.registerCredentials(onBehalfOfUserB, {
      userData: loginResponse.result.userData,
      refreshToken: loginResponse.result.refreshToken,
      apiToken: loginResponse.result.token,
    });

    await test.step("User B sees their own project but not user A's", async () => {
      const projectsResponse =
        await TestApiImpl.Projects.withAuth(onBehalfOfUserB).getCurrentUserProjects();
      expect(projectsResponse.success, "fetch projects on behalf of user B").toBe(true);
      if (projectsResponse.success) {
        const projectIds = projectsResponse.result.groups.map(({ id }) => id);
        expect(projectIds).toContain(bundleB.projectHandle.id);
        expect(projectIds).not.toContain(bundleA.projectHandle.id);
      }
    });
  });

  test("Non-superuser cannot authenticate as another user", async () => {
    const userA = await createUser("userA");
    const userB = await createUser("userB");
    const loginResponse = await TestApiImpl.Users.withAuth(userA.testId).loginOther(
      getEmail(userB.testId),
    );
    expect(loginResponse.success, "non-superuser login as other user failed").toBe(false);
    expect(loginResponse.status).toBe(HttpStatusCode.Forbidden);
  });
});
