/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

describe("Device register", () => {
  const camsGroup = "cams";
  const otherCams = "other cams";

  const KEEP_DEVICE_NAME = false;
  const GENERATE_PASSWORD = false;

  before(() => {
    cy.apiCreateUserGroupAndCamera("Anita", camsGroup, "gotya");
    cy.apiCreateCamera("defaultcam", camsGroup);
    cy.apiCreateGroup("Anita", otherCams, true);
  });

  it("group can have multiple devices with a different names", () => {
    cy.apiCreateCamera("Smile", camsGroup);
  });

  it("devices in different groups can have the same names", () => {
    cy.apiCreateCamera("gotya", otherCams);
  });

  it("But cannot create device with same name (even with different case) in the same group", () => {
    cy.apiShouldFailToCreateCamera("GotYa", camsGroup);
  });

  it("Should not be able to create a device name that doesn't have any letters", () => {
    cy.apiShouldFailToCreateCamera("12345", camsGroup, GENERATE_PASSWORD, KEEP_DEVICE_NAME);
    cy.apiShouldFailToCreateCamera("123-34", camsGroup, GENERATE_PASSWORD, KEEP_DEVICE_NAME);
  });

  it("Should be able to create a device name that has -, _, and spaces in it", () => {
    cy.apiCreateCamera("funny device1", camsGroup);
    cy.apiCreateCamera("funny-device2", camsGroup);
    cy.apiCreateCamera("funny_device3", camsGroup);
  });

  it("Shouldn't be able to create a device name that starts with -, _, and spaces in it", () => {
    cy.apiShouldFailToCreateCamera(" device1", camsGroup, GENERATE_PASSWORD, KEEP_DEVICE_NAME);
    cy.apiShouldFailToCreateCamera("-device2", camsGroup, GENERATE_PASSWORD, KEEP_DEVICE_NAME);
    cy.apiShouldFailToCreateCamera("_device3", camsGroup, GENERATE_PASSWORD, KEEP_DEVICE_NAME);
  });

  it("If not specified on register saltId = deviceId", () => {
    const expectedDevice={"devicename": getTestName("defaultcam"), "groupname": getTestName(camsGroup), "saltId":getCreds("defaultcam").id};

    //Test with Salt Id = device id by default
    cy.apiCheckDevicesQuery("Anita", [expectedDevice], null, [expectedDevice]);
  });

  it("Can register a device and specify salt id", () => {
    cy.apiCreateCamera("specify salt", camsGroup, 9998);
    const expectedDevice={"devicename": getTestName("specify salt"), "groupname": getTestName(camsGroup), "saltId":9998};
    cy.apiCheckDevicesQuery("Anita", [expectedDevice], null, [expectedDevice]);
  });

  it("When registering a device must specify a valid password", () => {
    //not blank
    cy.apiShouldFailToCreateCamera("device4", camsGroup, "", KEEP_DEVICE_NAME);
    //not space
    cy.apiShouldFailToCreateCamera("device5", camsGroup, " ", KEEP_DEVICE_NAME);
    //not less than 8 chars
    cy.apiShouldFailToCreateCamera("device6", camsGroup, "1234567", KEEP_DEVICE_NAME);
  });

  it("When registering a device must specify a group that exists", () => {
    cy.apiShouldFailToCreateCamera("device4", "nonexitant group", GENERATE_PASSWORD, KEEP_DEVICE_NAME);
  });

  it.skip("Correctly handles missing parameters in register device", () => {
    //TODO: write this (helper apiCreateCamera does not yet support missing params)
  });

});
