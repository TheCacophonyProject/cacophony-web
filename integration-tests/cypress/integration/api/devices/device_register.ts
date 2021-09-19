/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";
import { HTTP_BadRequest, HTTP_Unprocessable } from "../../../commands/constants";

describe("Device register", () => {
  const camsGroup = "cams";
  const otherCams = "other cams";

  const KEEP_DEVICE_NAME = false;
  const GENERATE_UNIQUE_NAME = true;
  const GENERATE_PASSWORD = null;
  const KEEP_SALT_ID = null;
  const LOG = true;

  before(() => {
    cy.testCreateUserGroupAndDevice("Anita", camsGroup, "gotya");
    cy.apiDeviceAdd("defaultcam", camsGroup);
    cy.apiGroupAdd("Anita", otherCams, true);
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
      HTTP_BadRequest
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
      HTTP_Unprocessable
    );
    cy.apiDeviceAdd(
      "123-34",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
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
      HTTP_Unprocessable
    );
    cy.apiDeviceAdd(
      "-device2",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    cy.apiDeviceAdd(
      "_device3",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
  });

  it("If not specified on register saltId = deviceId", () => {
    const expectedDevice = {
      devicename: getTestName("defaultcam"),
      groupname: getTestName(camsGroup),
      saltId: getCreds("defaultcam").id,
    };

    const testDevice = {
      ...expectedDevice
    };
    delete testDevice.saltId;

    //Test with Salt Id = device id by default
    cy.apiDeviceQueryCheck("Anita", [testDevice], null, [expectedDevice]);
  });

  it("Can register a device and specify salt id", () => {
    cy.apiDeviceAdd("specify salt", camsGroup, 9998);
    const expectedDevice = {
      devicename: getTestName("specify salt"),
      groupname: getTestName(camsGroup),
      saltId: 9998,
    };
    const testDevice = {
      ...expectedDevice
    };
    delete testDevice.saltId;
    cy.apiDeviceQueryCheck("Anita", [testDevice], null, [expectedDevice]);
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
      HTTP_Unprocessable
    );
    //not space
    cy.apiDeviceAdd(
      "device5",
      camsGroup,
      KEEP_SALT_ID,
      " ",
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    //not less than 8 chars
    cy.apiDeviceAdd(
      "device6",
      camsGroup,
      KEEP_SALT_ID,
      "1234567",
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
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
      HTTP_BadRequest
    );
  });

  it.skip("Correctly handles missing parameters in register device", () => {
    //TODO: write this (helper apiDeviceAdd does not yet support missing params)
  });
});
