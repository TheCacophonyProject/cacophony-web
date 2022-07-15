/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";

import { ApiGroupUserResponse } from "@typedefs/api/group";
import {HTTP_BadRequest, HTTP_Forbidden, HTTP_OK200} from "@typedefs/api/consts";

describe("Groups - add, check and remove users", () => {
  const ADMIN = true;
  const NOT_ADMIN = false;
  let expectedGuAdminUser: ApiGroupUserResponse;
  let expectedGuAdminUser2: ApiGroupUserResponse;

  before(() => {
    cy.testCreateUserGroupAndDevice("guGroupAdmin", "guGroup", "guCamera").then(
      () => {
        expectedGuAdminUser = {
          userName: getTestName("guGroupAdmin"),
          id: getCreds("guGroupAdmin").id,
          admin: ADMIN,
        };
      }
    );
    cy.testCreateUserGroupAndDevice(
      "guGroup2Admin",
      "guGroup2",
      "guCamera2"
    ).then(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      expectedGuAdminUser2 = {
        userName: getTestName("guGroup2Admin"),
        id: getCreds("guGroup2Admin").id,
        admin: ADMIN,
      };
    });

    cy.apiUserAdd("guTestUser");
    cy.apiUserAdd("guTestUser2");
  });

  it("Group admin can add, view and remove a new user", () => {
    const expectedTestUser: ApiGroupUserResponse = {
      userName: getTestName("guTestUser"),
      id: getCreds("guTestUser").id,
      admin: ADMIN,
    };

    cy.log("add the user");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", ADMIN);

    cy.log("check that added user is there");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [
      expectedGuAdminUser,
      expectedTestUser,
    ]);

    cy.log("remove the user");
    cy.apiGroupUserRemove("guGroupAdmin", "guTestUser", "guGroup");

    cy.log("check that added user is no longer there");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [expectedGuAdminUser]);
  });

  it("Group member cannot add, or remove a user but can view", () => {
    const expectedTestUser: ApiGroupUserResponse = {
      userName: getTestName("guTestUser"),
      id: getCreds("guTestUser").id,
      admin: NOT_ADMIN,
    };

    cy.log("add a non admin user (to run the test)");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", NOT_ADMIN);

    cy.log("check non-admin cannot add a user");
    cy.apiGroupUserAdd(
      "guTestUser",
      "guTestUser2",
      "guGroup",
      NOT_ADMIN,
      true,
      HTTP_Forbidden
    );

    cy.log(
      "check that new user was not created and group member can see users list"
    );
    cy.apiGroupUsersCheck("guTestUser", "guGroup", [
      expectedGuAdminUser,
      expectedTestUser,
    ]);

    cy.log("attempt to remove a user using non admin account");
    cy.apiGroupUserRemove(
      "guTestUser",
      "guGroupAdmin",
      "guGroup",
      HTTP_Forbidden
    );

    cy.log("check that user was not deleted");
    cy.apiGroupUsersCheck("guTestUser", "guGroup", [
      expectedGuAdminUser,
      expectedTestUser,
    ]);

    cy.log("tidy up after test - remove test user from group");
    cy.apiGroupUserRemove("guGroupAdmin", "guTestUser", "guGroup");
  });

  it("Group admin cannot add, view or remove users from another group", () => {
    cy.log("check admin cannot add a user to another group");
    cy.apiGroupUserAdd(
      "guGroupAdmin",
      "guTestUser2",
      "guGroup2",
      NOT_ADMIN,
      true,
      HTTP_Forbidden
    );

    cy.log("check that group admin cannot view another groups user list");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup2", [], [], HTTP_Forbidden);

    cy.log("attempt to remove a user using non admin account");
    cy.apiGroupUserRemove(
      "guGroupAdmin",
      "guGroup2Admin",
      "guGroup2",
      HTTP_Forbidden
    );
  });

  it("Attempt to add or remove non-existent user fails nicely", () => {
    cy.log("check cannot add non-existent user");
    cy.apiGroupUserAdd(
      "guGroupAdmin",
      "IDontExist",
      "guGroup",
      NOT_ADMIN,
      true,
      HTTP_Forbidden
    );

    cy.log(
      "check that connot remove non-existant user (user exists but not in group)"
    );
    cy.apiGroupUserRemove(
      "guGroupAdmin",
      "guTestUser2",
      "guGroup",
      HTTP_BadRequest
    );

    cy.log(
      "check that cannot remove non-existent user (user not registered in system)"
    );
    cy.apiGroupUserRemove(
      "guGroupAdmin",
      "IDontExist",
      "guGroup",
      HTTP_Forbidden
    );
  });

  it("Attempt to add view or remove user from non-existent group fails nicely", () => {
    cy.log("check cannot add user to non-existent group");
    cy.apiGroupUserAdd(
      "guGroupAdmin",
      "guTestUser",
      "ThisGroupDoesNotExist",
      NOT_ADMIN,
      true,
      HTTP_Forbidden
    );

    cy.log("check that cannot view a non existent group");
    cy.apiGroupUsersCheck(
      "guGroupAdmin",
      "ThisGroupDoesNotExist",
      [],
      [],
      HTTP_Forbidden
    );

    cy.log(
      "check that cannot remove non-existent user (user not registered in system)"
    );
    cy.apiGroupUserRemove(
      "guGroupAdmin",
      "guTestUser",
      "ThisGroupDoesNotExist",
      HTTP_Forbidden
    );
  });

  it("Can view users using groupId (as well as groupName)", () => {
    cy.log("check that cannot view a non existent group");
    cy.apiGroupUsersCheck(
      "guGroupAdmin",
      getCreds("guGroup").id.toString(),
      [expectedGuAdminUser],
      [],
      HTTP_OK200,
      { useRawGroupName: true }
    );
  });

  it("Can update admin/member status of existing user", () => {
    const expectedTestNonAdminUser: ApiGroupUserResponse = {
      userName: getTestName("guTestUser"),
      id: getCreds("guTestUser").id,
      admin: NOT_ADMIN,
    };
    const expectedTestAdminUser: ApiGroupUserResponse = {
      userName: getTestName("guTestUser"),
      id: getCreds("guTestUser").id,
      admin: ADMIN,
    };

    cy.log("add the user");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", ADMIN);

    cy.log("check that added user is there");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [
      expectedGuAdminUser,
      expectedTestAdminUser,
    ]);

    cy.log("change to non-admin");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", NOT_ADMIN);

    cy.log("check that user is there only once, and shown as nonadmin");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [
      expectedGuAdminUser,
      expectedTestNonAdminUser,
    ]);

    cy.log("Verify user can no longer do admin tasks");
    cy.apiGroupUserAdd(
      "guTestUser",
      "guTestUser2",
      "guGroup",
      ADMIN,
      true,
      HTTP_Forbidden
    );

    cy.log("change to admin user");
    cy.apiGroupUserAdd("guGroupAdmin", "guTestUser", "guGroup", ADMIN);

    cy.log("check that the user is there only once, and is an admin");
    cy.apiGroupUsersCheck("guGroupAdmin", "guGroup", [
      expectedGuAdminUser,
      expectedTestAdminUser,
    ]);

    cy.log("Verfiy that user can now do admin tasks (by removing themselves)");
    cy.apiGroupUserRemove("guTestUser", "guTestUser", "guGroup");
  });
});
