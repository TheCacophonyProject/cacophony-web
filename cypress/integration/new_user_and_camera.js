
const crypto = require("crypto");

context('New User', () => {
  const uniqueId =  crypto.randomBytes(2).toString('hex');
  const username = "integrationtester"  +  uniqueId;
  const password = 'p' + username;
  const group = 'test' + uniqueId;
  const camera = 'fake-' + group;

  beforeEach(() => {
    cy.visit('');
  });

  it('A new user can create an account, and a group', () => {
    // create account
    cy.contains("Register here").click();
    cy.contains("Username").siblings().find("input").type(username);
    cy.contains("Email").siblings().type(username + "@fake.address.com");
    cy.contains("Password").siblings().type(password);
    cy.contains("Retype password").siblings().type(password);
    cy.contains("I agree to the terms").click();
    cy.get("button").contains("Register").click();
    cy.location({timeout: 60000}).should((location) => {expect(location.pathname).to.equal('/');});

    // create new group
    cy.contains("It looks like you're new here");
    cy.contains("Create a group").click();
    cy.contains("Your groups");
    cy.contains("Create group").click();
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);  // not ideal but popup is causing problems.  To fix later
    cy.contains("Group name").parent().type(group);
    cy.contains("Group name").parent().type('{enter}');

    // check new group is created properly
    cy.location({timeout: 60000}).should((location) => {expect(location.pathname).contains(group);});
    cy.contains(group);
    // user is an administrator for group - this can be done in web tests.

    // create a camera in the group
    cy.request("http://localhost:2040/create/" + camera + "?group-name=" + group);

    // check that user can see camera
    cy.visit('devices');
    cy.contains(camera);
  });
});
