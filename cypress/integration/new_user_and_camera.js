context('New User', () => {
  const username = "integration";
  const group = 'int-test';
  const camera = 'int-test';

  it('A new user can create an account, and a group', () => {
    cy.registerNewUserAs(username);

    cy.contains("Create a group").click();
    cy.createGroup(group);

    // create a camera in the group
    cy.createCamera(camera, group);

    // check that user can see camera
    cy.visit('devices');
    cy.contains(camera);
  });
});
