/// <reference path="../../../support/index.d.ts" />
import {
  LATEST_END_USER_AGREEMENT
} from "@commands/constants";

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import {HTTP_Forbidden, HTTP_OK200, HTTP_Unprocessable} from "@typedefs/api/consts";

describe("User: add, get", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  before(() => {});

  it("Can register a new user, user can view themselves", () => {
    cy.apiUserAdd(
      "uagUser1",
      "uagPassword1",
      getTestName("uagUser1") + "@api.created.com",
      LATEST_END_USER_AGREEMENT
    ).then(() => {
      const expectedUser = TestCreateExpectedUser("uagUser1", {
        email: getTestName("uaguser1") + "@api.created.com",
        firstName: null,
        lastName: null,
        globalPermission: "off",
        endUserAgreement: LATEST_END_USER_AGREEMENT,
      });
      cy.apiUserCheck("uagUser1", getTestName("uagUser1"), expectedUser);
    });
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user should see all users", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);
      cy.log("Add first user");
      cy.apiUserAdd("uagUser2-1").then(() => {
        const expectedUser = TestCreateExpectedUser("uagUser2-1", {});
        cy.log("Query by name");
        cy.apiUserCheck(superuser, getTestName("uagUser2-1"), expectedUser);
      });
    });
  } else {
    it.skip("Super-user should see all users");
  }

  //ISSUE ##: Can view any user's data
  it.skip("User cannot view another user", () => {
    cy.log("Add first user");
    cy.apiUserAdd("uagUser3-1");

    cy.log("Add second user");
    cy.apiUserAdd("uagUser3-2");
    cy.apiUserCheck(
      "uagUser3-1",
      getTestName("uagUser3-2"),
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Can query user by either name or id", () => {
    cy.apiUserAdd("uagUser4-1").then(() => {
      const expectedUser = TestCreateExpectedUser("uagUser4-1", {});
      cy.log("Query by name");
      cy.apiUserCheck("uagUser4-1", getTestName("uagUser4-1"), expectedUser);
      cy.log("Query by id");
      cy.apiUserCheck(
        "uagUser4-1",
        getCreds("uagUser4-1").id.toString(),
        expectedUser,
        [],
        HTTP_OK200,
        { useRawUserName: true }
      );
    });
  });

  it("Register accepts all valid parameter values", () => {
    cy.log("end user agreement values");
    cy.apiUserAdd(
      "uagUser5-1",
      "uagPassword1",
      getTestName("uagUser5-1") + "@api.created.com",
      LATEST_END_USER_AGREEMENT
    ).then(() => {
      const expectedUser = TestCreateExpectedUser("uagUser5-1", {
        email: getTestName("uaguser5-1") + "@api.created.com",
        firstName: null,
        lastName: null,
        globalPermission: "off",
        endUserAgreement: LATEST_END_USER_AGREEMENT,
      });
      cy.apiUserCheck("uagUser5-1", getTestName("uagUser5-1"), expectedUser);
    });
  });

  it("Invalid parameters in user registration", () => {
    cy.apiUserAdd("uagUser6").then(() => {
      cy.log("Unsupported: firstName");
      cy.apiUserAdd(
        "uagUser6-1",
        undefined,
        undefined,
        undefined,
        HTTP_Unprocessable,
        { additionalParams: { firstName: "bob" } }
      );
      cy.apiUserCheck(
        "uagUser6",
        getTestName("uagUser6-1"),
        undefined,
        [],
        HTTP_Forbidden,
        { message: "Could not find a user with a name or id of" }
      );
    });
  });

  it("Cannot create user with same name (even with different case)", () => {
    cy.apiUserAdd("uagUser7").then(() => {
      cy.log("Add duplicate user");
      cy.apiUserAdd(
        "uagUser7",
        undefined,
        getTestName("firstEmail") + "@email.com",
        undefined,
        HTTP_Unprocessable,
        { message: "Username in use" }
      );
      cy.log("Add duplicate user (different case)");
      cy.apiUserAdd(
        "UAGUSER7",
        undefined,
        getTestName("secondEmail") + "@email.com",
        undefined,
        HTTP_Unprocessable,
        { message: "Username in use" }
      );
    });
  });

  it("Cannot create user with same email (even with different case)", () => {
    cy.apiUserAdd(
      "uagUser8",
      "password",
      getTestName("user8") + "@user.com"
    ).then(() => {
      cy.log("Add duplicate email");
      cy.apiUserAdd(
        "uagUser8-1",
        "password",
        getTestName("user8") + "@user.com",
        undefined,
        HTTP_Unprocessable,
        { message: "Email address in use" }
      );
      cy.log("Add duplicate email (different case)");
      cy.apiUserAdd(
        "uagUser8-2",
        "password",
        getTestName("USER8") + "@USER.COM",
        undefined,
        HTTP_Unprocessable,
        { message: "Email address in use" }
      );
    });
  });

  it("Cannot create user with email not matching email format", () => {
    cy.log("Blank email");
    cy.apiUserAdd("uagUser8-1", "password", "", undefined, HTTP_Unprocessable, {
      message: "body.email: Invalid value",
    });
    cy.log("leading space");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      " startwithspace@email.com",
      undefined,
      HTTP_Unprocessable,
      { message: "body.email: Invalid value" }
    );
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "noatinemail",
      undefined,
      HTTP_Unprocessable,
      { message: "body.email: Invalid value" }
    );
    cy.log("Email with no user");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "user@",
      undefined,
      HTTP_Unprocessable,
      { message: "body.email: Invalid value" }
    );
    cy.log("Email with no domain");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "@email.com",
      undefined,
      HTTP_Unprocessable,
      { message: "body.email: Invalid value" }
    );
  });

  it("Invalid user names rejected", () => {
    cy.log("Cannot add user with no letters");
    cy.apiUserAdd("", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
      message: "'userName' is required",
    });
    cy.apiUserAdd("1234", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });
    cy.log("Cannot add user with other non-alphanumeric characters");
    cy.apiUserAdd("ABC%", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });
    cy.apiUserAdd("ABC&", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });
    cy.apiUserAdd("ABC>", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });
    cy.apiUserAdd("ABC<", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });

    cy.log("Cannot add user with -, _ or space as first letter");
    cy.apiUserAdd("-ABC", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });
    cy.apiUserAdd("_ABC", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });
    cy.apiUserAdd(" ABC", undefined, undefined, undefined, HTTP_Unprocessable, {
      useRawUserName: true,
    });

    cy.log("Can add user with -, _ or space as subsequent letter");
    cy.apiUserAdd(
      "A-B_ C",
      undefined,
      getTestName("goodemail") + "@email.com",
      undefined,
      HTTP_OK200
    );
  });

  it("Invaliid passwords rejected", () => {
    cy.log("Blank password");
    cy.apiUserAdd("uagUser9-1", "", undefined, undefined, HTTP_Unprocessable, {
      message: "Password must be at least 8 characters long",
    });
    cy.log("Short password");
    cy.apiUserAdd(
      "uagUser9-1",
      "1234567",
      undefined,
      undefined,
      HTTP_Unprocessable,
      { message: "Password must be at least 8 characters long" }
    );
  });

  it("Invalid parameters in user get", () => {
    cy.apiUserAdd("uagUser11").then(() => {
      cy.log("Non existant userId");
      cy.apiUserCheck("uagUser11", "9999999", undefined, [], HTTP_Forbidden, {
        useRawUserId: true,
      });
      cy.log("Non existant username");
      cy.apiUserCheck(
        "uagUser11",
        "goodLookingUserName",
        undefined,
        [],
        HTTP_Forbidden,
        { useRawUserId: true }
      );
    });
  });
});
