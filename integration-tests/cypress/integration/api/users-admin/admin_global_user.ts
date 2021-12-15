/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_OK200,
  HTTP_Unprocessable,
} from "@commands/constants";

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import { DeviceType } from "@typedefs/api/consts";

describe("User: manage global access permissions", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];
  let expectedDevice1: ApiDeviceResponse;
  let expectedDevice2: ApiDeviceResponse;

  before(() => {
    cy.apiSignInAs(null, null, superuser, suPassword);
    cy.testCreateUserGroupAndDevice("gapUser1", "gapGroup1", "gapCamera1").then(
      () => {
        expectedDevice1 = {
          id: getCreds("gapCamera1").id,
          saltId: getCreds("gapCamera1").id,
          deviceName: getTestName("gapCamera1"),
          groupName: getTestName("gapGroup1"),
          groupId: getCreds("gapGroup1").id,
          type: DeviceType.Unknown,
          admin: true,
          active: true,
        };
      }
    );
    cy.testCreateUserGroupAndDevice("gapUser2", "gapGroup2", "gapCamera2").then(
      () => {
        expectedDevice2 = {
          id: getCreds("gapCamera2").id,
          saltId: getCreds("gapCamera2").id,
          deviceName: getTestName("gapCamera2"),
          groupName: getTestName("gapGroup2"),
          groupId: getCreds("gapGroup2").id,
          type: DeviceType.Unknown,
          admin: true,
          active: true,
        };
        cy.apiUserAdd("gapUser3");
      }
    );
  });

  //NOTE:  This test only looks as enabling and disabling global access
  //Verifications are tested here against a single endpoint.  Test scripts for individual
  //endpoints must all verify correct superuser access to their endpoint.
  //
  //
  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user can set global read access", () => {
      cy.apiAdminUpdate(superuser, "gapUser1", "read").then(() => {
        const expectedUser = TestCreateExpectedUser("gapUser1", {
          globalPermission: "read",
        });

        cy.log("Check correct permissions reported");
        cy.apiUserCheck("gapUser1", getTestName("gapUser1"), expectedUser);

        cy.log("Check can read globally");
        cy.apiDeviceInGroupCheck(
          "gapUser1",
          "gapCamera2",
          "gapGroup2",
          null,
          expectedDevice2
        );

        cy.log("Cannot elevate own permisssions");
        cy.apiAdminUpdate("gapUser1", "gapUser1", "write", HTTP_Forbidden);

        cy.log("Check cannot write globally");
        cy.apiDeviceUserAdd(
          "gapUser1",
          "gapUser3",
          "gapCamera2",
          false,
          HTTP_Forbidden
        );

        cy.log("Set back to default (off)");
        cy.apiAdminUpdate(superuser, "gapUser1", "off").then(() => {
          cy.log("Check cannot read globally");
          cy.apiDeviceInGroupCheck(
            "gapUser1",
            "gapCamera2",
            "gapGroup2",
            null,
            undefined,
            {},
            HTTP_Forbidden
          );
        });
      });
    });
  } else {
    it.skip("Super-user can set global read access");
  }

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user can set global write access", () => {
      cy.apiAdminUpdate(superuser, "gapUser1", "write").then(() => {
        const expectedUser = TestCreateExpectedUser("gapUser1", {
          globalPermission: "write",
        });

        cy.log("Check correct permissions reported");
        cy.apiUserCheck("gapUser1", getTestName("gapUser1"), expectedUser);

        cy.log("Check can read globally");
        cy.apiDeviceInGroupCheck(
          "gapUser1",
          "gapCamera2",
          "gapGroup2",
          null,
          expectedDevice2
        );

        cy.log("Check can write globally");
        cy.apiDeviceUserAdd("gapUser1", "gapUser3", "gapCamera2", false);
        cy.apiDeviceUserRemove("gapUser1", "gapUser3", "gapCamera2");

        cy.log("Set back to default (off)");
        cy.apiAdminUpdate(superuser, "gapUser1", "off").then(() => {
          cy.log("Check cannot read globally");
          cy.apiDeviceInGroupCheck(
            "gapUser1",
            "gapCamera2",
            "gapGroup2",
            null,
            undefined,
            {},
            HTTP_Forbidden
          );
        });
      });
    });
  } else {
    it.skip("Super-user can set global write access");
  }

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user can set permission by userId as well as name", () => {
      cy.apiAdminUpdate(
        superuser,
        getCreds("gapUser1").id.toString(),
        "write",
        HTTP_OK200,
        { useRawUserName: true }
      ).then(() => {
        cy.log("Check can write globally");
        cy.apiDeviceUserAdd("gapUser1", "gapUser3", "gapCamera2", false);
        cy.apiDeviceUserRemove("gapUser1", "gapUser3", "gapCamera2");

        cy.log("Set back to default (off)");
        cy.apiAdminUpdate(
          superuser,
          getCreds("gapUser1").id.toString(),
          "off",
          HTTP_OK200,
          { useRawUserName: true }
        );
      });
    });
  } else {
    it.skip("Super-user can set global write access");
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Correct handling of bad parameters", () => {
      cy.apiAdminUpdate(superuser, "nonExistantUser", "write", HTTP_Forbidden, {
        message: "Could not find a user with a name",
      });
      cy.apiAdminUpdate(
        superuser,
        "gapUser1",
        "badPermission",
        HTTP_Unprocessable,
        { message: "body.permission: Invalid value" }
      );
    });
  } else {
    it.skip("Correct handling of bad parameters");
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Correct handling of bad parameters", () => {
      cy.apiAdminUpdate(superuser, "nonExistantUser", "write", HTTP_Forbidden, {
        message: "Could not find a user with a name",
      });
      cy.apiAdminUpdate(
        superuser,
        "gapUser1",
        "badPermission",
        HTTP_Unprocessable,
        { message: "body.permission: Invalid value" }
      );
    });
  } else {
    it.skip("Correct handling of bad parameters");
  }

  it("Non superuser cannot set global access", () => {
    cy.log("Cannot set global read");
    cy.apiAdminUpdate("gapUser1", "gapUser1", "read", HTTP_Forbidden, {
      message: "User is not an admin",
    });

    cy.log("Check cannot read globally");
    cy.apiDeviceInGroupCheck(
      "gapUser1",
      "gapCamera2",
      "gapGroup2",
      null,
      undefined,
      null,
      HTTP_Forbidden
    );
  });
});
