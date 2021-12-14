/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_OK200,
} from "@commands/constants";


import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";

import { ApiUserResponse } from "@typedefs/api/user";


const expectedUser1={} as ApiUserResponse;
const expectedUser2={} as ApiUserResponse;
const expectedUser3={} as ApiUserResponse;

describe("User: list", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];


  before(() => {
      cy.apiUserAdd("uliUser1").then(() => {
        expectedUser1.id=getCreds("uliUser1").id;
        expectedUser1.userName=getTestName("uliUser1");
      });
      cy.apiUserAdd("uliUser2").then(() => {
        expectedUser2.id=getCreds("uliUser2").id;
        expectedUser2.userName=getTestName("uliUser2");
      });
      cy.apiUserAdd("uliUser3").then(() => {
        expectedUser3.id=getCreds("uliUser3").id;
        expectedUser3.userName=getTestName("uliUser3");
      });
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user should see all users", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);
      cy.apiUsersCheck(superuser, [expectedUser1, expectedUser2, expectedUser3],[],HTTP_OK200, { contains: true });
    });
  } else {
    it.skip("Super-user should see all users");
  }

  it("Non-superuser cannot view users list", () => {
    cy.apiUsersCheck("uliUser1", [], [], HTTP_Forbidden);
  });

});

