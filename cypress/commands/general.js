
Cypress.Commands.add("getApiPath", () => {
  createRouteToParseApiServer('**/endUserAgreement/**');
  cy.visit('');
});

Cypress.Commands.add("checkOnPage", (pageAddress) => {
  cy.location({timeout: 60000}).should((location) => {expect(location.pathname).to.equal(pageAddress);});
});

function createRouteToParseApiServer(urlpath) {
  cy.server();
  cy.route({
    method: 'GET',
    url: urlpath,
    onRequest: (xhr) => {
      const myURL = new URL(xhr.xhr.url);
      Cypress.config('cacophony-api-server', myURL.origin);
    }
  }).as('authenticate');
}
