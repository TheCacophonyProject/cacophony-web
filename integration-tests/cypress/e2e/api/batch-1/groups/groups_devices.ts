import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";

import { NOT_NULL_STRING } from "@commands/constants";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import {
  DeviceType,
  HttpStatusCode,
  RecordingType,
} from "@typedefs/api/consts";

describe("Groups - get devices for group", () => {
  const NOT_ADMIN = false;
  let expectedDevice: ApiDeviceResponse;
  let expectedDevice1b: ApiDeviceResponse;

  before(() => {
    //admin user, group and device
    cy.testCreateUserGroupAndDevice("gdGroupAdmin", "gdGroup", "gdCamera").then(
      () => {
        expectedDevice = {
          id: getCreds("gdCamera").id,
          deviceName: getTestName("gdCamera"),
          saltId: getCreds("gdCamera").id,
          groupName: getTestName("gdGroup"),
          groupId: getCreds("gdGroup").id,
          active: true,
          admin: true,
          type: DeviceType.Unknown,
          isHealthy: false,
        };
      },
    );

    //2nd group
    cy.apiGroupAdd("gdGroupAdmin", "gdGroup2").then(() => {});

    //2nd device in first group
    cy.apiDeviceAdd("gdCamera1b", "gdGroup").then(() => {
      expectedDevice1b = {
        id: getCreds("gdCamera1b").id,
        deviceName: getTestName("gdCamera1b"),
        saltId: getCreds("gdCamera1b").id,
        groupName: getTestName("gdGroup"),
        groupId: getCreds("gdGroup").id,
        active: true,
        admin: true,
        type: DeviceType.Unknown,
        isHealthy: false,
      };
    });

    //group member for this group
    cy.apiUserAdd("gdGroupMember");
    cy.apiGroupUserAdd("gdGroupAdmin", "gdGroupMember", "gdGroup", NOT_ADMIN);

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
      { ...expectedDevice, admin: false },
      { ...expectedDevice1b, admin: false },
    ]);
  });

  it("Non group members cannot view devices", () => {
    cy.log("Check unrelated user cannot view group's devices");
    cy.apiGroupDevicesCheck(
      "gdTestUser",
      "gdGroup",
      [],
      [],
      HttpStatusCode.Forbidden,
    );
  });

  it("Can query using group id", () => {
    cy.log("Check admin can view group's device");
    cy.apiGroupDevicesCheck(
      "gdGroupAdmin",
      getCreds("gdGroup").id,
      [expectedDevice, expectedDevice1b],
      [],
      HttpStatusCode.Ok,
      { useRawGroupName: true },
    );

    cy.log("Check member can view group's devices");
    cy.apiGroupDevicesCheck(
      "gdGroupMember",
      getCreds("gdGroup").id,
      [
        { ...expectedDevice, admin: false },
        { ...expectedDevice1b, admin: false },
      ],
      [],
      HttpStatusCode.Ok,
      { useRawGroupName: true },
    );
  });

  it("Lists only active devices", () => {
    let expectedDevice4a: ApiDeviceResponse;
    let expectedDevice4b: ApiDeviceResponse;
    let expectedGroupDevice4b: ApiDeviceResponse;

    cy.log("Register a camera for the test");
    cy.testCreateUserAndGroup("gdUser4", "gdGroup4");
    cy.apiDeviceAdd("gdCam4a", "gdGroup4").then(() => {
      expectedDevice4a = {
        id: getCreds("gdCam4a").id,
        deviceName: getTestName("gdCam4a"),
        saltId: getCreds("gdCam4a").id,
        groupName: getTestName("gdGroup4"),
        groupId: getCreds("gdGroup4").id,
        active: false,
        admin: true,
        type: DeviceType.Unknown,
        isHealthy: true,
      };
    });

    cy.log("Reregister the camera, making the old camera inactive");
    cy.apiRecordingAdd(
      "gdCam4a",
      { type: RecordingType.ThermalRaw },
      "oneframe.cptv",
      "raRecording1",
    );
    cy.apiDeviceReregister("gdCam4a", "gdCam4b", "gdGroup4").then(() => {
      expectedGroupDevice4b = {
        id: getCreds("gdCam4b").id,
        deviceName: getTestName("gdCam4b"),
        saltId: getCreds("gdCam4a").id,
        groupName: getTestName("gdGroup4"),
        groupId: getCreds("gdGroup4").id,
        active: true,
        admin: true,
        type: DeviceType.Thermal,
        lastConnectionTime: NOT_NULL_STRING,
        isHealthy: true,
      };
      expectedDevice4b = {
        id: getCreds("gdCam4b").id,
        deviceName: getTestName("gdCam4b"),
        saltId: getCreds("gdCam4a").id,
        groupName: getTestName("gdGroup4"),
        groupId: getCreds("gdGroup4").id,
        active: true,
        admin: true,
        type: DeviceType.Thermal,
        lastConnectionTime: NOT_NULL_STRING,
        isHealthy: true,
      };

      cy.log(
        "Verify device query shows both old device as inactive (and new one as active)",
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
      HttpStatusCode.Forbidden,
      {
        useRawGroupName: true,
      },
    );
  });

  it("Handles group with no devices correctly", () => {
    cy.testCreateUserAndGroup("gdUser6", "gdGroup6").then(() => {
      cy.apiGroupDevicesCheck("gdUser6", "gdGroup6", []);
    });
  });
});
