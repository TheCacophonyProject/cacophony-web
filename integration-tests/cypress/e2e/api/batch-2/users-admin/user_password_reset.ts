import { getTestEmail } from "@commands/names";
import { HttpStatusCode } from "@typedefs/api/consts";
import {
  extractTokenStartingWith,
  RESET_PASSWORD_PREFIX,
  startMailServerStub,
  TestEmail,
  waitForEmail,
} from "@commands/emailUtils";
import { uniqueName } from "@commands/testUtils";

describe("User: password reset", () => {
  //Do not run against a live server as we don't have a stubbed email server
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(startMailServerStub);
    const user = "uprUser2";
    it("Can reset a password (legacy url)", () => {
      const address = getTestEmail(user);
      cy.log("Adding user with email address", address);
      cy.apiUserAdd(user, "password", address);
      waitForEmail(user, "New account email").then((_email) => {
        // Do nothing.
      });
      cy.log("Request a password reset");
      cy.apiResetPasswordLegacy(address, HttpStatusCode.Ok, {
        useRawUserName: true,
      });
      waitForEmail(user, "password reset").then((email: TestEmail) => {
        cy.log(email.body);
        expect(
          email.body.includes("token="),
          "Email contains reset token",
        ).to.equal(true);
        const { token } = extractTokenStartingWith(email, "token=");
        cy.log("reset password");
        cy.apiUserChangePassword(token, "password2");

        cy.log("Log in using new password");
        cy.apiSignInAs(null, address, "password2");

        cy.log("Cannot log in using old password");
        cy.apiSignInAs(null, address, null, HttpStatusCode.AuthorizationError);
      });
    });

    it("Can reset a password", () => {
      const user = uniqueName("user");
      cy.log("Adding user with email address", getTestEmail(user));
      cy.apiUserAdd(user, "password");
      waitForEmail(user, "New account email").then((_email) => {
        // Do nothing.
      });
      cy.log("Request a password reset");
      cy.apiResetPassword(user, HttpStatusCode.Ok);

      waitForEmail(user, "password reset").then((email: TestEmail) => {
        const { token } = extractTokenStartingWith(
          email,
          RESET_PASSWORD_PREFIX,
        );
        cy.log("reset password");
        cy.apiUserChangePassword(token, "password2");

        cy.log("Log in using new password");
        cy.apiSignInAs(null, getTestEmail(user), "password2");

        cy.log("Cannot log in using old password");
        cy.apiSignInAs(
          null,
          getTestEmail(user),
          "password",
          HttpStatusCode.AuthorizationError,
        );
      });
    });
  } else {
    it.skip("DISABLED (dev test only): Can reset a password");
  }
});
