import { getTestName } from "../names";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Browser: create group with given name (plus prefix)
       */
      createGroup(group: string): Chainable<Element>;

      /**
       * Browser: Navigate to groups page
       */
      checkOnGroupPage(): Chainable<Element>;

      /**
       * Browser: Add user to group optionally as an admin
       */
      addUserToGroup(
        userName: string,
        groupname: string,
        admin?: boolean,
      ): Chainable<Element>;

      /**
       * Browser: Navigate to specific group page
       */
      goToGroupPage(group: string): Chainable<Element>;

      /**
       * Browser: Verify group contains specific device
       */
      checkDeviceInGroup(device: string, group: string): Chainable<Element>;
    }
  }
}

Cypress.Commands.add("createGroup", (group) => {
  const fullGroupName = getTestName(group);

  cy.checkOnGroupPage();
  cy.contains("Your groups");
  cy.contains("Create group").click();
  // eslint-disable-next-line cypress/no-unnecessary-waiting
  cy.wait(1000); // not ideal but popup is causing problems.  To fix later
  cy.contains("Group name").parent().type(fullGroupName);
  cy.contains("Group name").parent().type("{enter}");
  // check new group is created properly
  cy.location({ timeout: 60000 }).should((location) => {
    expect(location.pathname).contains(fullGroupName);
  });
  cy.get("h1").contains(fullGroupName);
});

Cypress.Commands.add("checkOnGroupPage", () => {
  cy.checkOnPage("/groups");
});

Cypress.Commands.add("addUserToGroup", (userName, groupName, admin = false) => {
  const fullUserName = getTestName(userName);

  goToGroupPage(groupName);
  cy.contains("Add user").click();

  cy.get('form[data-cy="add-user-form"]').as("adduser");
  // eslint-disable-next-line cypress/no-unnecessary-waiting
  cy.wait(1000); // not ideal but popup is causing problems.  To fix later
  cy.get("@adduser").get('[data-cy="user-name-input').as("usernameInput");
  cy.get("@usernameInput").type(fullUserName);
  if (admin) {
    cy.get("@adduser").contains("Make this user an administrator").click();
  }
  cy.get(".modal-dialog button.btn-primary").should("have.text", "Add").click();

  cy.checkOnPage("/groups/" + getTestName(groupName));
});

function goToGroupPage(groupName) {
  const fullGroupName = getTestName(groupName);
  cy.visit("/groups/" + fullGroupName);
  cy.get("h1").contains(fullGroupName);
}

Cypress.Commands.add("checkDeviceInGroup", (device, group) => {
  goToGroupPage(group);
  cy.get('[data-cy="devices-table"]').should("contain", getTestName(device));
});
