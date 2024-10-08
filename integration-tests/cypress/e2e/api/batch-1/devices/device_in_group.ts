/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { logTestDescription } from "@commands/descriptions";
import { DeviceType, HttpStatusCode } from "@typedefs/api/consts";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;

describe("Device in group", () => {
  const groupAdmin = "George-groupAdmin";
  const groupMember = "Germima-groupMember";
  const hacker = "Hacker";
  const group = "device_auth";
  const camera = "camera1";
  const NOT_ADMIN = false;
  let expectedDeviceInGroupAdminView: ApiDeviceResponse;
  let expectedDeviceInGroupUserView: ApiDeviceResponse;

  before(() => {
    cy.apiUserAdd(groupMember);
    cy.apiUserAdd(hacker);
    cy.testCreateUserGroupAndDevice(groupAdmin, group, camera).then(() => {
      expectedDeviceInGroupAdminView = {
        id: getCreds(camera).id,
        saltId: getCreds(camera).id,
        deviceName: getTestName(camera),
        groupName: getTestName(group),
        groupId: getCreds(group).id,
        type: DeviceType.Unknown,
        admin: true,
        active: true,
        isHealthy: false,
      };
      expectedDeviceInGroupUserView = {
        id: getCreds(camera).id,
        saltId: getCreds(camera).id,
        deviceName: getTestName(camera),
        groupName: getTestName(group),
        groupId: getCreds(group).id,
        type: DeviceType.Unknown,
        admin: false,
        active: true,
        isHealthy: false,
      };
    });
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

  it("Group member should be able to read all but device users", () => {
    cy.apiDeviceInGroupCheck(
      groupMember,
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
      HttpStatusCode.Forbidden
    );
  });

  it("Can retrieve group by id instead of name", () => {
    cy.apiDeviceInGroupCheck(
      groupMember,
      camera,
      group,
      getCreds(group).id,
      expectedDeviceInGroupUserView
    );
  });

  it("Correctly handles invalid device", () => {
    cy.apiDeviceInGroupCheck(
      groupAdmin,
      "bad-camera",
      group,
      null,
      null,
      {},
      HttpStatusCode.Forbidden
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
      HttpStatusCode.Forbidden
    );
  });
});
