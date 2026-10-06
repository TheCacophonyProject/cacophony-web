import { expect, test } from "@/helpers/upload-tests";
import {
  addUserToProject,
  createProjectWithUserAndDevice,
  createUser,
} from "@/helpers/create-test-entities";
import { TestApiImpl } from "@shared/client";
import { DeviceType, HttpStatusCode } from "@shared/api/consts";

test.describe("Device in project", () => {
  // FIXME: These first two tests are weird, they only ensure that admins can see a device.
  //  And for some reason, the device itself says whether the user is an admin.  I think this is a residual
  //  hold-over from when we had the concept of "device-users": users who could see an individual device,
  //  but weren't members of the project.  These tests may well now be redundant.
  test("Project admin should see everything including device users", async () => {
    const { getOwner, getDevice, projectHandle } = await createProjectWithUserAndDevice();
    const device = getDevice();
    const response = await TestApiImpl.Devices.withAuth(getOwner().testId).getDeviceInProject(
      device.testId,
      projectHandle.testId,
    );
    expect(response.success, "project admin can get device in project").toBe(true);
    if (response.success) {
      expect(response.result.device).toMatchObject({
        id: device.id,
        saltId: device.id,
        deviceName: device.testId,
        groupName: projectHandle.testId,
        groupId: projectHandle.id,
        type: DeviceType.Thermal,
        admin: true,
        active: true,
        isHealthy: false,
      });
    }
  });

  test("Project member should be able to read all but device users", async () => {
    const bundle = await createProjectWithUserAndDevice();
    const { getDevice, projectHandle } = bundle;
    const device = getDevice();
    const member = await createUser("member");
    await addUserToProject(bundle, member);
    const response = await TestApiImpl.Devices.withAuth(member.testId).getDeviceInProject(
      device.testId,
      projectHandle.testId,
    );
    expect(response.success, "project member can get device in project").toBe(true);
    if (response.success) {
      expect(response.result.device).toMatchObject({
        id: device.id,
        saltId: device.id,
        deviceName: device.testId,
        groupName: projectHandle.testId,
        groupId: projectHandle.id,
        type: DeviceType.Thermal,
        admin: false,
        active: true,
        isHealthy: false,
      });
      expect(response.result.device.users, "device users are hidden from members").toBeUndefined();
    }
  });

  test("Non member should not have any access", async () => {
    const { getDevice, projectHandle } = await createProjectWithUserAndDevice();
    const hacker = await createUser("hacker");
    const response = await TestApiImpl.Devices.withAuth(hacker.testId).getDeviceInProject(
      getDevice().testId,
      projectHandle.testId,
    );
    expect(response.success, "non member is blocked from getting device").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Forbidden);
  });

  test("Can retrieve project by id instead of name", async () => {
    const bundle = await createProjectWithUserAndDevice();
    const { getDevice, projectHandle } = bundle;
    const device = getDevice();
    const member = await createUser("member");
    await addUserToProject(bundle, member);
    const response = await TestApiImpl.Devices.withAuth(member.testId).getDeviceInProject(
      device.testId,
      projectHandle.id,
    );
    expect(response.success, "project member can get device by project id").toBe(true);
    if (response.success) {
      expect(response.result.device).toMatchObject({
        id: device.id,
        saltId: device.id,
        deviceName: device.testId,
        groupName: projectHandle.testId,
        groupId: projectHandle.id,
        type: DeviceType.Thermal,
        admin: false,
        active: true,
        isHealthy: false,
      });
    }
  });

  test("Correctly handles invalid device", async () => {
    const { getOwner, projectHandle } = await createProjectWithUserAndDevice();
    const response = await TestApiImpl.Devices.withAuth(getOwner().testId).getDeviceInProject(
      "bad-camera",
      projectHandle.testId,
    );
    expect(response.success, "getting a nonexistent device failed").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Forbidden);
  });

  test("Correctly handles invalid project", async () => {
    const { getOwner, getDevice } = await createProjectWithUserAndDevice();
    const response = await TestApiImpl.Devices.withAuth(getOwner().testId).getDeviceInProject(
      getDevice().testId,
      "bad-project",
    );
    expect(response.success, "getting a device in a nonexistent project failed").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Forbidden);
  });
});
