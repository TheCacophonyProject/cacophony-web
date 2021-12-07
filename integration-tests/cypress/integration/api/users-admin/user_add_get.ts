/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_OK200,
  HTTP_BadRequest,
  NOT_NULL_STRING,
  LATEST_END_USER_AGREEMENT
} from "@commands/constants";

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";

const EXCLUDE_IDS = [
  "[].id",
];

describe("User: add, get", () => {

  before(() => {
  });

  it("Can register a new user, user can view themselves", () => {
    cy.apiUserAdd("uagUser1", "uagPassword1", "p"+getTestName("uagUser1")+"@api.created.com", LATEST_END_USER_AGREEMENT).then(() => {
      const expectedUser=TestCreateExpectedUser("uagUser1", { email: "p"+getTestName("uaguser1")+"@api.created.com", firstName: null, lastName: null, globalPermission: "off", endUserAgreement: LATEST_END_USER_AGREEMENT });
      cy.apiUserCheck("uagUser1", getTestName("uagUser1"), expectedUser);
    });
  });

  it.skip("Admin can view any user", () => {
  });

  //ISSUE ##: Can view any user's data
  it.skip("User cannot view another user", () => {
    cy.log("Add first user");
    cy.apiUserAdd("uagUser3-1");

    cy.log("Add second user");
    cy.apiUserAdd("uagUser3-2");
    cy.apiUserCheck("uagUser3-1", getTestName("uagUser3-2"), undefined, [], HTTP_Forbidden);
  });

  //ISSUE ##: userNameOrId does not accept ID
  it.skip("Can query user by either name or id", () => {
    cy.apiUserAdd("uagUser4-1").then(() => {
      const expectedUser=TestCreateExpectedUser("uagUser4-1", {});
      cy.log("Query by name");
      cy.apiUserCheck("uagUser4-1", getTestName("uagUser4-1"), expectedUser);
      cy.log("Query by id");
      cy.apiUserCheck("uagUser4-1", getCreds("uagUser4-1").id.toString(), expectedUser,[],HTTP_OK200, {useRawUserName: true});
    });
  });

  it("Register accepts all valid parameter values", () => {
    cy.log("end user agreement");
    cy.apiUserAdd("uagUser5-1", "uagPassword1", "p"+getTestName("uagUser5-1")+"@api.created.com", 1).then(() => {
      const expectedUser=TestCreateExpectedUser("uagUser5-1", { email: "p"+getTestName("uaguser5-1")+"@api.created.com", firstName: null, lastName: null, globalPermission: "off", endUserAgreement: 1 });
      cy.apiUserCheck("uagUser5-1", getTestName("uagUser5-1"), expectedUser);
    });

    cy.log("firstName");
    cy.apiUserAdd("uagUser5-2", undefined, undefined, undefined, undefined, {additionalParams: {firstName: "bob"}}).then(() => {
      const expectedUser=TestCreateExpectedUser("uagUser5-2", { firstName: "bob" });
      cy.apiUserCheck("uagUser5-2", getTestName("uagUser5-2"), expectedUser);
    });
 
  });

  it.skip("Duplicate parameters in user registration");

  it.skip("Invalid parameters in user registration");

  it.skip("Invalid parameters in user get");


});

