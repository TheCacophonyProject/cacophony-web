/// <reference path="../../../support/index.d.ts" />
import { HTTP_BadRequest, HTTP_Unprocessable } from "@commands/constants";

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";

describe("User: update", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  before(() => {});

  it("User can update themselves", () => {
    cy.log("Create user");
    cy.apiUserAdd("uupUser1");

    cy.log("Update user");
    cy.apiUserUpdate("uupUser1", {
      userName: "uupUser1b",
      password: "password2",
      email: getTestName("uupUser1b") + "@mail.com",
      endUserAgreement: 1,
    }).then(() => {
      const expectedUser = TestCreateExpectedUser("uupUser1b", {
        email: getTestName("uupuser1b") + "@mail.com",
        endUserAgreement: 1,
      });
      //check user's details
      cy.apiUserCheck("uupUser1b", getTestName("uupUser1b"), expectedUser);
      //log in again to verify new password
      cy.apiSignInAs(null, null, getTestName("uupUser1b"), "password2");
    });
  });

  it("Update params are optional", () => {
    cy.log("Create user");
    cy.apiUserAdd("uupUser2", "password1");
    cy.log("Update end user agreement values");
    cy.apiUserUpdate("uupUser2", {
      endUserAgreement: 1,
    }).then(() => {
      const expectedUser = TestCreateExpectedUser("uupUser2", {
        endUserAgreement: 1,
      });
      //check user's details
      cy.apiUserCheck("uupUser2", getTestName("uupUser2"), expectedUser);
      //log in again to verify old password still valid
      cy.apiSignInAs(null, null, getTestName("uupUser2"), "password1");

      cy.log("Update password");
      cy.apiUserUpdate("uupUser2", {
        password: "password2",
      }).then(() => {
        //check user's details
        cy.apiUserCheck("uupUser2", getTestName("uupUser2"), expectedUser);
        //log in again to verify new password
        cy.apiSignInAs(null, null, getTestName("uupUser2"), "password2");

        cy.log("Update email");
        cy.apiUserUpdate("uupUser2", {
          email: getTestName("uupUser2b") + "@mail.com",
        }).then(() => {
          const expectedUser2 = TestCreateExpectedUser("uupUser2", {
            email: getTestName("uupuser2b") + "@mail.com",
            endUserAgreement: 1,
          });
          //check user's details
          cy.apiUserCheck("uupUser2", getTestName("uupUser2"), expectedUser2);
          //log in again to verify new password
          cy.apiSignInAs(null, null, getTestName("uupUser2"), "password2");

          cy.log("Update userName");

          cy.apiUserUpdate("uupUser2", {
            userName: "uupUser2b",
          }).then(() => {
            const expectedUser3 = TestCreateExpectedUser("uupUser2b", {
              email: getTestName("uupuser2b") + "@mail.com",
              endUserAgreement: 1,
            });
            //check user's details
            cy.apiUserCheck(
              "uupUser2b",
              getTestName("uupUser2b"),
              expectedUser3
            );
            //log in again to verify new password
            cy.apiSignInAs(null, null, getTestName("uupUser2b"), "password2");
          });
        });
      });
    });
  });

  it("Invalid parameters in user update", () => {
    cy.apiUserAdd("uupUser3").then(() => {
      cy.log("Unsupported: firstName");
      cy.apiUserUpdate("uupUser3", { firstName: "bob" }, HTTP_Unprocessable, {
        message: "Unknown fields found",
      });
    });
  });

  it("Cannot create user with same name (even with different case)", () => {
    cy.apiUserAdd("uupUser4a");
    cy.apiUserAdd("uupUser4b").then(() => {
      cy.log("Rename to duplicate user");
      cy.apiUserUpdate(
        "uupUser4b",
        { userName: "uupUser4a" },
        HTTP_BadRequest,
        { message: "Username in use" }
      );
      cy.apiUserUpdate(
        "uupUser4b",
        { userName: "UUPUSER4A" },
        HTTP_BadRequest,
        { message: "Username in use" }
      );
    });
  });

  it("Cannot create user with same email (even with different case)", () => {
    cy.apiUserAdd("uupUser5a");
    cy.apiUserAdd("uupUser5b").then(() => {
      cy.log("Change to duplicate email");
      cy.apiUserUpdate(
        "uupUser5b",
        { email: getTestName("uupUser5a") + "@api.created.com" },
        HTTP_BadRequest,
        { message: "Email address in use" }
      );
      cy.apiUserUpdate(
        "uupUser5b",
        { email: getTestName("UUPUSER5A") + "@api.created.com" },
        HTTP_BadRequest,
        { message: "Email address in use" }
      );
    });
  });

  //TODO:  Issue ##: Wrong error message
  it("Cannot create user with email not matching email format", () => {
    cy.apiUserAdd("uupUser6").then(() => {
      cy.log("Blank email");
      cy.apiUserUpdate("uupUser6", { email: "" }, HTTP_Unprocessable); //HTTP_BadRequest, { message: "body.email: Invalid value" });
      cy.log("leading space");
      cy.apiUserUpdate(
        "uupUser6",
        { email: " startswithaspace@email.com" },
        HTTP_Unprocessable
      ); //HTTP_BadRequest, { message: "body.email: Invalid value" });
      cy.log("Email with no @");
      cy.apiUserUpdate(
        "uupUser6",
        { email: "noatinemail" },
        HTTP_Unprocessable
      ); // HTTP_BadRequest, { message: "body.email: Invalid value" });
      cy.log("Email with no user");
      cy.apiUserUpdate("uupUser6", { email: "@mail.com" }, HTTP_Unprocessable); // HTTP_BadRequest, { message: "body.email: Invalid value" });
      cy.log("Email with no domain");
      cy.apiUserUpdate("uupUser6", { email: "user@" }, HTTP_Unprocessable); // HTTP_BadRequest, { message: "body.email: Invalid value" });
    });
  });

  //TODO: Issue ##:  Wrong error message
  it("Invalid user names rejected", () => {
    cy.apiUserAdd("uupUser7").then(() => {
      cy.log("Cannot add user with no letters");
      cy.apiUserUpdate("uupUser7", { userName: "" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { useRawUserName: true });
      // message: "body.userName  : Invalid value"
      cy.apiUserUpdate("uupUser7", { userName: "1234" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.log("Cannot add user with other non-alphanumeric characters");
      cy.apiUserUpdate("uupUser7", { userName: "ABC%" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.apiUserUpdate("uupUser7", { userName: "ABC&" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.apiUserUpdate("uupUser7", { userName: "ABC>" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.apiUserUpdate("uupUser7", { userName: "ABC<" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });

      cy.log("Cannot add user with -, _ or space as first letter");
      cy.apiUserUpdate("uupUser7", { userName: "-ABC" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.apiUserUpdate("uupUser7", { userName: "_ABC" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.apiUserUpdate("uupUser7", { userName: " ABC" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });
      cy.apiUserUpdate("uupUser7", { userName: " ABC" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { message: "body.userName: Invalid value", useRawUserName: true });

      cy.log("Can add user with -, _ or space as subsequent letter");
      cy.apiUserUpdate("uupUser7", { userName: getTestName("A-B_ C") });
    });
  });

  //TODO: Issue ##:  Wrong error message
  it("Invaliid passwords rejected", () => {
    cy.apiUserAdd("uupUser8").then(() => {
      cy.log("Blank password");
      cy.apiUserUpdate("uupUser7", { password: "" }, HTTP_Unprocessable, {
        useRawUserName: true,
      }); // HTTP_BadRequest, { useRawUserName: true });
      cy.log("Short password");
      cy.apiUserUpdate(
        "uupUser7",
        { password: "1234567" },
        HTTP_Unprocessable,
        { useRawUserName: true }
      ); // HTTP_BadRequest, { useRawUserName: true });
    });
  });
});
