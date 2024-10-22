declare namespace Cypress {
  interface Chainable {
    /**
     * Browser: Load a page, verify loads
     */
    checkOnPage(upageAddress: string): Chainable<Element>;
  }
}
