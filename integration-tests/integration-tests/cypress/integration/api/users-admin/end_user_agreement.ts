/// <reference path="../../../support/index.d.ts" />
import { LATEST_END_USER_AGREEMENT } from "@commands/constants";

describe("User: end user agreement", () => {
  before(() => {
    cy.apiUserAdd("euaUser1");
  });

  it("Retrieve latest end user greement", () => {
    cy.apiEUACheck(LATEST_END_USER_AGREEMENT);
  });
});
