
const crypto = require("crypto");

context('New User', () => {
  const uniqueId =  crypto.randomBytes(2).toString('hex');
  const username = "integrationtester"  +  uniqueId;
  const password = 'p' + username;
  const group = 'test' + uniqueId;

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
    cy.get("button").contains("Register").click();

    // create new group
    cy.location({timeout: 60000}).should((location) => {expect(location.pathname).to.equal('/');});
    cy.contains("It looks like you're new here");
    cy.contains("Create a group").click();
    cy.contains("Group name").parent().type(group);
    cy.contains("Create new group").click();

    // check new group is created properly
    cy.location({timeout: 60000}).should((location) => {expect(location.pathname).contains(group);});
    cy.contains('Group: ' + group);
    // user is an administrator for group
  });

  it('New user can sign in and create a group', () => {
    cy.signin(username, password);
  });
});


