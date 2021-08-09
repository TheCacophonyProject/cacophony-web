// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
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
      admin?: boolean
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
