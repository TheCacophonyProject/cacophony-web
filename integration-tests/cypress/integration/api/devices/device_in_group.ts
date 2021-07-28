/// <reference path="../../../support/index.d.ts" />

const HTTP_AuthorizationError = 401;
const HTTP_BadRequest = 400;
const HTTP_OK = 200;

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";
import { logTestDescription } from "../../../commands/descriptions";

describe("Device in group", () => {
  const group_admin = "George-group_admin";
  const group_member = "Germima-group_member";
  const device_admin = "Goldfish-device_admin";
  const device_member = "Gerry-device_member";
  const hacker = "Hacker";
  const group = "device_auth";
  const camera = "camera1";
  const NOT_ADMIN = false;
  const ADMIN = true;
  let expectedDeviceInGroupAdminView;
  let expectedDeviceInGroupUserView;

  before(() => {
    cy.apiCreateUser(group_member);
    cy.apiCreateUser(device_member);
    cy.apiCreateUser(device_admin);
    cy.apiCreateUser(hacker);
    cy.apiCreateUserGroupAndCamera(group_admin, group, camera).then(() => {
      expectedDeviceInGroupAdminView={id: getCreds(camera).id, devicename: getTestName(camera), groupName: getTestName(group), userIsAdmin: true, users: [
        {userName: getTestName(device_member), admin: false, id: getCreds(device_member).id},
        {userName: getTestName(device_admin), admin: true, id: getCreds(device_admin).id}
      ]};
      expectedDeviceInGroupUserView={id: getCreds(camera).id, devicename: getTestName(camera), groupName: getTestName(group), userIsAdmin: false, users: null};
    });
    cy.apiAddUserToDevice(group_admin, device_member, camera);
    cy.apiAddUserToDevice(group_admin, device_admin, camera,ADMIN);
    cy.apiAddUserToGroup(group_admin, group_member, group, NOT_ADMIN);
  });

  it("Group admin should see everything including device users", () => {
    cy.apiCheckDeviceInGroup(group_admin, camera, group, null, expectedDeviceInGroupAdminView);
  });

  it("Device admin should see everything including device users", () => {
    cy.apiCheckDeviceInGroup(device_admin, camera, group, null, expectedDeviceInGroupAdminView);
  });

  it("Group member should be able to read all but device users", () => {
    cy.apiCheckDeviceInGroup(group_member, camera, group, null, expectedDeviceInGroupUserView);
  });

  it("Device member should be able to read all but device users", () => {
    cy.apiCheckDeviceInGroup(device_member, camera, group, null, expectedDeviceInGroupUserView);
  });

  it("Non member should not have any access", () => {
    logTestDescription(
      `Check that ${hacker} is blocked from getting device`,
      {}
    );
    cy.apiCheckDeviceInGroup(hacker, camera, group, null, {}, {}, HTTP_AuthorizationError);
  });

  it("Can retrieve group by id instead of name", () => {
    cy.apiCheckDeviceInGroup(device_member, camera, group, getCreds(group).id, expectedDeviceInGroupUserView);

  });

  // TODO: Fails - returns empty response instead of error message. Issue 60
  it.skip("Correctly handles invalid device", () => {
    cy.apiCheckDeviceInGroup(group_admin, 'bad-camera', group, null, {}, {}, HTTP_BadRequest);
  });

  it("Correctly handles invalid group", () => {
    cy.apiCheckDeviceInGroup(group_admin, camera, 'bad-group', null, {}, {}, HTTP_BadRequest);
  });

});

