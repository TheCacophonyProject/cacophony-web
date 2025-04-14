import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { DeviceHistoryEntry } from "@commands/types";
import { TestCreateExpectedHistoryEntry } from "@commands/api/device";

import { NOT_NULL_STRING } from "@commands/constants";
import { DeviceType, HttpStatusCode } from "@typedefs/api/consts";

describe("Device register", () => {
  const camsGroup = "cams";
  const otherCams = "other cams";
  const adminUser = "Anita";

  const KEEP_DEVICE_NAME = false;
  const GENERATE_UNIQUE_NAME = true;
  const GENERATE_PASSWORD = null;
  const KEEP_SALT_ID = null;
  const LOG = true;

  before(() => {
    cy.testCreateUserGroupAndDevice(adminUser, camsGroup, "gotya");
    cy.apiDeviceAdd("defaultcam", camsGroup);
    cy.apiGroupAdd(adminUser, otherCams, true);
  });

  it("Adding device created valid deviceHistory entry", () => {
    cy.apiDeviceAdd("aNewDevice", camsGroup, 1234567).then(() => {
      const expectedHistory: DeviceHistoryEntry =
        TestCreateExpectedHistoryEntry(
          "aNewDevice",
          camsGroup,
          NOT_NULL_STRING,
          null,
          "register",
          null
        );
      expectedHistory.saltId = 1234567;

      cy.apiDeviceHistoryCheck(adminUser, "aNewDevice", [expectedHistory]);
    });
  });

  it("group can have multiple devices with a different names", () => {
    cy.apiDeviceAdd("Smile", camsGroup);
  });

  it("devices in different groups can have the same names", () => {
    cy.apiDeviceAdd("gotya", otherCams);
  });

  it("But cannot create device with same name (even with different case) in the same group", () => {
    cy.apiDeviceAdd(
      "GotYa",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      GENERATE_UNIQUE_NAME,
      LOG,
      HttpStatusCode.BadRequest
    );
    cy.apiDeviceAdd(
      "gotya",
      otherCams,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      GENERATE_UNIQUE_NAME,
      LOG,
      HttpStatusCode.BadRequest
    );
  });

  it("Should not be able to create a device name that doesn't have any letters", () => {
    cy.apiDeviceAdd(
      "12345",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
    cy.apiDeviceAdd(
      "123-34",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
  });

  it("Should be able to create a device name that has -, _, and spaces in it", () => {
    cy.apiDeviceAdd("funny device1", camsGroup);
    cy.apiDeviceAdd("funny-device2", camsGroup);
    cy.apiDeviceAdd("funny_device3", camsGroup);
  });

  it("Shouldn't be able to create a device name that starts with -, _, and spaces in it", () => {
    cy.apiDeviceAdd(
      " device1",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
    cy.apiDeviceAdd(
      "-device2",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
    cy.apiDeviceAdd(
      "_device3",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
  });

  it("If not specified on register saltId = deviceId", () => {
    const expectedDevice = {
      deviceName: getTestName("defaultcam"),
      groupName: getTestName(camsGroup),
      saltId: getCreds("defaultcam").id,
      id: getCreds("defaultcam").id,
      groupId: getCreds(camsGroup).id,
      type: DeviceType.Unknown,
      active: true,
      admin: true,
      isHealthy: false,
    };

    //Test with Salt Id = device id by default
    cy.apiDeviceInGroupCheck(
      adminUser,
      "defaultcam",
      camsGroup,
      null,
      expectedDevice,
      null,
      HttpStatusCode.Ok
    );
  });

  it("When registering a device must specify a valid password", () => {
    //not blank
    cy.apiDeviceAdd(
      "device4",
      camsGroup,
      KEEP_SALT_ID,
      "",
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
    //not space
    cy.apiDeviceAdd(
      "device5",
      camsGroup,
      KEEP_SALT_ID,
      " ",
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
    //not less than 8 chars
    cy.apiDeviceAdd(
      "device6",
      camsGroup,
      KEEP_SALT_ID,
      "1234567",
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Unprocessable
    );
  });

  it("When registering a device must specify a group that exists", () => {
    cy.apiDeviceAdd(
      "device4",
      "nonexistent group",
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HttpStatusCode.Forbidden
    );
  });
});
