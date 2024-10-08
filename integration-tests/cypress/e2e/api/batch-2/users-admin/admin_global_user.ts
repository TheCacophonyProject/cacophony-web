/// <reference path="../../../support/index.d.ts" />

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestEmail, getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import { DeviceType, HttpStatusCode } from "@typedefs/api/consts";

describe("User: manage global access permissions", () => {
  const superuser = getCreds("superuser")["email"];
  const suPassword = getCreds("superuser")["password"];
  let expectedDevice2: ApiDeviceResponse;

  before(() => {
    cy.apiSignInAs(null, superuser, suPassword);
    cy.testCreateUserGroupAndDevice("gapUser1", "gapGroup1", "gapCamera1");
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
          isHealthy: false,
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
        cy.apiUserCheck("gapUser1", getTestEmail("gapUser1"), expectedUser);

        cy.log("Check can read globally");
        cy.apiDeviceInGroupCheck(
          "gapUser1",
          "gapCamera2",
          "gapGroup2",
          null,
          expectedDevice2
        );

        cy.log("Cannot elevate own permisssions");
        cy.apiAdminUpdate(
          "gapUser1",
          "gapUser1",
          "write",
          HttpStatusCode.Forbidden
        );

        cy.log("Check cannot write globally");
        cy.apiGroupUserAdd(
          "gapUser1",
          "gapUser3",
          "gapGroup2",
          false,
          false,
          false,
          HttpStatusCode.Forbidden
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
            HttpStatusCode.Forbidden
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
        cy.apiUserCheck("gapUser1", getTestEmail("gapUser1"), expectedUser);

        cy.log("Check can read globally");
        cy.apiDeviceInGroupCheck(
          "gapUser1",
          "gapCamera2",
          "gapGroup2",
          null,
          expectedDevice2
        );

        cy.log("Check can write globally");
        cy.apiGroupUserAdd("gapUser1", "gapUser3", "gapGroup2", false, false);
        cy.apiGroupUserRemove("gapUser1", "gapUser3", "gapGroup2");

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
            HttpStatusCode.Forbidden
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
        HttpStatusCode.Ok,
        { useRawUserName: true }
      ).then(() => {
        cy.log("Check can write globally");
        cy.apiGroupUserAdd("gapUser1", "gapUser3", "gapGroup2", false, false);
        cy.apiGroupUserRemove("gapUser1", "gapUser3", "gapGroup2");

        cy.log("Set back to default (off)");
        cy.apiAdminUpdate(
          superuser,
          getCreds("gapUser1").id.toString(),
          "off",
          HttpStatusCode.Ok,
          { useRawUserName: true }
        );
      });
    });
  } else {
    it.skip("Super-user can set global write access");
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Correct handling of bad parameters", () => {
      cy.apiAdminUpdate(
        superuser,
        "nonExistantUser",
        "write",
        HttpStatusCode.Forbidden,
        {
          message: "Could not find a user with a name",
        }
      );
      cy.apiAdminUpdate(
        superuser,
        "gapUser1",
        "badPermission",
        HttpStatusCode.Unprocessable,
        { message: "body.permission: Invalid value" }
      );
    });
  } else {
    it.skip("Correct handling of bad parameters");
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Correct handling of bad parameters", () => {
      cy.apiAdminUpdate(
        superuser,
        "nonExistantUser",
        "write",
        HttpStatusCode.Forbidden,
        {
          message: "Could not find a user with a name",
        }
      );
      cy.apiAdminUpdate(
        superuser,
        "gapUser1",
        "badPermission",
        HttpStatusCode.Unprocessable,
        { message: "body.permission: Invalid value" }
      );
    });
  } else {
    it.skip("Correct handling of bad parameters");
  }

  it("Non superuser cannot set global access", () => {
    cy.log("Cannot set global read");
    cy.apiAdminUpdate(
      "gapUser1",
      "gapUser1",
      "read",
      HttpStatusCode.Forbidden,
      {
        message: "User is not an admin",
      }
    );

    cy.log("Check cannot read globally");
    cy.apiDeviceInGroupCheck(
      "gapUser1",
      "gapCamera2",
      "gapGroup2",
      null,
      undefined,
      null,
      HttpStatusCode.Forbidden
    );
  });
});
