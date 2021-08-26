/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";
import { HTTP_Unprocessable } from "../../../commands/constants";

describe("Device register", () => {
  const camsGroup = "cams";
  const otherCams = "other cams";

  const KEEP_DEVICE_NAME = false;
  const GENERATE_UNIQUE_NAME = true;
  const GENERATE_PASSWORD = null;
  const KEEP_SALT_ID = null;
  const LOG = true;

  before(() => {
    cy.apiCreateUserGroupAndDevice("Anita", camsGroup, "gotya");
    cy.apiCreateDevice("defaultcam", camsGroup);
    cy.apiGroupAdd("Anita", otherCams, true);
  });

  it("group can have multiple devices with a different names", () => {
    cy.apiCreateDevice("Smile", camsGroup);
  });

  it("devices in different groups can have the same names", () => {
    cy.apiCreateDevice("gotya", otherCams);
  });

  it("But cannot create device with same name (even with different case) in the same group", () => {
    cy.apiCreateDevice(
      "GotYa",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      GENERATE_UNIQUE_NAME,
      LOG,
      HTTP_Unprocessable
    );
  });

  it("Should not be able to create a device name that doesn't have any letters", () => {
    cy.apiCreateDevice(
      "12345",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    cy.apiCreateDevice(
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
    cy.apiCreateDevice("funny device1", camsGroup);
    cy.apiCreateDevice("funny-device2", camsGroup);
    cy.apiCreateDevice("funny_device3", camsGroup);
  });

  it("Shouldn't be able to create a device name that starts with -, _, and spaces in it", () => {
    cy.apiCreateDevice(
      " device1",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    cy.apiCreateDevice(
      "-device2",
      camsGroup,
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    cy.apiCreateDevice(
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

    //Test with Salt Id = device id by default
    cy.apiCheckDevicesQuery("Anita", [expectedDevice], null, [expectedDevice]);
  });

  it("Can register a device and specify salt id", () => {
    cy.apiCreateDevice("specify salt", camsGroup, 9998);
    const expectedDevice = {
      devicename: getTestName("specify salt"),
      groupname: getTestName(camsGroup),
      saltId: 9998,
    };
    cy.apiCheckDevicesQuery("Anita", [expectedDevice], null, [expectedDevice]);
  });

  it("When registering a device must specify a valid password", () => {
    //not blank
    cy.apiCreateDevice(
      "device4",
      camsGroup,
      KEEP_SALT_ID,
      "",
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    //not space
    cy.apiCreateDevice(
      "device5",
      camsGroup,
      KEEP_SALT_ID,
      " ",
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
    //not less than 8 chars
    cy.apiCreateDevice(
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
    cy.apiCreateDevice(
      "device4",
      "nonexitant group",
      KEEP_SALT_ID,
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      LOG,
      HTTP_Unprocessable
    );
  });

  it.skip("Correctly handles missing parameters in register device", () => {
    //TODO: write this (helper apiCreateDevice does not yet support missing params)
  });
});
