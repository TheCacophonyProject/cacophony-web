/// <reference path="../../../support/index.d.ts" />

import { HTTP_Unprocessable } from "@commands/constants";

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;

describe.skip("Devices/query", () => {
  // const superuser = getCreds("superuser")["name"];
  // const suPassword = getCreds("superuser")["password"];
  //
  // const groupAdmin = "Fredrick-groupAdmin";
  // const groupMember = "Faustus-groupMember";
  // const deviceMember = "Felicity-deviceMember";
  // const deviceAdmin = "Fanny-deviceAdmin";
  // const user2 = "Frodo-group-admin2";
  // const user3 = "Frank-group-admin3";
  // const everythingUser = "Fillip-both-groups";
  // const hacker = "F-Hacker";
  // const group1 = "Fredrick-Team1";
  // const group2 = "Fredrick-Team2";
  // const group3 = "Fredrick-Team3";
  // const cameraA1 = "F-cameraA1";
  // const cameraB1 = "F-cameraB1";
  // const cameraA2 = "F-cameraA2";
  // const camera3 = "F-camera3";
  // const camera4 = "F-camera4";
  // const camera5 = "F-camera5";
  // const NOT_ADMIN = false;
  // const ADMIN = true;
  // let expectedDeviceA1: ApiDeviceResponse;
  // let expectedDeviceA2: ApiDeviceResponse;
  // let expectedDeviceB1: ApiDeviceResponse;
  // let expectedDevice3: ApiDeviceResponse;
  // let expectedDevice4: ApiDeviceResponse;
  //
  // before(() => {
  //   //first group, users & devices
  //   cy.apiUserAdd(groupMember);
  //   cy.apiUserAdd(deviceAdmin);
  //   cy.apiUserAdd(deviceMember);
  //   cy.apiUserAdd(hacker);
  //   cy.testCreateUserGroupAndDevice(groupAdmin, group1, cameraA1);
  //   expectedDeviceA1 = {
  //     devicename: getTestName(cameraA1),
  //     groupname: getTestName(group1),
  //   };
  //   cy.apiDeviceAdd(cameraB1, group1);
  //   expectedDeviceB1 = {
  //     devicename: getTestName(cameraB1),
  //     groupname: getTestName(group1),
  //   };
  //
  //   cy.apiGroupUserAdd(groupAdmin, groupMember, group1, NOT_ADMIN);
  //   cy.apiDeviceUserAdd(groupAdmin, deviceMember, cameraA1);
  //   cy.apiDeviceUserAdd(groupAdmin, deviceAdmin, cameraA1, ADMIN);
  //
  //   //second group
  //   cy.testCreateUserGroupAndDevice(user2, group2, cameraA2);
  //   expectedDeviceA2 = {
  //     devicename: getTestName(cameraA2),
  //     groupname: getTestName(group2),
  //   };
  //
  //   //user who can see both groups
  //   cy.apiUserAdd(everythingUser);
  //   cy.apiGroupUserAdd(groupAdmin, everythingUser, group1, NOT_ADMIN);
  //   cy.apiGroupUserAdd(user2, everythingUser, group2, NOT_ADMIN);
  //
  //   //reregistered device
  //   cy.testCreateUserGroupAndDevice(user3, group3, camera3);
  //   cy.apiDeviceUserAdd(user3, user3, camera3);
  //   expectedDevice3 = {
  //     devicename: getTestName(camera3),
  //     groupname: getTestName(group3),
  //   };
  //   cy.apiDeviceReregister(camera3, camera4, group3);
  //   expectedDevice4 = {
  //     devicename: getTestName(camera4),
  //     groupname: getTestName(group3),
  //   };
  // });
  //
  // it("Can match a single device by group+devicename", () => {
  //   cy.apiDeviceQueryCheck(groupAdmin, [expectedDeviceA1], null, [
  //     expectedDeviceA1,
  //   ]);
  // });
  //
  // it("Can match a single device by group", () => {
  //   cy.apiDeviceQueryCheck(
  //     user2,
  //     null,
  //     [getTestName(group2)],
  //     [expectedDeviceA2]
  //   );
  // });
  //
  // it("Can match multiple devices by group+devicename", () => {
  //   cy.apiDeviceQueryCheck(
  //     groupAdmin,
  //     [expectedDeviceA1, expectedDeviceB1],
  //     null,
  //     [expectedDeviceA1, expectedDeviceB1]
  //   );
  // });
  //
  // it("Can match multiple devices in single group", () => {
  //   cy.apiDeviceQueryCheck(
  //     groupAdmin,
  //     null,
  //     [getTestName(group1)],
  //     [expectedDeviceA1, expectedDeviceB1]
  //   );
  // });
  //
  // it("Can match multiple devices in multiple groups", () => {
  //   cy.apiDeviceQueryCheck(
  //     everythingUser,
  //     null,
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2]
  //   );
  // });
  //
  // it("Can match on device AND group", () => {
  //   // return everything wher both queries fully match
  //   cy.apiDeviceQueryCheck(
  //     everythingUser,
  //     [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2],
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2],
  //     "and"
  //   );
  //   // return common elements where devices returns more than groups
  //   cy.apiDeviceQueryCheck(
  //     everythingUser,
  //     [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2],
  //     [getTestName(group1)],
  //     [expectedDeviceA1, expectedDeviceB1],
  //     "and"
  //   );
  //   // return common elements where group returns more than devices
  //   cy.apiDeviceQueryCheck(
  //     everythingUser,
  //     [expectedDeviceA1, expectedDeviceA2],
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1, expectedDeviceA2],
  //     "and"
  //   );
  //   // return nothing where no overlap of devices and groups
  //   cy.apiDeviceQueryCheck(
  //     everythingUser,
  //     [expectedDeviceA1, expectedDeviceB1],
  //     [getTestName(group2)],
  //     [],
  //     "and"
  //   );
  // });
  //
  // //Do not run against a live server as we don't have superuser login
  // if (Cypress.env("running_in_a_dev_environment") == true) {
  //   it("Super-user should see any device", () => {
  //     cy.apiSignInAs(null, null, superuser, suPassword);
  //
  //     cy.apiDeviceQueryCheck(
  //       superuser,
  //       null,
  //       [getTestName(group1), getTestName(group2)],
  //       [expectedDeviceA1, expectedDeviceB1, expectedDeviceA2]
  //     );
  //   });
  // } else {
  //   it.skip("Super-user should see all devices", () => {});
  // }
  //
  // it("Group admin can see all and only their group's devices", () => {
  //   cy.apiDeviceQueryCheck(
  //     groupAdmin,
  //     null,
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1, expectedDeviceB1]
  //   );
  // });
  //
  // it("Group user can see all and only their group's devices", () => {
  //   cy.apiDeviceQueryCheck(
  //     groupMember,
  //     null,
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1, expectedDeviceB1]
  //   );
  // });
  //
  // it("Device admin can see all and only their devices", () => {
  //   cy.apiDeviceQueryCheck(
  //     deviceAdmin,
  //     null,
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1]
  //   );
  // });
  //
  // it("Device user can see all and only their devices", () => {
  //   cy.apiDeviceQueryCheck(
  //     deviceMember,
  //     null,
  //     [getTestName(group1), getTestName(group2)],
  //     [expectedDeviceA1]
  //   );
  // });
  //
  // it("Displays both active and inactive devices", () => {
  //   cy.apiDeviceQueryCheck(
  //     user3,
  //     null,
  //     [getTestName(group3)],
  //     [expectedDevice3, expectedDevice4]
  //   );
  // });
  //
  // it("Displays correct salt ID", () => {
  //   const expectedDevice = {
  //     devicename: getTestName(cameraA1),
  //     groupname: getTestName(group1),
  //     saltId: getCreds(cameraA1).id,
  //   };
  //
  //   //Test with Salt Id = device id by default
  //   cy.apiDeviceQueryCheck(everythingUser, [expectedDeviceA1], null, [
  //     expectedDevice,
  //   ]);
  //
  //   //Test with Salt Id specified on register
  //   cy.apiDeviceAdd(camera5, group1, 9999);
  //   const expectedDevice5 = {
  //     devicename: getTestName(camera5),
  //     groupname: getTestName(group1),
  //     saltId: 9999,
  //   };
  //   cy.apiDeviceQueryCheck(everythingUser, [expectedDevice5], null, [
  //     expectedDevice5,
  //   ]);
  // });
  //
  // it("Correctly handles incorrect parameters", () => {
  //   //no group or devices (returns empty list)
  //   cy.apiDeviceQueryCheck(groupMember, null, null, []);
  //
  //   //devices is missing devicename
  //   //TODO: This fails with internal server error - issue 64.  Reenable when fixed.
  //   //    cy.apiDeviceQueryCheck(groupMember, [{"groupname": getTestName(group1)}], null, [], 'or', HTTP_Unprocessable);
  //
  //   //devices is missing groupname
  //   //TODO: This fails with internal server error - issue 64.  Reenable when fixed.
  //   //    cy.apiDeviceQueryCheck(groupMember, [{"devicename": getTestName(cameraA1)}], null, [], 'or', HTTP_Unprocessable);
  //
  //   //devices not  JSON array
  //   cy.apiDeviceQueryCheck(
  //     groupMember,
  //     "bad value" as unknown as [],
  //     null,
  //     [],
  //     "or",
  //     HTTP_Unprocessable
  //   );
  //
  //   //group not  JSON array
  //   cy.apiDeviceQueryCheck(
  //     groupMember,
  //     null,
  //     "bad value" as unknown as [],
  //     [],
  //     "or",
  //     HTTP_Unprocessable
  //   );
  //
  //   //operator not and or or
  //   cy.apiDeviceQueryCheck(
  //     groupMember,
  //     null,
  //     [getTestName(group1)],
  //     [],
  //     "bad-operator",
  //     HTTP_Unprocessable
  //   );
  // });
});
