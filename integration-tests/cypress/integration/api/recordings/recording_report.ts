/// <reference path="../../../support/index.d.ts" />
import {
  // HTTP_Unprocessable,
  // HTTP_BadRequest,
  // HTTP_Unprocessable,
  // HTTP_Forbidden,
  // HTTP_OK200,
} from "../../../commands/constants";




describe("Recording report", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("rrGroupAdmin", "rrGroup", "rrCamera1");
    cy.apiDeviceAdd("rrCamera1b", "rrGroup");
    cy.apiUserAdd("rrGroupMember");
    cy.apiUserAdd("rrDeviceAdmin");
    cy.apiUserAdd("rrDeviceMember");
    cy.apiGroupUserAdd("rrGroupAdmin", "rrGroupMember", "rrGroup", true);
    cy.apiDeviceUserAdd("rrGroupAdmin", "rrDeviceAdmin", "rrCamera1", true);
    cy.apiDeviceUserAdd("rrGroupAdmin", "rrDeviceMember", "rrCamera1", true);

    cy.testCreateUserGroupAndDevice("rrGroup2Admin", "rrGroup2", "rrCamera2");

  });

  it.skip("TODO: write tests for recording reports", () => { });

});

