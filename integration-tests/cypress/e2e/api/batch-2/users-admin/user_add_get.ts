import { LATEST_END_USER_AGREEMENT } from "@commands/constants";

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestEmail, getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("User: add, get", () => {
  const superuser = getCreds("superuser")["email"];
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
        email: getTestEmail("uaguser1"),
        firstName: null,
        lastName: null,
        globalPermission: "off",
        endUserAgreement: LATEST_END_USER_AGREEMENT,
      });
      cy.apiUserCheck("uagUser1", getTestEmail("uagUser1"), expectedUser);
    });
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user should see all users", () => {
      cy.apiSignInAs(null, superuser, suPassword);
      cy.log("Add first user");
      cy.apiUserAdd("uagUser2-1").then(() => {
        const expectedUser = TestCreateExpectedUser("uagUser2-1", {});
        cy.log("Query by name");
        cy.apiUserCheck(superuser, getTestEmail("uagUser2-1"), expectedUser);
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
      getTestEmail("uagUser3-2"),
      undefined,
      [],
      HttpStatusCode.Forbidden
    );
  });

  it("Can query user by either name or id", () => {
    cy.apiUserAdd("uagUser4-1").then(() => {
      const expectedUser = TestCreateExpectedUser("uagUser4-1", {});
      cy.log("Query by name");
      cy.apiUserCheck("uagUser4-1", getTestEmail("uagUser4-1"), expectedUser);
      cy.log("Query by id");
      cy.apiUserCheck(
        "uagUser4-1",
        getCreds("uagUser4-1").id.toString(),
        expectedUser,
        [],
        HttpStatusCode.Ok,
        { useRawUserName: true }
      );
    });
  });

  it("Register accepts all valid parameter values", () => {
    cy.log("end user agreement values");
    cy.apiUserAdd(
      "uagUser5-1",
      "uagPassword1",
      getTestEmail("uagUser5-1"),
      LATEST_END_USER_AGREEMENT
    ).then(() => {
      const expectedUser = TestCreateExpectedUser("uagUser5-1", {
        email: getTestEmail("uaguser5-1"),
        firstName: null,
        lastName: null,
        globalPermission: "off",
        endUserAgreement: LATEST_END_USER_AGREEMENT,
      });
      cy.apiUserCheck("uagUser5-1", getTestEmail("uagUser5-1"), expectedUser);
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
        HttpStatusCode.Unprocessable,
        { additionalParams: { firstName: "bob" } }
      );
      cy.apiUserCheck(
        "uagUser6",
        getTestEmail("uagUser6-1"),
        undefined,
        [],
        HttpStatusCode.Forbidden,
        { message: "Could not find a user with a name or id of" }
      );
    });
  });

  it("*Can* create user with same name (even with different case)", () => {
    cy.apiUserAdd("uagUser7").then(() => {
      cy.log("Add duplicate user");
      cy.apiUserAdd(
        "uagUser7",
        undefined,
        getTestEmail("firstEmail"),
        undefined,
        HttpStatusCode.Ok
      );
      cy.log("Add duplicate user (different case)");
      cy.apiUserAdd(
        "UAGUSER7",
        undefined,
        getTestEmail("secondEmail"),
        undefined,
        HttpStatusCode.Ok
      );
    });
  });

  it("Cannot create user with same email (even with different case)", () => {
    cy.apiUserAdd("uagUser8", "password", getTestEmail("user8")).then(() => {
      cy.log("Add duplicate email");
      cy.apiUserAdd(
        "uagUser8-1",
        "password",
        getTestEmail("user8"),
        undefined,
        HttpStatusCode.Unprocessable,
        { message: "Email address in use" }
      );
      cy.log("Add duplicate email (different case)");
      cy.apiUserAdd(
        "uagUser8-2",
        "password",
        getTestEmail("USER8").toUpperCase(),
        undefined,
        HttpStatusCode.Unprocessable,
        { message: "Email address in use" }
      );
    });
  });

  it("Cannot create user with email not matching email format", () => {
    cy.log("Blank email");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "",
      undefined,
      HttpStatusCode.Unprocessable,
      {
        message: "body.email: Invalid value",
      }
    );
    cy.log("leading space");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      " startwithspace@email.com",
      undefined,
      HttpStatusCode.Unprocessable,
      { message: "body.email: Invalid value" }
    );
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "noatinemail",
      undefined,
      HttpStatusCode.Unprocessable,
      { message: "body.email: Invalid value" }
    );
    cy.log("Email with no user");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "user@",
      undefined,
      HttpStatusCode.Unprocessable,
      { message: "body.email: Invalid value" }
    );
    cy.log("Email with no domain");
    cy.apiUserAdd(
      "uagUser8-1",
      "password",
      "@email.com",
      undefined,
      HttpStatusCode.Unprocessable,
      { message: "body.email: Invalid value" }
    );
  });

  it("Invalid user names rejected", () => {
    cy.log("Cannot add user with no letters");
    cy.apiUserAdd(
      "",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
        message: "'userName' is required",
      }
    );
    cy.apiUserAdd(
      "1234",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );
    cy.log("Cannot add user with other non-alphanumeric characters");
    cy.apiUserAdd(
      "ABC%",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );
    cy.apiUserAdd(
      "ABC&",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );
    cy.apiUserAdd(
      "ABC>",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );
    cy.apiUserAdd(
      "ABC<",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );

    cy.log("Cannot add user with -, _ or space as first letter");
    cy.apiUserAdd(
      "-ABC",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );
    cy.apiUserAdd(
      "_ABC",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );
    cy.apiUserAdd(
      " ABC",
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        useRawUserName: true,
      }
    );

    cy.log("Can add user with -, _ or space as subsequent letter");
    cy.apiUserAdd(
      "A-B_ C",
      undefined,
      getTestEmail("goodemail"),
      undefined,
      HttpStatusCode.Ok
    );
  });

  it("Invalid passwords rejected", () => {
    cy.log("Blank password");
    cy.apiUserAdd(
      "uagUser9-1",
      "",
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      {
        message: "Password must be at least 8 characters long",
      }
    );
    cy.log("Short password");
    cy.apiUserAdd(
      "uagUser9-1",
      "1234567",
      undefined,
      undefined,
      HttpStatusCode.Unprocessable,
      { message: "Password must be at least 8 characters long" }
    );
  });

  it("Invalid parameters in user get", () => {
    cy.apiUserAdd("uagUser11").then(() => {
      cy.log("Non existent userId");
      cy.apiUserCheck(
        "uagUser11",
        "9999999",
        undefined,
        [],
        HttpStatusCode.Forbidden,
        {
          useRawUserId: true,
        }
      );
      cy.log("Non existent username");
      cy.apiUserCheck(
        "uagUser11",
        getTestEmail("goodLookingUserName"),
        undefined,
        [],
        HttpStatusCode.Forbidden,
        { useRawUserId: true }
      );
    });
  });
});
