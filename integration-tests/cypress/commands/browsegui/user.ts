import { getTestName } from "../names";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Browser: Sign in using username and derived password
       */
      signInAs(userName: string): Chainable<Element>;

      /**
       * Browser: Register new user using supplied name & derived credentials
       */
      registerNewUserAs(userName: string): Chainable<Element>;

      /**
       * Browser: logout current user
       */
      logout(): Chainable<Element>;
    }
  }
}

const userMenu = ".dropdown.profile";

Cypress.Commands.add("signInAs", (username) => {
  const fullName = getTestName(username);
  const password = "p" + fullName;

  cy.visit("/");
  cy.get("[placeholder='Username or Email Address']").type(fullName);
  cy.get("[placeholder='Password']").type(password);
  cy.contains("Sign in").click();

  // check sign in worked
  cy.get(userMenu).should("contain", fullName);
});

Cypress.Commands.add("registerNewUserAs", (username) => {
  const fullName = getTestName(username);
  const password = "p" + fullName;

  cy.visit("");
  cy.contains("Register here").click();
  cy.contains("Username").siblings().find("input").type(fullName);
  cy.contains("Email")
    .siblings()
    .type(fullName + "@fake.address.com");
  cy.contains("Password").siblings().type(password);
  cy.contains("Retype password").siblings().type(password);
  cy.contains("I agree to the terms").click();
  cy.get("button").contains("Register").click();
  cy.location({ timeout: 60000 }).should((location) => {
    expect(location.pathname).to.equal("/");
  });

  cy.get(".dropdown.profile").should("contain", fullName);
});

Cypress.Commands.add("logout", () => {
  cy.get(userMenu).click();
  cy.get(userMenu).contains("Logout").click();
});
