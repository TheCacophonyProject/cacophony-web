/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";
import { logTestDescription } from "../../../commands/descriptions";
import { ApiDeviceInGroupDevice } from "../../../commands/types";
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
} from "../../../commands/constants";

describe("Device in group", () => {
  const groupAdmin = "George-groupAdmin";
  const groupMember = "Germima-groupMember";
  const deviceAdmin = "Goldfish-deviceAdmin";
  const deviceMember = "Gerry-deviceMember";
  const hacker = "Hacker";
  const group = "device_auth";
  const camera = "camera1";
  const NOT_ADMIN = false;
  const ADMIN = true;
  let expectedDeviceInGroupAdminView: ApiDeviceInGroupDevice;
  let expectedDeviceInGroupUserView: ApiDeviceInGroupDevice;

  before(() => {
    cy.apiUserAdd(groupMember);
    cy.apiUserAdd(deviceMember);
    cy.apiUserAdd(deviceAdmin);
    cy.apiUserAdd(hacker);
    cy.testCreateUserGroupAndDevice(groupAdmin, group, camera).then(() => {
      expectedDeviceInGroupAdminView = {
        id: getCreds(camera).id,
        devicename: getTestName(camera),
        groupName: getTestName(group),
        userIsAdmin: true,
        users: [
          {
            userName: getTestName(deviceMember),
            admin: false,
            id: getCreds(deviceMember).id,
          },
          {
            userName: getTestName(deviceAdmin),
            admin: true,
            id: getCreds(deviceAdmin).id,
          },
        ],
      };
      expectedDeviceInGroupUserView = {
        id: getCreds(camera).id,
        devicename: getTestName(camera),
        groupName: getTestName(group),
        userIsAdmin: false,
        users: null,
      };
    });
    cy.apiDeviceUserAdd(groupAdmin, deviceMember, camera);
    cy.apiDeviceUserAdd(groupAdmin, deviceAdmin, camera, ADMIN);
    cy.apiGroupUserAdd(groupAdmin, groupMember, group, NOT_ADMIN);
  });

  it("Group admin should see everything including device users", () => {
    cy.apiDeviceInGroupCheck(
      groupAdmin,
      camera,
      group,
      null,
      expectedDeviceInGroupAdminView
    );
  });

  it("Device admin should see everything including device users", () => {
    cy.apiDeviceInGroupCheck(
      deviceAdmin,
      camera,
      group,
      null,
      expectedDeviceInGroupAdminView
    );
  });

  it("Group member should be able to read all but device users", () => {
    cy.apiDeviceInGroupCheck(
      groupMember,
      camera,
      group,
      null,
      expectedDeviceInGroupUserView
    );
  });

  it("Device member should be able to read all but device users", () => {
    cy.apiDeviceInGroupCheck(
      deviceMember,
      camera,
      group,
      null,
      expectedDeviceInGroupUserView
    );
  });

  it("Non member should not have any access", () => {
    logTestDescription(
      `Check that ${hacker} is blocked from getting device`,
      {}
    );
    cy.apiDeviceInGroupCheck(
      hacker,
      camera,
      group,
      null,
      null,
      {},
      HTTP_Forbidden
    );
  });

  it("Can retrieve group by id instead of name", () => {
    cy.apiDeviceInGroupCheck(
      deviceMember,
      camera,
      group,
      getCreds(group).id,
      expectedDeviceInGroupUserView
    );
  });

  // TODO: Fails - returns empty response instead of error message. Issue 60
  it.skip("Correctly handles invalid device", () => {
    cy.apiDeviceInGroupCheck(
      groupAdmin,
      "bad-camera",
      group,
      null,
      null,
      {},
      HTTP_Unprocessable
    );
  });

  it("Correctly handles invalid group", () => {
    cy.apiDeviceInGroupCheck(
      groupAdmin,
      camera,
      "bad-group",
      null,
      null,
      {},
      HTTP_Unprocessable
    );
  });
});
