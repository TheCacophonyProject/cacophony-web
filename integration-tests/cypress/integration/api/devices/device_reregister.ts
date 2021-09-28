/// <reference path="../../../support/index.d.ts" />

import {
  HTTP_BadRequest,
  HTTP_Forbidden,
  HTTP_Unprocessable,
} from "../../../commands/constants";
import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;

describe("Device reregister", () => {
  const KEEP_DEVICE_NAME = false;
  const GENERATE_UNIQUE_NAME = true;
  const GENERATE_PASSWORD = null;

  before(() => {
    cy.testCreateUserGroupAndDevice(
      "Augustus",
      "RR_default_group",
      "RR_default_camera"
    );
    cy.apiGroupAdd("Augustus", "RR_default_group_2", true);
  });

  it("re-register a device in same group with different name", () => {
    let expectedDevice1: ApiDeviceResponse;
    let expectedDevice1b: ApiDeviceResponse;

    //register camera & store device details
    cy.testCreateUserAndGroup("RR_user1", "RR_group1");
    cy.apiDeviceAdd("RR_cam1", "RR_group1").then(() => {
      expectedDevice1 = {
        id: getCreds("RR_cam1").id,
        saltId: getCreds("RR_cam1").id,
        deviceName: getTestName("RR_cam1"),
        active: false,
        admin: true,
        groupName: getTestName("RR_group1"),
        groupId: getCreds("RR_group1").id,
      };
    });

    //re-register camera & store device details
    cy.apiDeviceReregister("RR_cam1", "RR_cam1b", "RR_group1").then(() => {
      expectedDevice1b = {
        id: getCreds("RR_cam1b").id,
        saltId: getCreds("RR_cam1").id,
        deviceName: getTestName("RR_cam1b"),
        active: true,
        admin: true,
        groupName: getTestName("RR_group1"),
        groupId: getCreds("RR_group1").id,
      };
      //verify old device is not present and new one is
      cy.apiDevicesCheck("RR_user1", [expectedDevice1b]);
      //verify old device is listed as inactive
      cy.apiDevicesCheck("RR_user1", [expectedDevice1, expectedDevice1b], {
        onlyActive: false,
      });
    });
  });

  it("re-register a device in new group with same name", () => {
    let expectedDevice2: ApiDeviceResponse;
    let expectedDevice2b: ApiDeviceResponse;

    cy.log("register camera & store device details");
    cy.testCreateUserGroupAndDevice("RR_user2", "RR_group2", "RR_cam2").then(
      () => {
        expectedDevice2 = {
          id: getCreds("RR_cam2").id,
          saltId: getCreds("RR_cam2").id,
          deviceName: getTestName("RR_cam2"),
          active: false,
          admin: true,
          groupName: getTestName("RR_group2"),
          groupId: getCreds("RR_group2").id,
        };
      }
    );

    cy.log("create second group");
    cy.testCreateUserAndGroup("RR_user2b", "RR_group2b");

    cy.log("re-register camera to 2nd group & store device details");
    cy.apiDeviceReregister("RR_cam2", "RR_cam2", "RR_group2b").then(() => {
      expectedDevice2b = {
        id: getCreds("RR_cam2").id,
        saltId: getCreds("RR_cam2").id,
        deviceName: getTestName("RR_cam2"),
        active: true,
        admin: true,
        groupName: getTestName("RR_group2b"),
        groupId: getCreds("RR_group2b").id,
      };
      cy.log("verify new device listed in 2nd group");
      cy.apiDevicesCheck("RR_user2b", [expectedDevice2b]);
      cy.log("verify old device is listed in 1st group as inactive");
      cy.apiDevicesCheck("RR_user2", [expectedDevice2], { onlyActive: false });
    });
  });

  it("re-register a device in different group with different name", () => {
    let expectedDevice3: ApiDeviceResponse;
    let expectedDevice3b: ApiDeviceResponse;

    cy.log("register camera & store device details");
    cy.testCreateUserGroupAndDevice("RR_user3", "RR_group3", "RR_cam3").then(
      () => {
        expectedDevice3 = {
          id: getCreds("RR_cam3").id,
          saltId: getCreds("RR_cam3").id,
          deviceName: getTestName("RR_cam3"),
          active: false,
          admin: true,
          groupName: getTestName("RR_group3"),
          groupId: getCreds("RR_group3").id,
        };
      }
    );

    cy.log("create second group");
    cy.testCreateUserAndGroup("RR_user3b", "RR_group3b");

    cy.log("re-register camera to 2nd group & store device details");
    cy.apiDeviceReregister("RR_cam3", "RR_cam3b", "RR_group3b").then(() => {
      expectedDevice3b = {
        id: getCreds("RR_cam3b").id,
        saltId: getCreds("RR_cam3b").id,
        deviceName: getTestName("RR_cam3b"),
        active: true,
        admin: true,
        groupName: getTestName("RR_group3b"),
        groupId: getCreds("RR_group3b").id,
      };
      cy.log("verify new device listed in 2nd group");
      cy.apiDevicesCheck("RR_user3b", [expectedDevice3b]);
      cy.log("verify old device is listed in 1st group as inactive");
      cy.apiDevicesCheck("RR_user3", [expectedDevice3], { onlyActive: false });
    });
  });

  it("But cannot re-register a device in same group with same name as another device", () => {
    let expectedDevice5a: ApiDeviceResponse;

    cy.log("register camera & store device details");
    cy.testCreateUserGroupAndDevice("RR_user5", "RR_group5", "RR_cam5a").then(
      () => {
        expectedDevice5a = {
          id: getCreds("RR_cam5a").id,
          saltId: getCreds("RR_cam5a").id,
          deviceName: getTestName("RR_cam5a"),
          active: true,
          admin: true,
          groupName: getTestName("RR_group5"),
          groupId: getCreds("RR_group5").id,
        };
      }
    );

    cy.log("another pre-existing camera");
    cy.apiDeviceAdd("RR_cam5", "RR_group5");

    cy.log("attempt to rename camera with duplicate name rejected");
    //TODO: This should really return 422-Unprocessable.  It is not malformed - just  breaks our rules
    cy.apiDeviceReregister(
      "RR_cam5a",
      "RR_cam5",
      "RR_group5",
      GENERATE_PASSWORD,
      GENERATE_UNIQUE_NAME,
      HTTP_BadRequest
    ).then(() => {
      cy.log("check old device unaltered");
      cy.apiDevicesCheckContains("RR_user5", [expectedDevice5a]);
    });
  });

  it("Should not be able to create a device name that doesn't have any letters", () => {
    cy.apiDeviceReregister(
      "RR_default_camera",
      "12345",
      "RR_default_group",
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      HTTP_Unprocessable
    );
    cy.apiDeviceReregister(
      "RR_default_camera",
      "1234-678",
      "RR_default_group",
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      HTTP_Unprocessable
    );
  });

  it("Should be able to create a device name that has -, _, and spaces in it", () => {
    cy.testCreateUserGroupAndDevice("RR_user6", "RR_group6", "RR_cam6");
    cy.apiDeviceReregister("RR_cam6", "funny device1", "RR_default_group");
    cy.apiDeviceReregister(
      "funny device1",
      "funny-device1",
      "RR_default_group"
    );
    cy.apiDeviceReregister(
      "funny-device1",
      "funny_device1",
      "RR_default_group"
    );
  });

  it("Shouldn't be able to create a device name that starts with -, _, and spaces in it", () => {
    cy.apiDeviceReregister(
      "RR_default_camera",
      " device1",
      "RR_default_group",
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      HTTP_Unprocessable
    );
    cy.apiDeviceReregister(
      "RR_default_camera",
      "-device1",
      "RR_default_group",
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      HTTP_Unprocessable
    );
    cy.apiDeviceReregister(
      "RR_default_camera",
      "_device1",
      "RR_default_group",
      GENERATE_PASSWORD,
      KEEP_DEVICE_NAME,
      HTTP_Unprocessable
    );
  });

  it("Reregistered device can keep default salt id", () => {
    cy.testCreateUserAndGroup("RR_user7", "RR_group7");
    cy.apiDeviceAdd("RR_cam7", "RR_group7").then(() => {
      const expectedDevice1: ApiDeviceResponse = {
        id: getCreds("RR_cam7").id,
        deviceName: getTestName("RR_cam7"),
        groupName: getTestName("RR_group7"),
        saltId: getCreds("RR_cam7").id,
        groupId: getCreds("RR_group7").id,
        admin: true,
        active: true,
      };
      cy.apiDevicesCheck("RR_user7", [expectedDevice1]);

      cy.apiDeviceReregister("RR_cam7", "RR_cam7b", "RR_group7");

      //Test with Salt Id = device id by default
      const expectedDevice2: ApiDeviceResponse = {
        deviceName: getTestName("RR_cam7b"),
        groupName: getTestName("RR_group7"),
        groupId: getCreds("RR_group7").id,
        saltId: getCreds("RR_cam7").id,
        id: getCreds("RR_cam7").id,
        admin: true,
        active: true,
      };
      cy.apiDevicesCheck("RR_user7", [expectedDevice2]);
    });
  });

  it("Reregistered device can keep specified salt id", () => {
    cy.testCreateUserAndGroup("RR_user8", "RR_group8").then(() => {
      cy.apiDeviceAdd("specify salt", "RR_group8", 9997);
      cy.apiDeviceReregister("specify salt", "specify salt2", "RR_group8").then(
        () => {
          cy.log("Test with Salt Id = device id by default");
          const expectedDevice2: ApiDeviceResponse = {
            deviceName: getTestName("specify salt2"),
            id: getCreds("specify salt2").id, // Unchecked and unknown
            active: true,
            admin: true,
            saltId: 9997,
            groupName: getTestName("RR_group8"),
            groupId: getCreds("RR_group8").id,
          };
          cy.apiDevicesCheck("RR_user8", [expectedDevice2]);
        }
      );
    });
  });

  it("When reregistering a device cannot specify an invalid password", () => {
    //not blank
    cy.apiDeviceReregister(
      "RR_default_camera",
      "valid_name",
      "RR_default_group",
      "",
      GENERATE_UNIQUE_NAME,
      HTTP_Unprocessable
    );
    //not space
    cy.apiDeviceReregister(
      "RR_default_camera",
      "valid_name2",
      "RR_default_group",
      " ",
      GENERATE_UNIQUE_NAME,
      HTTP_Unprocessable
    );
    //not less than 8 chars
    cy.apiDeviceReregister(
      "RR_default_camera",
      "valid_name3",
      "RR_default_group",
      "1234567",
      GENERATE_UNIQUE_NAME,
      HTTP_Unprocessable
    );
  });

  it("When reregistering a device must specify a group that exists", () => {
    cy.apiDeviceReregister(
      "RR_default_camera",
      "valid_name",
      "invalid-group",
      GENERATE_PASSWORD,
      GENERATE_UNIQUE_NAME,
      HTTP_Forbidden
    );
  });

  // TODO. Write this. helper does not currently handle missing parameters
  it.skip("Correctly handles missing parameters in register device", () => {});
});
