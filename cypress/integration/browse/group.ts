/// <reference path="../../support/index.d.ts" />

//const names = require("../../commands/names");
import { getTestName } from "../../commands/names";


describe('Group Admin Pages', () => {

  const Anna = "Anna";
  const FriendsForever = "Friends_forever";

  let ffcreated = false;

  const adminCol = '[aria-colindex="2"]';
  const usersTable = 'table[data-cy="users-table"]';
  const trashButton = '.trash-button';

  before(() => {
    cy.apiCreateUser(Anna);
    cy.visit('/');
  });

  beforeEach(() => {
    cy.signInAs(Anna);
  });

  it ('User can create a group and see group', () => {

    // use admin menu to get to groups page.
    cy.contains("Admin").click();
    cy.contains("Groups").click();

    // check what it looks like before groups are added
    cy.checkOnGroupPage();

    cy.contains("You don't belong to any groups yet").should('be.visible');
    cy.contains("Groups link together devices with").should('be.visible');
    cy.contains("You don't belong to any groups yet").should('be.visible');

    cy.createGroup(FriendsForever);
    ffcreated = true;

    // check what page looks like after groups are added
    cy.get("h1").contains(getTestName(FriendsForever));
    cy.contains("Manage the users associated with this group and view ").should('be.visible');

    // check self is admin
    cy.get(usersTable + ' th' + adminCol).should('contain', "Administrator");
    cy.get(getUserRow(Anna)).should('contain', "Yes");
  });

  it ('Check groups page after a group exists and navigation to and from group page', () => {
    ensureFriendsForeverGroupExists();
    cy.visit('/groups');

    cy.get('h1').should('contain', 'Your groups');
    cy.contains('Groups link together devices with the users who').should('be.visible');
    cy.contains('Create group').should('be.visible');

    // test navigation to group page
    cy.get('[data-cy="groups-list"]').contains(getTestName(FriendsForever)).click();

    cy.checkOnPage(getGroupPageUrl(FriendsForever));
    cy.get('h1').should('contain', FriendsForever);

    // test navigation back to groups page
    cy.contains('Back to groups').click();
    cy.checkOnGroupPage();
  });

  it ('Check Anna gets warning if she tries to remove herself from the group', () => {
    ensureFriendsForeverGroupExists();
    cy.visit(getGroupPageUrl(FriendsForever));

    // check warning if try and delete self from group
    cy.get(getUserRow(Anna)).find(trashButton).click();
    cy.contains("Are you sure you want to remove yourself from this group?");
    cy.contains("Cancel").click({force: true});
  });

  it ('Check Anna can add a friend to group, see the friend is added, and the friend can see group', () => {
    const Friend = "ffrriend";
    const GoodFriend = "goood_friend";
    const Admin = true;

    ensureFriendsForeverGroupExists();
    cy.apiCreateUser(Friend);
    cy.apiCreateUser(GoodFriend);

    cy.addUserToGroup(GoodFriend, FriendsForever, Admin);
    cy.addUserToGroup(Friend, FriendsForever);

    cy.wait(2000);
    // wait until the table is updated
    cy.get(usersTable).contains(Friend);

    cy.apiCheckUserCanSeeGroup(Friend, FriendsForever);

    // check admin status reflected in table
    cy.get(getUserRow(GoodFriend)).get(adminCol).should('contain', "Yes");
    cy.get(getUserRow(Friend)).get(adminCol).should('contain', "No");

    cy.get(getUserRow(Friend)).find(trashButton).click();
    cy.get(usersTable).contains(GoodFriend);
    cy.get(usersTable).contains(Friend).should('not.exist');
  });

  it ('Can see camera added to group', () => {
    const Camera = "camera";
    ensureFriendsForeverGroupExists();

    cy.apiCreateCamera(Camera, FriendsForever);
    cy.checkDeviceInGroup(Camera, FriendsForever);
  });

  function getUserRow(username) {
    // just make sure we are actually targeting the row html first
    cy.get(usersTable).contains(username).parent().should('match', 'tr');
    cy.get(usersTable).contains(username).parent().as(username);
    return '@' + username;
  }

  function getGroupPageUrl(groupname) {
    return '/groups/' + getTestName(groupname);
  }

  function ensureFriendsForeverGroupExists() {
    if (!ffcreated) {
      cy.visit("groups");
      cy.createGroup(FriendsForever);
      ffcreated = true;
    }
  }
});
