declare namespace Cypress {
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
