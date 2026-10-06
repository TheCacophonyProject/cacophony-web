import { expect, test } from "@/helpers/upload-tests";
import {
  addDeviceToProject,
  createProject,
  createProjectWithUserAndDevice,
  getDeviceTestName,
  getProjectTestName,
} from "@/helpers/create-test-entities";
import { TestApiImpl } from "@shared/client";
import { DeviceType, HttpStatusCode } from "@shared/api/consts";

test.describe("Device register", () => {
  test("Adding device created valid deviceHistory entry", async () => {
    const { getOwner, projectHandle } = await createProjectWithUserAndDevice();
    const device = await addDeviceToProject("aNewDevice", projectHandle, undefined, false, 1234567);

    const history = await TestApiImpl.Devices.withAuth(getOwner().testId).getDeviceHistoryInTest(
      device.id,
    );
    expect(history, "device history was fetched").toBeTruthy();
    if (history) {
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        DeviceId: device.id,
        GroupId: projectHandle.id,
        deviceName: device.testId,
        location: null,
        saltId: 1234567,
        setBy: "register",
        stationId: null,
        settings: null,
      });
      expect(history[0].fromDateTime).toBeTruthy();
      expect(history[0].uuid).toBeTruthy();
    }
  });

  test("Group can have multiple devices with different names", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    await addDeviceToProject("Smile", projectHandle);
  });

  test("Devices in different projects can have the same names", async () => {
    const { projectHandle, getOwner } = await createProjectWithUserAndDevice();
    const otherProject = await createProject("other", getOwner());
    await addDeviceToProject("gotya", projectHandle, undefined, true);
    await addDeviceToProject("gotya", otherProject, undefined, true);
  });

  test("Cannot create device with same name (even with different case) in the same project", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    await addDeviceToProject("gotya", projectHandle, undefined, true);
    for (const deviceName of ["GotYa", "gotya"]) {
      const response = await TestApiImpl.Devices.registerDevice(
        projectHandle.testId,
        deviceName,
        "password",
      );
      expect(response.success, `registering duplicate device '${deviceName}' failed`).toBe(false);
      expect(response.status).toBe(HttpStatusCode.BadRequest);
    }
  });

  test("Cannot create two devices in the same project with the same url-normalised name", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    // Registered in both orders, since the name that exists first differs in each case.
    const pairs = [
      ["my device", "my-device"],
      ["other-device", "other device"],
    ];
    for (const [first, second] of pairs) {
      await addDeviceToProject(first, projectHandle, undefined, true);
      const response = await TestApiImpl.Devices.registerDevice(
        projectHandle.testId,
        second,
        "password",
      );
      expect(
        response.success,
        `registering '${second}' failed since '${first}' has the same url-normalised name`,
      ).toBe(false);
      expect(response.status).toBe(HttpStatusCode.BadRequest);
    }
  });

  test("Cannot create a device with a reserved name, or a name that normalises to one", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    for (const deviceName of ["history", "History", "In Group", "Reference Image"]) {
      const response = await TestApiImpl.Devices.registerDevice(
        projectHandle.testId,
        deviceName,
        "password",
      );
      expect(response.success, `registering reserved device name '${deviceName}' failed`).toBe(
        false,
      );
      expect(response.status).toBe(HttpStatusCode.BadRequest);
    }
  });

  test("Should not be able to create a device name that doesn't have any letters", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    for (const deviceName of ["12345", "123-34"]) {
      const response = await TestApiImpl.Devices.registerDevice(
        projectHandle.testId,
        deviceName,
        "password",
      );
      expect(response.success, `registering device '${deviceName}' failed`).toBe(false);
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
  });

  test("Should be able to create a device name that has -, _, and spaces in it", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    for (const deviceName of ["funny device1", "funny-device2", "funny_device3"]) {
      await addDeviceToProject(deviceName, projectHandle);
    }
  });

  test("Shouldn't be able to create a device name that starts with -, _, or a space", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    for (const deviceName of [" device1", "-device2", "_device3"]) {
      const response = await TestApiImpl.Devices.registerDevice(
        projectHandle.testId,
        deviceName,
        "password",
      );
      expect(response.success, `registering device '${deviceName}' failed`).toBe(false);
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
  });

  test("If not specified on register saltId = deviceId", async () => {
    const { getOwner, getDevice, projectHandle } = await createProjectWithUserAndDevice();
    const device = getDevice();
    const response = await TestApiImpl.Devices.withAuth(getOwner().testId).getDeviceInProject(
      device.testId,
      projectHandle.testId,
    );
    expect(response.success, "project admin can get device in project").toBe(true);
    if (response.success) {
      expect(response.result.device).toMatchObject({
        deviceName: device.testId,
        groupName: projectHandle.testId,
        saltId: device.id,
        id: device.id,
        groupId: projectHandle.id,
        type: DeviceType.Thermal,
        active: true,
        admin: true,
        isHealthy: false,
      });
    }
  });

  test("When registering a device must specify a valid password", async () => {
    const { projectHandle } = await createProjectWithUserAndDevice();
    const badPasswords = [
      ["", "blank"],
      [" ", "space"],
      ["1234567", "fewer than 8 characters"],
    ];
    for (const [password, description] of badPasswords) {
      const response = await TestApiImpl.Devices.registerDevice(
        projectHandle.testId,
        getDeviceTestName("badpassword"),
        password,
      );
      expect(response.success, `registering device with ${description} password failed`).toBe(
        false,
      );
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
  });

  test("When registering a device must specify a project that exists", async () => {
    await createProjectWithUserAndDevice();
    const response = await TestApiImpl.Devices.registerDevice(
      getProjectTestName("nonexistent"),
      getDeviceTestName("device4"),
      "password",
    );
    expect(response.success, "registering device in nonexistent project failed").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Forbidden);
  });
});
