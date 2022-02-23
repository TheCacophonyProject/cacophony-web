Cypress.Commands.add("checkOnPage", (pageAddress) => {
  cy.location({ timeout: 60000 }).should((location) => {
    expect(location.pathname).to.equal(pageAddress);
  });
});
