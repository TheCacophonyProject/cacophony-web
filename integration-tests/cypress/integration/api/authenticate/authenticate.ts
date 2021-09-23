/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_AuthorizationError,
  HTTP_Forbidden,
} from "../../../commands/constants";
import { getTestName } from "../../../commands/names";

describe("Authentication", () => {
  const group1 = "first_group";
  const group2 = "second_group";
  const userA = "Alice";
  const userB = "Barbara";
  const camera1 = "first_camera";
  const camera2 = "second_camera";

  before(() => {
    cy.testCreateUserGroupAndDevice(userA, group1, camera1);
    cy.testCreateUserGroupAndDevice(userB, group2, camera2);
  });

  it("Can authenticate as a device", () => {
    cy.apiAuthenticateDevice(camera1, group1);
  });

  it("Device is correctly rejected if password is wrong", () => {
    cy.apiAuthenticateDevice(
      camera1,
      group1,
      "wrong-password",
      HTTP_AuthorizationError
    );
  });

  it("Device is correctly rejected if devicename is wrong", () => {
    cy.apiAuthenticateDevice(
      camera2,
      group1,
      "p" + getTestName(camera1),
        HTTP_AuthorizationError
    );
  });

  it("Device is correctly rejected if groupname is wrong", () => {
    cy.apiAuthenticateDevice(
      camera1,
      group2,
      "p" + getTestName(camera1),
        HTTP_AuthorizationError
    );
  });

  it("Can authenticate as a user using name", () => {
    cy.apiSignInAs(userA);
  });

  it("Can authenticate as a user using email", () => {
    cy.apiSignInAs(
      null,
      getTestName(userA) + "@api.created.com",
      null,
      "p" + getTestName(userA)
    );
  });

  it("Can authenticate as a user using nameoremail", () => {
    cy.log("test using email");
    cy.apiSignInAs(
      null,
      null,
      getTestName(userA) + "@api.created.com",
      "p" + getTestName(userA)
    );
    cy.log("test using name");
    cy.apiSignInAs(null, null, getTestName(userA), "p" + getTestName(userA));
  });

  it("User is rejected for wrong password", () => {
    cy.log("test using username & name");
    cy.apiSignInAs(userA, null, null, "bad_password", HTTP_AuthorizationError);
    cy.log("test using email and email");
    cy.apiSignInAs(
      null,
      getTestName(userA) + "@api.created.com",
      null,
      "bad_password",
      HTTP_AuthorizationError
    );
    cy.log("test using nameoremail and email");
    cy.apiSignInAs(
      null,
      null,
      getTestName(userA) + "@api.created.com",
      "bad_password",
      HTTP_AuthorizationError
    );
    cy.log("test using nameoremail and name");
    cy.apiSignInAs(
      null,
      null,
      getTestName(userA),
      "bad_password",
      HTTP_AuthorizationError
    );
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("test_using_default_superuser") == true) {
    it("Superuser can authenticate as another user and receive their permissions", () => {
      cy.apiSignInAs(null, null, "admin_test", "admin_test");
      cy.log("admin_test authenticates as Bruce");
      cy.apiAuthenticateAs("admin_test", userB);
      cy.log("verify each user gets their own data");
      cy.testGroupUserCheckAccess(userB + "_on_behalf", group2);
      cy.log("verify user cannot see items outside their group (i.e. are not super_user)");
      cy.testGroupUserCheckAccess(userB + "_on_behalf", group1, false);
    });
  } else {
    it.skip("Superuser can authenticate as another user and receive their permissions", () => {});
  }

  it("Non-superuser cannot authenticate as another user", () => {
    cy.apiSignInAs(userA);
    //verify non superuser userA cannot authenticte as userB
    cy.apiAuthenticateAs(userA, userB, HTTP_Forbidden);
  });

});
