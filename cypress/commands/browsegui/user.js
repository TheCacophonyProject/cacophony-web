require("url");
const names = require("../names");

const userMenu = '.dropdown.profile';

Cypress.Commands.add("signInAs", (username) => {
  const fullName = names.getTestName(username);
  const password = 'p' + fullName;

  cy.visit('');
  cy.get("[placeholder='Username or Email Address']").type(fullName);
  cy.get("[placeholder='Password']").type(password);
  cy.contains("Sign in").click();

  // check sign in worked
  cy.get(userMenu).should('contain', fullName);

});

Cypress.Commands.add("registerNewUserAs", (username) => {
  const fullName = names.getTestName(username);
  const password = 'p' + fullName;

  cy.visit('');
  cy.contains("Register here").click();
  cy.contains("Username").siblings().find("input").type(fullName);
  cy.contains("Email").siblings().type(fullName + "@fake.address.com");
  cy.contains("Password").siblings().type(password);
  cy.contains("Retype password").siblings().type(password);
  cy.contains("I agree to the terms").click();
  cy.get("button").contains("Register").click();
  cy.location({timeout: 60000}).should((location) => {expect(location.pathname).to.equal('/');});

  cy.get('.dropdown.profile').should('contain', fullName);
});

Cypress.Commands.add("onBeforeSignInAsOrRegister", (username) => {
  if (typeof Cypress.config('cacophony-api-server') === 'undefined') {
    // first time for test.   Need to register user
    cy.registerNewUserAs(username);
  }
  else {
    cy.signInAs(username);
  }
});

Cypress.Commands.add('logout', () => {
  cy.get(userMenu).click();
  cy.get(userMenu).contains("Logout").click();
});
