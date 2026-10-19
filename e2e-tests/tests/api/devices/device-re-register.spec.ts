import { expect, test } from "@/helpers/upload-tests";
import {
  addDeviceToProject,
  createProject,
  createProjectWithUserAndDevice,
  createUser,
  getDeviceTestName,
  getProjectTestName,
} from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { TestApiImpl } from "@shared/client";
import { JwtToken, TestDeviceHandle, TestUserHandle } from "@shared/client/types";
import { ProjectId, UserId } from "@shared/api/common";
import { DeviceType, HttpStatusCode } from "@shared/api/consts";
import { ApiRecordingResponse } from "@shared/api/recording";
import { addSeconds } from "@/helpers/date-helpers";
import { DeviceSim } from "@/helpers/device-sim";

// Attempts to re-register `device` into `project`, authenticated as the device itself (`/devices/reregister`),
// with the given new name and password.
// Registers credentials for the new device under `newName` on success.
const reRegister = async (
  device: TestDeviceHandle,
  project: ProjectId | string,
  newName: string,
  newPassword: string = "password",
) => {
  const response = await TestApiImpl.Devices.withAuth(
    device.testId,
  ).reRegisterDeviceWithoutAuthorization(project, newName, newPassword);
  if (response.success) {
    TestApiImpl.registerCredentials(newName, response.result);
  }
  return response;
};

// Attempts to re-register `device` as the device itself, authorized by `authorizingUser` (`/devices/reregister-authorized`).
// This is the flow used by the Sidekick app (via the device's management interface) to move a device between projects.
// Both `newName` and `project` are optional, but at least one must be given.
// Registers credentials for the new device under `newName` (or the device's current name) on success.
const reRegisterAuthorized = async (
  authorizingUser: TestUserHandle,
  device: TestDeviceHandle,
  project?: ProjectId | string,
  newName?: string,
  newPassword: string = "password",
) => {
  const userCreds = (await TestApiImpl.getCredentials(authorizingUser.testId)) as JwtToken<UserId>;
  const response = await TestApiImpl.Devices.withAuth(
    device.testId,
  ).reRegisterDeviceWithAdminAuthorization(userCreds, project, undefined, newName, newPassword);
  if (response.success) {
    TestApiImpl.registerCredentials(newName ?? device.testId, response.result);
  }
  return response;
};

const createProjectBundleWithInitialRecording = async (
  oneFrameCptv: ArrayBuffer,
  nameBase: string = "Test",
) => {
  const project = await createProjectWithUserAndDevice({ nameBase });
  // Re-registering only keeps the old (now inactive) device around if it has recordings, so give it one.
  await uploadThermalRecordingFromDevice({
    file: oneFrameCptv,
    location: { lat: -42, lng: 170 },
    deviceHandle: project.getDevice(),
    recordingDateTime: new Date(),
  });
  return project;
};

const getActiveDevicesForUser = async (user: TestUserHandle) => {
  const response = await TestApiImpl.Devices.withAuth(user.testId).getActiveDevicesForCurrentUser();
  expect(response, "fetched active devices").toBeTruthy();
  return response || [];
};

test.describe("Device re-register", () => {
  test("Can re-register a device in same group with different name", async ({ oneFrameCptv }) => {
    const { getOwner, getDevice, projectHandle } =
      await createProjectBundleWithInitialRecording(oneFrameCptv);
    const device = getDevice();
    const newName = getDeviceTestName("renamed");

    const response = await reRegister(device, projectHandle.id, newName);
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }
    const newDeviceId = response.result.id;

    const activeDevices = await getActiveDevicesForUser(getOwner());
    expect(activeDevices, "only the new device is active").toHaveLength(1);
    expect(activeDevices[0]).toMatchObject({
      id: newDeviceId,
      saltId: device.id,
      deviceName: newName,
      active: true,
      admin: true,
      type: DeviceType.Thermal,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
    });

    const oldDevice = await TestApiImpl.Devices.withAuth(getOwner().testId).getDeviceById(
      device.id,
    );
    expect(oldDevice, "old device is still listed when including inactive").toBeTruthy();
    expect(oldDevice).toMatchObject({
      id: device.id,
      saltId: device.id,
      deviceName: device.testId,
      active: false,
      admin: true,
      type: DeviceType.Thermal,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
    });
  });

  test("Re-registering device creates valid deviceHistory entry", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const AdminUser = project.api();
    const device = await addDeviceToProject("history", projectHandle, undefined, false, 1234567);
    const newName = getDeviceTestName("history2");

    const response = await reRegister(device, projectHandle.id, newName);
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }

    const history = await AdminUser.Devices.getDeviceHistoryInTest(response.result.id);
    expect(history, "device history was fetched").toBeTruthy();
    if (history) {
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        DeviceId: response.result.id,
        GroupId: projectHandle.id,
        deviceName: newName,
        location: null,
        saltId: 1234567,
        setBy: "re-register",
        stationId: null,
        settings: null,
      });
      expect(history[0].fromDateTime).toBeTruthy();
      expect(history[0].uuid).toBeTruthy();
    }
  });

  test("Can re-register a device in new group with same name", async ({ oneFrameCptv }) => {
    const project = await createProjectBundleWithInitialRecording(oneFrameCptv);
    const projectHandle = project.projectHandle;
    const AdminUser = project.api();
    const device = project.getDevice();
    const otherOwner = await createUser("other");
    const otherProject = await createProject("other", otherOwner);

    const response = await reRegister(device, otherProject.id, device.testId);
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }

    const activeDevices = await getActiveDevicesForUser(otherOwner);
    expect(activeDevices, "new device is listed in the 2nd group").toHaveLength(1);
    expect(activeDevices[0]).toMatchObject({
      id: response.result.id,
      saltId: device.id,
      deviceName: device.testId,
      active: true,
      admin: true,
      type: DeviceType.Thermal,
      groupName: otherProject.testId,
      groupId: otherProject.id,
    });

    const oldDevice = await AdminUser.Devices.getDeviceById(device.id);
    expect(oldDevice, "old device is listed in the 1st group as inactive").toMatchObject({
      id: device.id,
      saltId: device.id,
      deviceName: device.testId,
      active: false,
      admin: true,
      type: DeviceType.Thermal,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
    });
  });

  test("Re-register a device in different group with different name", async ({ oneFrameCptv }) => {
    const project = await createProjectBundleWithInitialRecording(oneFrameCptv);
    const projectHandle = project.projectHandle;
    const AdminUser = project.api();
    const device = project.getDevice();
    const otherOwner = await createUser("other");
    const otherProject = await createProject("other", otherOwner);
    const newName = getDeviceTestName("moved");

    const response = await reRegister(device, otherProject.id, newName);
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }

    const activeDevices = await getActiveDevicesForUser(otherOwner);
    expect(activeDevices, "new device is listed in the 2nd group").toHaveLength(1);
    expect(activeDevices[0]).toMatchObject({
      id: response.result.id,
      saltId: device.id,
      deviceName: newName,
      active: true,
      admin: true,
      type: DeviceType.Thermal,
      groupName: otherProject.testId,
      groupId: otherProject.id,
    });

    const oldDevice = await AdminUser.Devices.getDeviceById(device.id);
    expect(oldDevice, "old device is listed in the 1st group as inactive").toMatchObject({
      id: device.id,
      deviceName: device.testId,
      active: false,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
    });
  });

  test("Cannot re-register a device in same group with same name as another device", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const device = project.getDevice();
    const otherDevice = await addDeviceToProject("other", projectHandle);

    const response = await reRegister(device, projectHandle.id, otherDevice.testId);
    expect(response.success, "re-registering with a duplicate name failed").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Unprocessable);

    const activeDevices = await getActiveDevicesForUser(project.getAdminUser());
    expect(activeDevices.map(({ id }) => id).sort(), "both devices are unaltered").toEqual(
      [device.id, otherDevice.id].sort(),
    );
    expect(activeDevices.find(({ id }) => id === device.id)).toMatchObject({
      deviceName: device.testId,
      saltId: device.id,
      active: true,
      groupId: projectHandle.id,
    });
  });

  test("Should not be able to create a device name that doesn't have any letters", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    for (const deviceName of ["12345", "1234-678"]) {
      const response = await reRegister(project.getDevice(), projectHandle.id, deviceName);
      expect(response.success, `re-registering device as '${deviceName}' failed`).toBe(false);
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
  });

  test("Should be able to create a device name that has -, _, and spaces in it", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    let device: TestDeviceHandle = project.getDevice();
    for (const deviceName of ["funny device1", "funny-device1", "funny_device1"]) {
      const newName = getDeviceTestName(deviceName);
      const response = await reRegister(device, projectHandle.id, newName);
      expect(response.success, `re-registering device as '${newName}'`).toBe(true);
      if (!response.success) {
        return;
      }
      device = { id: response.result.id, testId: newName, type: "device" };
    }
  });

  test("Shouldn't be able to create a device name that starts with -, _, or a space", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    for (const deviceName of [" device1", "-device1", "_device1"]) {
      const response = await reRegister(project.getDevice(), projectHandle.id, deviceName);
      expect(response.success, `re-registering device as '${deviceName}' failed`).toBe(false);
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
  });

  test("Re-registered device can keep default salt id", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const device = project.getDevice();
    const newName = getDeviceTestName("renamed");

    const response = await reRegister(device, projectHandle.id, newName);
    expect(response.success, "re-register device").toBe(true);

    const activeDevices = await getActiveDevicesForUser(project.getAdminUser());
    expect(activeDevices, "only the new device is active").toHaveLength(1);
    expect(activeDevices[0]).toMatchObject({
      deviceName: newName,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
      saltId: device.id,
      admin: true,
      active: true,
      type: DeviceType.Thermal,
    });
  });

  test("Re-registered device can keep specified salt id", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const device = await addDeviceToProject("specify salt", projectHandle, undefined, false, 9997);
    const newName = getDeviceTestName("specify salt2");

    const response = await reRegister(device, projectHandle.id, newName);
    expect(response.success, "re-register device").toBe(true);

    const activeDevices = await getActiveDevicesForUser(project.getAdminUser());
    expect(activeDevices.find(({ deviceName }) => deviceName === newName)).toMatchObject({
      deviceName: newName,
      active: true,
      admin: true,
      saltId: 9997,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
      type: DeviceType.Thermal,
    });
  });

  test("When re-registering a device cannot specify an invalid password", async () => {
    const project = await createProjectWithUserAndDevice();
    const device = project.getDevice();
    const projectHandle = project.projectHandle;
    const badPasswords = [
      ["", "blank"],
      [" ", "space"],
      ["1234567", "fewer than 8 characters"],
    ];
    for (const [password, description] of badPasswords) {
      const response = await reRegister(
        device,
        projectHandle.id,
        getDeviceTestName("badpassword"),
        password,
      );
      expect(response.success, `re-registering device with ${description} password failed`).toBe(
        false,
      );
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
  });

  test("When re-registering a device must specify a group that exists", async () => {
    const project = await createProjectWithUserAndDevice();
    const response = await reRegister(
      project.getDevice(),
      getProjectTestName("nonexistent"),
      getDeviceTestName("valid_name"),
    );
    expect(response.success, "re-registering into nonexistent project failed").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Forbidden);
  });
});

test.describe("Device re-register (user authorized)", () => {
  test("Admin of both projects can move a device to another project, keeping its name", async () => {
    const project = await createProjectWithUserAndDevice();
    const adminUser = project.getAdminUser();
    const projectHandle = project.projectHandle;
    const AdminUser = project.api();
    const device = project.getDevice();
    const otherProject = await createProject("other", adminUser);

    const response = await reRegisterAuthorized(adminUser, device, otherProject.id);
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }

    const newDevice = await AdminUser.Devices.getDeviceById(response.result.id);
    expect(newDevice, "device is active in the destination project").toMatchObject({
      id: response.result.id,
      saltId: device.id,
      deviceName: device.testId,
      active: true,
      groupName: otherProject.testId,
      groupId: otherProject.id,
    });
    expect(response.result.id, "a new device was created").not.toEqual(device.id);

    const oldDevice = await AdminUser.Devices.getDeviceById(device.id);
    expect(oldDevice, "old device is inactive in the source project").toMatchObject({
      id: device.id,
      active: false,
      groupName: projectHandle.testId,
      groupId: projectHandle.id,
    });

    const history = await AdminUser.Devices.getDeviceHistoryInTest(response.result.id);
    expect(history, "device history was fetched").toBeTruthy();
    expect(history && history[0]).toMatchObject({
      DeviceId: response.result.id,
      GroupId: otherProject.id,
      deviceName: device.testId,
      saltId: device.id,
      setBy: "re-register",
    });
  });

  test("Moving a device back to a project it was previously in reactivates the original device", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const adminUser = project.getAdminUser();
    const AdminUser = project.api();
    const originalDevice = project.getDevice();
    const otherProject = await createProject("other", adminUser);

    const moved = await reRegisterAuthorized(adminUser, originalDevice, otherProject.id);
    expect(moved.success, "move device to other project").toBe(true);
    if (!moved.success) {
      return;
    }
    const movedDevice: TestDeviceHandle = {
      id: moved.result.id,
      testId: originalDevice.testId,
      type: "device",
    };

    const movedBack = await reRegisterAuthorized(adminUser, movedDevice, projectHandle.id);
    expect(movedBack.success, "move device back to original project").toBe(true);
    if (!movedBack.success) {
      return;
    }
    expect(movedBack.result.id, "device became its original self again").toEqual(originalDevice.id);

    const devices = await getActiveDevicesForUser(adminUser);
    expect(devices.map(({ id }) => id)).toEqual([originalDevice.id]);
    expect(devices[0]).toMatchObject({
      deviceName: originalDevice.testId,
      active: true,
      groupId: projectHandle.id,
    });

    const intermediateDevice = await AdminUser.Devices.getDeviceById(movedDevice.id);
    expect(intermediateDevice, "device in the other project is now inactive").toMatchObject({
      active: false,
      groupId: otherProject.id,
    });
  });

  test("Re-registering within the same project with the name of an existing device takes over that device", async () => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const adminUser = project.getAdminUser();
    const device = project.getDevice();
    const otherDevice = await addDeviceToProject("other", projectHandle);

    const response = await reRegisterAuthorized(
      adminUser,
      device,
      projectHandle.id,
      otherDevice.testId,
    );
    expect(response.success, "re-register device").toBe(true);
    if (response.success) {
      expect(response.result.id, "became the device with the conflicting name").toEqual(
        otherDevice.id,
      );
    }
  });

  test("Taking over an existing device in the same project transfers the old device's recordings, events and history", async ({
    oneFrameCptv,
  }) => {
    const project = await createProjectWithUserAndDevice();
    const projectHandle = project.projectHandle;
    const adminUser = project.getAdminUser();
    const AdminUser = project.api();
    const device = project.getDevice();
    const otherDevice = await addDeviceToProject("other", projectHandle);

    const recordingId = await uploadThermalRecordingFromDevice({
      file: oneFrameCptv,
      location: { lat: -42, lng: 170 },
      deviceHandle: device,
      recordingDateTime: new Date(),
    });
    const eventTime = new Date();
    const deviceSim = new DeviceSim(device);
    deviceSim.addEvent({ type: "rpi-power-on" }, eventTime);
    await deviceSim.uploadEvents(addSeconds(eventTime, 30));

    const response = await reRegisterAuthorized(
      adminUser,
      device,
      projectHandle.id,
      otherDevice.testId,
    );
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }
    expect(response.result.id, "became the device with the conflicting name").toEqual(
      otherDevice.id,
    );

    const recordings = (await AdminUser.Recordings.getRecordingsForDeviceInProject(
      otherDevice.id,
      projectHandle.id,
    )) as ApiRecordingResponse[];
    expect(
      recordings.map(({ id }) => id),
      "recording moved to the taken-over device",
    ).toEqual([recordingId]);
    expect(recordings[0].deviceId).toEqual(otherDevice.id);

    const events = await AdminUser.Devices.getLatestEventsByDeviceId(otherDevice.id, {
      type: "rpi-power-on",
    });
    expect(events.success, "fetched events").toBe(true);
    if (events.success) {
      expect(events.result.rows, "event moved to the taken-over device").toHaveLength(1);
    }

    const history = await AdminUser.Devices.getDeviceHistoryInTest(otherDevice.id);
    expect(history, "device history was fetched").toBeTruthy();
    expect(
      (history || []).filter(({ setBy }) => setBy === "register"),
      "history of both the old and taken-over device is kept",
    ).toHaveLength(2);
    const reRegisterEntries = (history || []).filter(({ setBy }) => setBy === "re-register");
    expect(reRegisterEntries, "a re-register history entry was created").toHaveLength(1);
    expect(reRegisterEntries[0]).toMatchObject({
      DeviceId: otherDevice.id,
      GroupId: projectHandle.id,
      deviceName: otherDevice.testId,
    });

    const devices = await getActiveDevicesForUser(adminUser);
    expect(
      devices.map(({ id }) => id),
      "old device was removed",
    ).toEqual([otherDevice.id]);
  });

  test("Re-registering within the same project with a new name creates a new device and deactivates the old one", async () => {
    const project = await createProjectWithUserAndDevice();
    const device = project.getDevice();
    const projectHandle = project.projectHandle;
    const adminUser = project.getAdminUser();
    const newName = getDeviceTestName("renamed");
    const response = await reRegisterAuthorized(adminUser, device, undefined, newName);
    expect(response.success, "re-register device").toBe(true);
    if (!response.success) {
      return;
    }

    const devices = await getActiveDevicesForUser(adminUser);
    expect(devices.map(({ id }) => id)).toEqual([response.result.id]);
    expect(devices[0]).toMatchObject({
      deviceName: newName,
      saltId: device.id,
      groupId: projectHandle.id,
    });
  });

  test("Can move a device to another project if not an admin of the device's current project", async () => {
    const project = await createProjectWithUserAndDevice();
    const otherOwner = await createUser("other");
    const otherProject = await createProject("other", otherOwner);

    const response = await reRegisterAuthorized(otherOwner, project.getDevice(), otherProject.id);
    expect(response.success, "re-registering without admin on the source project succeeded").toBe(
      true,
    );
    expect(response.status).toBe(HttpStatusCode.Ok);
  });

  test("Cannot move a device to a project the authorizing user has no access to", async () => {
    const project = await createProjectWithUserAndDevice();
    const adminUser = project.getAdminUser();
    const device = project.getDevice();
    const otherOwner = await createUser("other");
    const otherProject = await createProject("other", otherOwner);

    const response = await reRegisterAuthorized(adminUser, device, otherProject.id);
    expect(response.success, "re-registering without access to destination project failed").toBe(
      false,
    );
    expect(response.status).toBe(HttpStatusCode.Forbidden);

    const devices = await getActiveDevicesForUser(adminUser);
    expect(devices, "device is unaltered").toHaveLength(1);
    expect(devices[0]).toMatchObject({ active: true, groupId: project.projectHandle.id });
  });

  test("Cannot re-register with an invalid password", async () => {
    const project = await createProjectWithUserAndDevice();
    const adminUser = project.getAdminUser();
    const otherProject = await createProject("other", adminUser);
    for (const password of [" ", "1234567"]) {
      const response = await reRegisterAuthorized(
        adminUser,
        project.getDevice(),
        otherProject.id,
        undefined,
        password,
      );
      expect(response.success, `re-registering with password '${password}' failed`).toBe(false);
      expect(response.status).toBe(HttpStatusCode.Unprocessable);
    }
    const devices = await getActiveDevicesForUser(adminUser);
    expect(devices.find(({ groupId }) => groupId === project.projectHandle.id)).toMatchObject({
      active: true,
    });
  });
});
