declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Browser: Load a page, verify loads
       */
      checkOnPage(pageAddress: string): Chainable<Element>;
    }
  }
}

Cypress.Commands.add("checkOnPage", (pageAddress) => {
  cy.location({ timeout: 60000 }).should((location) => {
    expect(location.pathname).to.equal(pageAddress);
  });
});
