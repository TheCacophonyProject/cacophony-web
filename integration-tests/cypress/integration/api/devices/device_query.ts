/// <reference path="../../../support/index.d.ts" />

const HTTP_AuthorizationError = 401;
const HTTP_BadRequest = 400;
const HTTP_OK = 200;

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

describe("Devices/query", () => {
  const group_admin = "Fredrick-group_admin";
  const group_member = "Faustus-group_member";
  const device_member = "Felicity-device_member";
  const device_admin = "Fanny-device_admin";
  const user2 = "Frodo-group-admin2";
  const user3 = "Frank-group-admin3";
  const everythingUser = "Fillip-both-groups";
  const hacker = "F-Hacker";
  const group1 = "Fredrick-Team1";
  const group2 = "Fredrick-Team2";
  const group3 = "Fredrick-Team3";
  const cameraA1 = "F-cameraA1";
  const cameraB1 = "F-cameraB1";
  const cameraA2 = "F-cameraA2";
  const camera3= "F-camera3";
  const camera4= "F-camera4";
  const camera5= "F-camera5";
  const NOT_ADMIN = false;
  const ADMIN = true;
  const superuser = 'admin_test';
  const su_passwd = 'admin_test';
  let expectedDeviceA1;
  let expectedDeviceA2;
  let expectedDeviceB1;
  let expectedDevice3;
  let expectedDevice4;

  before(() => {
    //first group, users & devices
    cy.apiCreateUser(group_member);
    cy.apiCreateUser(device_admin);
    cy.apiCreateUser(device_member);
    cy.apiCreateUser(hacker);
    cy.apiCreateUserGroupAndCamera(group_admin, group1, cameraA1);
    expectedDeviceA1={"devicename": getTestName(cameraA1), "groupname": getTestName(group1)};
    cy.apiCreateCamera(cameraB1, group1);
    expectedDeviceB1={"devicename": getTestName(cameraB1), "groupname": getTestName(group1)};

    cy.apiAddUserToGroup(group_admin, group_member, group1, NOT_ADMIN);
    cy.apiAddUserToDevice(group_admin, device_member, cameraA1);
    cy.apiAddUserToDevice(group_admin, device_admin, cameraA1, ADMIN);

    //second group
    cy.apiCreateUserGroupAndCamera(user2, group2, cameraA2);
    expectedDeviceA2={"devicename": getTestName(cameraA2), "groupname": getTestName(group2)};

    //user who can see both groups
    cy.apiCreateUser(everythingUser); 
    cy.apiAddUserToGroup(group_admin, everythingUser, group1, NOT_ADMIN);
    cy.apiAddUserToGroup(user2, everythingUser, group2, NOT_ADMIN);

    //reregistered device
    cy.apiCreateUserGroupAndCamera(user3, group3, camera3);
    cy.apiAddUserToDevice(user3, user3, camera3);
    expectedDevice3={"devicename": getTestName(camera3), "groupname": getTestName(group3)};
    cy.apiDeviceReregister(camera3,camera4,group3);
    expectedDevice4={"devicename": getTestName(camera4), "groupname": getTestName(group3)};
  });

  it("Can match a single device by group+devicename", () => {
    cy.apiCheckDevicesQuery(group_admin, [expectedDeviceA1], null, [expectedDeviceA1]);
  });

  it("Can match a single device by group", () => {
    cy.apiCheckDevicesQuery(user2, null, [getTestName(group2)], [expectedDeviceA2]);
  });

  it("Can match multiple devices by group+devicename", () => {
    cy.apiCheckDevicesQuery(group_admin, [expectedDeviceA1, expectedDeviceB1], null, [expectedDeviceA1, expectedDeviceB1]);
  });
 
  it("Can match multiple devices in single group", () => {
    cy.apiCheckDevicesQuery(group_admin, null, [getTestName(group1)], [expectedDeviceA1, expectedDeviceB1]);
  });
 
  it("Can match multiple devices in multiple groups", () => {
    cy.apiCheckDevicesQuery(everythingUser, null, [getTestName(group1), getTestName(group2)], [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2]);
  });

  it("Can match on device AND group", () => {
    // return everything wher both queries fully match
    cy.apiCheckDevicesQuery(everythingUser, [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2], [getTestName(group1), getTestName(group2)], [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2], 'and');
    // return common elements where devices returns more than groups
    cy.apiCheckDevicesQuery(everythingUser, [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2], [getTestName(group1)], [expectedDeviceA1, expectedDeviceB1], 'and');
    // return common elements where group returns more than devices
    cy.apiCheckDevicesQuery(everythingUser, [expectedDeviceA1, expectedDeviceA2], [getTestName(group1), getTestName(group2)], [expectedDeviceA1, expectedDeviceA2], 'and');
    // return nothing where no overlap of devices and groups
    cy.apiCheckDevicesQuery(everythingUser, [expectedDeviceA1, expectedDeviceB1], [getTestName(group2)], [], 'and');
  });

  //Do not run against a live server as we don't have superuser login
  if(Cypress.env('test_using_default_superuser')==true) {
    it("Super-user should see any device", () => {
      cy.apiSignInAs(null,null,superuser,su_passwd);

      cy.apiCheckDevicesQuery(superuser, null, [getTestName(group1), getTestName(group2)], [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2]);
    });
  } else {
    it.skip("Super-user should see all devices", () => {});
  }


  it("Group admin can see all and only their group's devices", () => {
    cy.apiCheckDevicesQuery(group_admin, null, [getTestName(group1), getTestName(group2)], [expectedDeviceA1, expectedDeviceB1]);
  });

  it("Group user can see all and only their group's devices", () => {
    cy.apiCheckDevicesQuery(group_member, null, [getTestName(group1), getTestName(group2)], [expectedDeviceA1, expectedDeviceB1]);
  });

  it("Device admin can see all and only their devices", () => {
    cy.apiCheckDevicesQuery(device_admin, null, [getTestName(group1), getTestName(group2)], [expectedDeviceA1]);
  });

  it("Device user can see all and only their devices", () => {
    cy.apiCheckDevicesQuery(device_member, null, [getTestName(group1), getTestName(group2)], [expectedDeviceA1]);
  });

  it("Displays both active and inactive devices", () => { 
    cy.apiCheckDevicesQuery(user3, null, [getTestName(group3)], [expectedDevice3, expectedDevice4]);
  });

  it("Displays correct salt ID", () => {
    const expectedDevice={"devicename": getTestName(cameraA1), "groupname": getTestName(group1), "saltId":getCreds(cameraA1).id};

    //Test with Salt Id = device id by default
    cy.apiCheckDevicesQuery(everythingUser, [expectedDeviceA1], null, [expectedDevice]);

    //Test with Salt Id specified on register
    cy.apiCreateCamera(camera5, group1, 9999);
    const expectedDevice5={"devicename": getTestName(camera5), "groupname": getTestName(group1), "saltId":9999};
    cy.apiCheckDevicesQuery(everythingUser, [expectedDevice5], null, [expectedDevice5]);

  });

  it("Correctly handles incorrect parameters", () => {
    //no group or devices (returns empty list)
    cy.apiCheckDevicesQuery(group_member, null, null, []);

    //devices is missing devicename
    //TODO: This fails with internal server error - issue 64.  Reenable when fixed.
    //    cy.apiCheckDevicesQuery(group_member, [{"groupname": getTestName(group1)}], null, [], 'or', HTTP_BadRequest);

    //devices is missing groupname
    //TODO: This fails with internal server error - issue 64.  Reenable when fixed.
    //    cy.apiCheckDevicesQuery(group_member, [{"devicename": getTestName(cameraA1)}], null, [], 'or', HTTP_BadRequest);

    //devices not  JSON array
    cy.apiCheckDevicesQuery(group_member, "bad value", null, [], 'or', HTTP_BadRequest);

    //group not  JSON array
    cy.apiCheckDevicesQuery(group_member, null, "bad value", [], 'or', HTTP_BadRequest);

    //operator not and or or
    cy.apiCheckDevicesQuery(group_member, null, [getTestName(group1)], [], 'bad-operator', HTTP_BadRequest);
  });
});

