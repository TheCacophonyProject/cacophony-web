/// <reference path="../../../support/index.d.ts" />

import { ApiGroupsUserReturned } from "../../../commands/types";
import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

import { HTTP_OK200 } from "../../../commands/constants";
import { HTTP_Unprocessable } from "../../../commands/constants";
import { HTTP_Forbidden } from "../../../commands/constants";

const ADMIN=true;
const NOT_ADMIN=false;
let expectedGuAdminUser:ApiGroupsUserReturned;
let expectedGuAdminUser2:ApiGroupsUserReturned;

describe("Groups - add, check and remove users", () => {

  before(() => {
    cy.testCreateUserGroupAndDevice("guGroupAdmin", "guGroup", "guCamera").then(() => {
        expectedGuAdminUser={userName: getTestName("guGroupAdmin"), id: getCreds("guGroupAdmin").id, isGroupAdmin: ADMIN};
    });
    cy.testCreateUserGroupAndDevice("guGroup2Admin", "guGroup2", "guCamera2").then(() => {
        expectedGuAdminUser2={userName: getTestName("guGroup2Admin"), id: getCreds("guGroup2Admin").id, isGroupAdmin: ADMIN};
    });
    cy.apiUserAdd("guDeviceAdmin");
    cy.apiDeviceUserAdd("guGroupAdmin", "guDeviceAdmin", "guCamera", ADMIN);

    cy.apiUserAdd("guTestUser");
    cy.apiUserAdd("guTestUser2");
  });

  it("Group admin can add, view and remove a new user", () => {
    const expectedTestUser:ApiGroupsUserReturned={userName: getTestName("guTestUser"), id: getCreds("guTestUser").id, isGroupAdmin: ADMIN};

    cy.log("add the user");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", ADMIN);

    cy.log("check that added user is there");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [expectedGuAdminUser, expectedTestUser]);

    cy.log("remove the user");
    cy.apiGroupUserRemove("guGroupAdmin", "guTestUser", "guGroup");


    cy.log("check that added user is no longer there");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [expectedGuAdminUser]);

  });

  it("Group member cannot add, or remove a user but can view", () => {
    const expectedTestUser:ApiGroupsUserReturned={userName: getTestName("guTestUser"), id: getCreds("guTestUser").id, isGroupAdmin: NOT_ADMIN};

    cy.log("add a non admin user (to run the test)");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", NOT_ADMIN);

    cy.log("check non-admin cannot add a user");
    cy.apiGroupUserAdd("guTestUser", "guTestUser2", "guGroup", NOT_ADMIN, true, HTTP_Forbidden);

    cy.log("check that new user was not created and group member can see users list");
    cy.apiGroupUsersCheck("guTestUser", "guGroup", [expectedGuAdminUser, expectedTestUser]);

    cy.log("attempt to remove a user using non admin account");
    cy.apiGroupUserRemove("guTestUser", "guGroupAdmin", "guGroup", HTTP_Forbidden);


    cy.log("check that user was not deleted");
    cy.apiGroupUsersCheck("guTestUser", "guGroup", [expectedGuAdminUser, expectedTestUser]);

    cy.log("tidy up after test - remove test user from group");
    cy.apiGroupUserRemove("guGroupAdmin", "guTestUser", "guGroup");
  });

  it("Group admin cannot add, view or remove users from another group", () => {
    cy.log("check admin cannot add a user to another group");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser2", "guGroup2", NOT_ADMIN, true, HTTP_Forbidden);

    cy.log("check that group admin cannot view another groups user list");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup2", [], [], HTTP_Forbidden);

    cy.log("attempt to remove a user using non admin account");
    cy.apiGroupUserRemove("guGroupAdmin", "guGroup2Admin", "guGroup2", HTTP_Forbidden);
  });

  it("Device admin cannot add, view or remove group users", () => {
    cy.log("check device admin cannot add a user to device's group");
    cy.apiGroupUserAdd("guDeviceAdmin", "guTestUser", "guGroup", NOT_ADMIN, true, HTTP_Forbidden);
      
    cy.log("check that device admin cannot view device's groups user list");
    cy.apiGroupUsersCheck("guDeviceAdmin", "guGroup", [], [], HTTP_Forbidden);
      
    cy.log("check that device admin cannot remove user from device's group");
    cy.apiGroupUserRemove("guDeviceAdmin", "guGroupAdmin", "guGroup", HTTP_Forbidden);
  });

  it("Attempt to add or remove non-existant user fails nicely", () => {
    cy.log("check cannot add non-existanct user");
    cy.apiGroupUserAdd("guGroupAdmin", "IDontExist", "guGroup", NOT_ADMIN, true, HTTP_Unprocessable);

    //TODO: This test fails - returns SUCCESS. Issue 75
    //cy.log("check that connot remove non-existant user (user exists but not in group)");
    //cy.apiGroupUserRemove("guGroupAdmin", "guTestUser2", "guGroup", HTTP_Unprocessable);

    cy.log("check that connot remove non-existant user (user not registered in system");
    cy.apiGroupUserRemove("guGroupAdmin", "IDontExist", "guGroup", HTTP_Unprocessable);
  });

  it("Attempt to add view or remove user from non-existant group fails nicely", () => {
    cy.log("check cannot add user to non-existanct group");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "ThisGroupDoesNotExist", NOT_ADMIN, true, HTTP_Unprocessable);

    cy.log("check that cannot view a non existant group");
    cy.apiGroupUsersCheck("guGroupAdmin", "ThisGroupDoesNotExist", [], [], HTTP_Unprocessable);

    cy.log("check that connot remove non-existant user (user not registered in system)");
    cy.apiGroupUserRemove("guGroupAdmin", "guTestUser", "ThisGroupDoesNotExist", HTTP_Unprocessable);
  });

  it("Can view users using groupId (as well as groupName)", () => {
    cy.log("check that cannot view a non existant group");
    cy.apiGroupUsersCheck("guGroupAdmin", getCreds("guGroup").id.toString(), [expectedGuAdminUser],[],HTTP_OK200,{useRawGroupName: true});
  });

  it("Can update admin/member status of existing user", () => {
    const expectedTestNonAdminUser:ApiGroupsUserReturned={userName: getTestName("guTestUser"), id: getCreds("guTestUser").id, isGroupAdmin: NOT_ADMIN};
    const expectedTestAdminUser:ApiGroupsUserReturned={userName: getTestName("guTestUser"), id: getCreds("guTestUser").id, isGroupAdmin: ADMIN};
  
      cy.log("add the user");
      cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", ADMIN);
  
      cy.log("check that added user is there");
      cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [expectedGuAdminUser, expectedTestAdminUser]);

      cy.log("change to non-admin")
      cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", NOT_ADMIN);
  
      cy.log("check that user is there only once, and shown as nonadmin");
      cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [expectedGuAdminUser, expectedTestNonAdminUser]);

      cy.log("Verify user can no longer do admin tasks");
      cy.apiGroupUserAdd("guTestUser", "guTestUser2", "guGroup", ADMIN, true, HTTP_Forbidden);

      cy.log("change to admin user");
      cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", ADMIN);
  
      cy.log("check that the user is there only once, and is an admin");
      cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [expectedGuAdminUser, expectedTestAdminUser]);

      cy.log("Verfiy that user can now do admin tasks (by removing themselves)");
      cy.apiGroupUserRemove("guTestUser", "guTestUser", "guGroup");
  });
});
