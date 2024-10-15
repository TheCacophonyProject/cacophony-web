/// <reference path="../../../support/index.d.ts" />
import { getTestEmail, getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("Authentication", () => {
  const superuser = getCreds("superuser")["email"];
  const suPassword = getCreds("superuser")["password"];

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

  //TODO - write test for auth by deviceId (is what cameras use)
  it("Can authenticate using deviceId", () => {
    cy.apiAuthenticateDevice(camera1, group1, undefined, undefined, {
      useDeviceId: true,
    });
  });

  it("Can authenticate as a device", () => {
    cy.apiAuthenticateDevice(camera1, group1);
  });

  it("Device is correctly rejected if password is wrong", () => {
    cy.apiAuthenticateDevice(
      camera1,
      group1,
      "wrong-password",
      HttpStatusCode.AuthorizationError
    );
  });

  it("Device is correctly rejected if deviceName is wrong", () => {
    cy.apiAuthenticateDevice(
      camera2,
      group1,
      "p" + getTestName(camera1),
      HttpStatusCode.AuthorizationError
    );
  });

  it("Device is correctly rejected if groupName is wrong", () => {
    cy.apiAuthenticateDevice(
      camera1,
      group2,
      "p" + getTestName(camera1),
      HttpStatusCode.AuthorizationError
    );
  });

  it("Can authenticate as a user using email", () => {
    cy.apiSignInAs(null, getTestEmail(userA), "p" + getTestName(userA));
  });

  it("User is rejected for wrong password", () => {
    cy.log("test using email");
    cy.apiSignInAs(
      null,
      getTestEmail(userA),
      "bad_password",
      HttpStatusCode.AuthorizationError
    );
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Superuser can authenticate as another user and receive their permissions", () => {
      cy.apiSignInAs(null, superuser, suPassword);
      //superuser authenticates as Bruce
      cy.apiAuthenticateAs(superuser, userB);
      //verify each user gets their own data
      cy.testGroupUserCheckAccess(userB + "_on_behalf", group2);
      cy.log(
        "verify user cannot see items outside their group (i.e. are not super_user)"
      );
      cy.testGroupUserCheckAccess(userB + "_on_behalf", group1, false);
    });
  } else {
    it.skip("Superuser can authenticate as another user and receive their permissions", () => {});
  }

  it("Non-superuser cannot authenticate as another user", () => {
    cy.apiSignInAs(userA);
    //verify non superuser userA cannot authenticate as userB
    cy.apiAuthenticateAs(userA, userB, HttpStatusCode.Forbidden);
  });
});
