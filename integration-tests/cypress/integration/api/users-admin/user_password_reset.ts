/// <reference path="../../../support/index.d.ts" />
import { HTTP_AuthorizationError } from "@commands/constants";

import { TestCreateExpectedUser } from "@commands/api/user";

import { getTestName } from "@commands/names";
import { getCreds, testRunOnApi } from "@commands/server";

describe("User: password reset", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  before(() => {
    //  cy.exec(`cd ../api && docker-compose exec -T server bash -lic "rm mailServerStub.log || true;"`);
    cy.exec(
      `cd ../api && docker-compose exec -d -T server bash -lic "node api/scripts/mailServerStub.js"`
    );
    cy.exec(
      `cd ../api && docker-compose exec -T server bash -lic "until [ -f mailServerStub.log ]; do sleep 1; done;"`
    );
  });

  //Do not run against a live server as we don't have a stubbed email server
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Can reset a password", () => {
      //clear mailserver log
      cy.exec(
        `cd ../api && docker-compose exec -T server bash -lic "echo "" > mailServerStub.log;"`
      );
      const address =
        "uprUser2" + getTestName("").substring(4, 12) + "@test.com";
      cy.apiUserAdd("uprUser2", "password", address);

      cy.log("Request a password reset");
      cy.apiResetPassword("uprUser2");

      cy.log("wait for a password reset email");
      cy.exec(
        `cd ../api && docker-compose exec -T server bash -lic "until grep -q 'SERVER: received email' mailServerStub.log ; do sleep 1; done; cat mailServerStub.log;"`
      ).then((response) => {
        expect(response.stdout, "Received an email").to.include(
          "SERVER: received email"
        );
        expect(response.stdout, "Email contains reset token").to.include(
          "token="
        );
        const tokenstring = response.stdout
          .match(/token=[A-Za-z0-9._-]*/)
          .toString();
        const token = tokenstring.substring(6);

        cy.log("reset password");
        cy.apiUserChangePassword(token, "password2");

        cy.log("Log in using new password");
        cy.apiSignInAs("uprUser2", null, null, "password2");

        cy.log("Cannot log in using old password");
        cy.apiSignInAs("uprUser2", null, null, null, HTTP_AuthorizationError);
      });
    });
  } else {
    it("DISABLED (dev test only): Can reset a password");
  }
});
