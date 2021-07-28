/// <reference path="../../../support/index.d.ts" />

const HTTP_AuthorizationError = 401;
const HTTP_BadRequest = 400;
const HTTP_OK = 200;

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

describe("Device reregister", () => {
  const KEEP_DEVICE_NAME = true;
  const GENERATE_UNIQUE_NAME = false;
  const GENERATE_PASSWORD = null;

  before(() => {
    cy.apiCreateUserGroupAndCamera("Augustus", "RR_default_group","RR_default_camera");
    cy.apiCreateGroup("Augustus", "RR_default_group_2", true);
  });

  it("re-register a device in same group with different name", () => {
    let expectedDevice1;
    let expectedDevice1b;

    //register camera & store device details
    cy.apiCreateUserGroup("RR_user1", "RR_group1");
    cy.apiCreateCamera("RR_cam1", "RR_group1").then(() => {  
      expectedDevice1={id: getCreds("RR_cam1").id, devicename: getTestName("RR_cam1"), active: false, Users: []};
    });

    //re-register camera & store device details
    cy.apiDeviceReregister("RR_cam1", "RR_cam1b","RR_group1").then(() => {
      expectedDevice1b={id: getCreds("RR_cam1b").id, devicename: getTestName("RR_cam1b"), active: true, Users: []};
      //verify old device is not present and new one is
      cy.apiCheckDevices("RR_user1", [expectedDevice1b]);
      //verify old device is listed as inactive
      cy.apiCheckDevices("RR_user1", [expectedDevice1,expectedDevice1b], {onlyActive: false});
    });

  });

  it("re-register a device in new group with same name", () => {
    let expectedDevice2;
    let expectedDevice2b;

    //register camera & store device details
    cy.apiCreateUserGroupAndCamera("RR_user2", "RR_group2", "RR_cam2").then(() => {
      expectedDevice2={id: getCreds("RR_cam2").id, devicename: getTestName("RR_cam2"), active: false, Users: []};
    });

    //second group
    cy.apiCreateUserGroup("RR_user2b", "RR_group2b");

    //re-register camera to 2nd group & store device details
    cy.apiDeviceReregister("RR_cam2", "RR_cam2","RR_group2b").then(() => {
      expectedDevice2b={id: getCreds("RR_cam2").id, devicename: getTestName("RR_cam2"), active: true, Users: []};
      //verify new device listed in 2nd group
      cy.apiCheckDevices("RR_user2b", [expectedDevice2b]);
      //verify old device is listed in 1st group as inactive
      cy.apiCheckDevices("RR_user2", [expectedDevice2], {onlyActive: false});
    });

  });

  it("re-register a device in different group with different name", () => {
    let expectedDevice3;
    let expectedDevice3b;

    //register camera & store device details
    cy.apiCreateUserGroupAndCamera("RR_user3", "RR_group3", "RR_cam3").then(() => {
      expectedDevice3={id: getCreds("RR_cam3").id, devicename: getTestName("RR_cam3"), active: false, Users: []};
    });

    //second group
    cy.apiCreateUserGroup("RR_user3b", "RR_group3b");

    //re-register camera to 3nd group & store device details
    cy.apiDeviceReregister("RR_cam3", "RR_cam3b","RR_group3b").then(() => {
      expectedDevice3b={id: getCreds("RR_cam3b").id, devicename: getTestName("RR_cam3b"), active: true, Users: []};
      //verify new device listed in 3nd group
      cy.apiCheckDevices("RR_user3b", [expectedDevice3b]);
      //verify old device is listed in 1st group as inactive
      cy.apiCheckDevices("RR_user3", [expectedDevice3], {onlyActive: false});
    });
  });

  it("But cannot re-register a device in same group with same name as another device", () => {
    let expectedDevice5a;

    //register camera & store device details
    cy.apiCreateUserGroupAndCamera("RR_user5", "RR_group5", "RR_cam5a").then(() => {
      expectedDevice5a={id: getCreds("RR_cam5a").id, devicename: getTestName("RR_cam5a"), active: true, Users: []};
    });

    //another pre-existing camera
    cy.apiCreateCamera("RR_cam5", "RR_group5");

    //attempt to rename camera with duplicate name rejected
    cy.apiDeviceReregister("RR_cam5a", "RR_cam5","RR_group5", GENERATE_PASSWORD, GENERATE_UNIQUE_NAME, HTTP_BadRequest).then(() => {
      //check old device unaltered
      cy.apiCheckDevices_contains("RR_user5", [expectedDevice5a]);
    });

  });

  it("Should not be able to create a device name that doesn't have any letters", () => {
    cy.apiDeviceReregister("RR_default_camera","12345", "RR_default_group", GENERATE_PASSWORD, KEEP_DEVICE_NAME, HTTP_BadRequest);
    cy.apiDeviceReregister("RR_default_camera","1234-678", "RR_default_group", GENERATE_PASSWORD, KEEP_DEVICE_NAME, HTTP_BadRequest);
  });

  it("Should be able to create a device name that has -, _, and spaces in it", () => {
    cy.apiCreateUserGroupAndCamera("RR_user6", "RR_group6", "RR_cam6");
    cy.apiDeviceReregister("RR_cam6","funny device1", "RR_default_group");
    cy.apiDeviceReregister("funny device1","funny-device1", "RR_default_group");
    cy.apiDeviceReregister("funny-device1", "funny_device1", "RR_default_group");
  });

  it("Shouldn't be able to create a device name that starts with -, _, and spaces in it", () => {
    cy.apiDeviceReregister("RR_default_camera", " device1", "RR_default_group", GENERATE_PASSWORD, KEEP_DEVICE_NAME, HTTP_BadRequest);
    cy.apiDeviceReregister("RR_default_camera", "-device1", "RR_default_group", GENERATE_PASSWORD, KEEP_DEVICE_NAME, HTTP_BadRequest);
    cy.apiDeviceReregister("RR_default_camera", "_device1", "RR_default_group", GENERATE_PASSWORD, KEEP_DEVICE_NAME, HTTP_BadRequest);
  });

  it("Reregistered device can keep default salt id", () => {
    cy.apiCreateUserGroup("RR_user7", "RR_group7");
    cy.apiCreateCamera("RR_cam7", "RR_group7").then(() => {

      const expectedDevice1={"devicename": getTestName("RR_cam7"), "groupname": getTestName("RR_group7"), "saltId":getCreds("RR_cam7").id};
      cy.apiCheckDevicesQuery("RR_user7", [expectedDevice1], null, [expectedDevice1]);

      cy.apiDeviceReregister("RR_cam7", "RR_cam7b", "RR_group7");
  
      //Test with Salt Id = device id by default
      const expectedDevice2={"devicename": getTestName("RR_cam7b"), "groupname": getTestName("RR_group7"), "saltId":getCreds("RR_cam7").id};
      cy.apiCheckDevicesQuery("RR_user7", [expectedDevice2], null, [expectedDevice2]);
    });
  });

  it("Reregistered device can keep specified salt id", () => {
    cy.apiCreateUserGroup("RR_user8", "RR_group8"); 
    cy.apiCreateCamera("specify salt", "RR_group8", 9997);
    cy.apiDeviceReregister("specify salt", "specify salt2", "RR_group8");

    //Test with Salt Id = device id by default
    const expectedDevice2={"devicename": getTestName("specify salt2"), "groupname": getTestName("RR_group8"), "saltId":9997};
    cy.apiCheckDevicesQuery("RR_user8", [expectedDevice2], null, [expectedDevice2]);
  });

  it("When reregistering a device cannot specify an invalid password", () => {
    //not blank
    cy.apiDeviceReregister("RR_default_camera", "valid_name", "", "RR_default_group", GENERATE_UNIQUE_NAME, HTTP_BadRequest);
    //not space
    cy.apiDeviceReregister("RR_default_camera", "valid_name2", " ", "RR_default_group", GENERATE_UNIQUE_NAME, HTTP_BadRequest);
    //not less than 8 chars
    cy.apiDeviceReregister("RR_default_camera", "valid_name3", "1234567", "RR_default_group", GENERATE_UNIQUE_NAME, HTTP_BadRequest);
  });

  it("When reregistering a device must specify a group that exists", () => {
    cy.apiDeviceReregister("RR_default_camera", "valid_name", GENERATE_PASSWORD, "invalid-group", GENERATE_UNIQUE_NAME, HTTP_BadRequest);
  });

  // TODO. Write this. helper does not currently handle missing parameters
  it.skip("Correctly handles missing parameters in register device", () => {

  });

});
