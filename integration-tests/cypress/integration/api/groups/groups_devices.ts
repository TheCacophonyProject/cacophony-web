/// <reference path="../../../support/index.d.ts" />

import { ApiGroupsDevice, ApiDevicesDevice } from "../../../commands/types";
import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

import { HTTP_OK200 } from "../../../commands/constants";
import { HTTP_Forbidden } from "../../../commands/constants";
import { HTTP_Unprocessable } from "../../../commands/constants";

const ADMIN = true;
const NOT_ADMIN = false;
let expectedDevice: ApiGroupsDevice;
let expectedDevice1b: ApiGroupsDevice;

describe("Groups - get devices for group", () => {
  before(() => {
    //admin user, group and device
    cy.testCreateUserGroupAndDevice("gdGroupAdmin", "gdGroup", "gdCamera").then(
      () => {
        expectedDevice = {
          id: getCreds("gdCamera").id,
          deviceName: getTestName("gdCamera"),
        };
      }
    );

    //2nd group
    cy.apiGroupAdd("gdGroupAdmin", "gdGroup2").then(() => {});

    //2nd device in first group
    cy.apiDeviceAdd("gdCamera1b", "gdGroup").then(() => {
      expectedDevice1b = {
        id: getCreds("gdCamera1b").id,
        deviceName: getTestName("gdCamera1b"),
      };
    });

    //group member for this group
    cy.apiUserAdd("gdGroupMember");
    cy.apiGroupUserAdd("gdGroupAdmin", "gdGroupMember", "gdGroup", NOT_ADMIN);

    //device admin for 1st device
    cy.apiUserAdd("gdDeviceAdmin");
    cy.apiDeviceUserAdd("gdGroupAdmin", "gdDeviceAdmin", "gdCamera", ADMIN);

    // test users
    cy.apiUserAdd("gdTestUser");
  });

  it("Admin and member can view group's devices", () => {
    cy.log("Check admin can view group's device");
    cy.apiGroupDevicesCheck("gdGroupAdmin", "gdGroup", [
      expectedDevice,
      expectedDevice1b,
    ]);

    cy.log("Check member can view group's devices");
    cy.apiGroupDevicesCheck("gdGroupMember", "gdGroup", [
      expectedDevice,
      expectedDevice1b,
    ]);
  });

  it("Non group members cannot view devices", () => {
    cy.log("Check device-only user cannot view groups devies");
    cy.apiGroupDevicesCheck("gdDeviceAdmin", "gdGroup", [], [], HTTP_Forbidden);

    cy.log("Check unrelated user cannot view group's devices");
    cy.apiGroupDevicesCheck("gdTestUser", "gdGroup", [], [], HTTP_Forbidden);
  });

  it("Can query using group id", () => {
    cy.log("Check admin can view group's device");
    cy.apiGroupDevicesCheck(
      "gdGroupAdmin",
      getCreds("gdGroup").id,
      [expectedDevice, expectedDevice1b],
      [],
      HTTP_OK200,
      { useRawGroupName: true }
    );

    cy.log("Check member can view group's devices");
    cy.apiGroupDevicesCheck(
      "gdGroupMember",
      getCreds("gdGroup").id,
      [expectedDevice, expectedDevice1b],
      [],
      HTTP_OK200,
      { useRawGroupName: true }
    );
  });

  it("Lists only active devices", () => {
    let expectedDevice4a: ApiDevicesDevice;
    let expectedDevice4b: ApiDevicesDevice;
    let expectedGroupDevice4b: ApiGroupsDevice;

    cy.log("Register a camera for the test");
    cy.testCreateUserAndGroup("gdUser4", "gdGroup4");
    cy.apiDeviceAdd("gdCam4a", "gdGroup4").then(() => {
      expectedDevice4a = {
        id: getCreds("gdCam4a").id,
        devicename: getTestName("gdCam4a"),
        active: false,
        Users: [],
      };
    });

    cy.log("Reregister the camera, making the old camera inactive");
    cy.apiDeviceReregister("gdCam4a", "gdCam4b", "gdGroup4").then(() => {
      expectedGroupDevice4b = {
        id: getCreds("gdCam4b").id,
        deviceName: getTestName("gdCam4b"),
      };
      expectedDevice4b = {
        id: getCreds("gdCam4b").id,
        devicename: getTestName("gdCam4b"),
        active: true,
        Users: [],
      };

      cy.log(
        "Verify device query shows both old device as inactive (and new one as active)"
      );
      cy.apiDevicesCheck("gdUser4", [expectedDevice4a, expectedDevice4b], {
        onlyActive: false,
      });

      cy.log("But verify groups query only shows active device");
      cy.apiGroupDevicesCheck("gdUser4", "gdGroup4", [expectedGroupDevice4b]);
    });
  });

  it("Handles non-existant group correctly", () => {
    cy.apiGroupDevicesCheck(
      "gdUser4",
      "IDoNotExist",
      [],
      [],
      HTTP_Unprocessable,
      { useRawGroupName: true }
    );
  });

  it("Handles group with no devices correctly", () => {
    cy.testCreateUserAndGroup("gdUser6", "gdGroup6").then(() => {
      cy.apiGroupDevicesCheck("gdUser6", "gdGroup6", []);
    });
  });
});
