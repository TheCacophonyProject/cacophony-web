context('Register as new user', () => {
  const username = "new";

  it('Check a user can register, and sign in again, and the welcome screen is correct', () => {
    cy.registerNewUserAs(username);

    // log out
    cy.logout();

    cy.signInAs(username);

    // check what it looks like for new user
    cy.contains("It looks like you're new here").should('be.visible') ;

    // check are guided to join a group
    cy.contains("Join a group").should('be.visible') ;

    // check there is a button to create a group
    cy.contains('Setting up your own device?').parent().contains('Create a group').click();
    cy.location({timeout: 60000}).should((location) => {expect(location.pathname).to.equal('/groups');});
  });
});
