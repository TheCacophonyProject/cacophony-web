/// <reference path="../../../support/index.d.ts" />

import {
  ApiGroupReturned,
  ApiGroupUserRelation,
  ApiDeviceIdAndName,
  ApiGroupUser,
} from "@commands/types";
import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("Groups - add, get group", () => {
  const NOT_ADMIN = false;
  let expectedGroup: ApiGroupReturned;
  let expectedGroupAdminUser: ApiGroupUserRelation;
  let expectedGroupAdminGroupUser: ApiGroupUser;
  let expectedGroupMemberUser: ApiGroupUserRelation;
  let expectedGroupMemberGroupUser: ApiGroupUser;
  let expectedDevice: ApiDeviceIdAndName;
  let expectedDevice1b: ApiDeviceIdAndName;

  //do not validate createdAt or updatedAt values
  const EXCLUDE_CREATED_UPDATED_AT = [
    "[].Users[].GroupUsers.createdAt",
    "[].Users[].GroupUsers.updatedAt",
  ];

  before(() => {
    //admin user, group and device
    cy.testCreateUserGroupAndDevice("gaGroupAdmin", "gaGroup", "gaCamera").then(
      () => {
        expectedGroup = {
          id: getCreds("gaGroup").id,
          groupname: getTestName("gaGroup"),
          Users: [],
          Devices: [],
          GroupUsers: [],
        };
        expectedDevice = {
          id: getCreds("gaCamera").id,
          deviceName: getTestName("gaCamera"),
        };
        expectedGroupAdminUser = {
          id: getCreds("gaGroupAdmin").id,
          username: getTestName("gaGroupAdmin"),
          GroupUsers: {
            admin: true,
            createdAt: "",
            updatedAt: "",
            GroupId: getCreds("gaGroup").id,
            UserId: getCreds("gaGroupAdmin").id,
          },
        };
        expectedGroupAdminGroupUser = {
          id: getCreds("gaGroupAdmin").id,
          username: getTestName("gaGroupAdmin"),
          admin: true,
        };
      }
    );

    //2nd device in this group
    cy.apiDeviceAdd("gaCamera1b", "gaGroup").then(() => {
      expectedDevice1b = {
        id: getCreds("gaCamera1b").id,
        deviceName: getTestName("gaCamera1b"),
      };
    });

    //group member for this group
    cy.apiUserAdd("gaGroupMember");
    cy.apiGroupUserAdd(
      "gaGroupAdmin",
      "gaGroupMember",
      "gaGroup",
      NOT_ADMIN
    ).then(() => {
      expectedGroupMemberUser = {
        id: getCreds("gaGroupMember").id,
        username: getTestName("gaGroupMember"),
        GroupUsers: {
          admin: false,
          createdAt: "",
          updatedAt: "",
          GroupId: getCreds("gaGroup").id,
          UserId: getCreds("gaGroupMember").id,
        },
      };
      expectedGroupMemberGroupUser = {
        id: getCreds("gaGroupMember").id,
        username: getTestName("gaGroupMember"),
        admin: false,
      };
    });

    // test users
    cy.apiUserAdd("gaTestUser");
    cy.apiUserAdd("gaTestUser2");
  });

  it("Can add a new group", () => {
    let expectedTestGroup: ApiGroupReturned;
    cy.log("Create a new group");
    cy.apiGroupAdd("gaTestUser", "gaTestGroup1", true).then(() => {
      const expectedTestGroupUser = {
        id: getCreds("gaTestUser").id,
        username: getTestName("gaTestUser"),
        GroupUsers: {
          admin: true,
          createdAt: "",
          updatedAt: "",
          GroupId: getCreds("gaTestGroup1").id,
          UserId: getCreds("gaTestUser").id,
        },
      };
      const expectedTestGroupGroupUser = {
        id: getCreds("gaTestUser").id,
        username: getTestName("gaTestUser"),
        admin: true,
      };
      expectedTestGroup = {
        id: getCreds("gaTestGroup1").id,
        groupname: getTestName("gaTestGroup1"),
        Users: [expectedTestGroupUser],
        Devices: [],
        GroupUsers: [expectedTestGroupGroupUser],
      };

      cy.log("Group creator can view the created group");
      //group query
      cy.apiGroupCheck(
        "gaTestUser",
        "gaTestGroup1",
        [expectedTestGroup],
        EXCLUDE_CREATED_UPDATED_AT
      );
    });
  });

  it("Admin and member can view group's devices and users", () => {
    expectedGroup.Devices = [expectedDevice, expectedDevice1b];
    expectedGroup.GroupUsers = [
      expectedGroupAdminGroupUser,
      expectedGroupMemberGroupUser,
    ];
    const expectedGroup2 = JSON.parse(JSON.stringify(expectedGroup));

    cy.log("Check admin can view group, devices and user");
    expectedGroup.Users = [expectedGroupAdminUser];
    cy.apiGroupCheck(
      "gaGroupAdmin",
      "gaGroup",
      [expectedGroup],
      EXCLUDE_CREATED_UPDATED_AT
    );

    cy.log("Check member can view group, devices and user");
    expectedGroup2.Users = [expectedGroupMemberUser];
    cy.apiGroupCheck(
      "gaGroupMember",
      "gaGroup",
      [expectedGroup2],
      EXCLUDE_CREATED_UPDATED_AT
    );
  });

  it("Can query using group id", () => {
    expectedGroup.Devices = [expectedDevice, expectedDevice1b];
    expectedGroup.GroupUsers = [
      expectedGroupAdminGroupUser,
      expectedGroupMemberGroupUser,
    ];
    expectedGroup.Users = [expectedGroupAdminUser];
    //Query using group id
    cy.apiGroupCheck(
      "gaGroupAdmin",
      getCreds("gaGroup").id.toString(),
      [expectedGroup],
      EXCLUDE_CREATED_UPDATED_AT,
      HttpStatusCode.Ok,
      { useRawGroupName: true }
    );
  });

  it("Non member cannot query", () => {
    cy.log("Valid user with no access to this group");
    cy.apiGroupCheck("gaTestUser", "gaGroup", [], [], HttpStatusCode.Forbidden);

    cy.log("Valid user with no access to this group using groupId");
    cy.apiGroupCheck(
      "gaTestUser",
      getCreds("gaGroup").id.toString(),
      [],
      [],
      HttpStatusCode.Forbidden,
      { useRawGroupName: true }
    );
  });

  it("Query nonexistant group handled correctly", () => {
    cy.apiGroupCheck(
      "gaGroupAdmin",
      "IDontExist",
      [],
      [],
      HttpStatusCode.Forbidden,
      {
        useRawGroupName: true,
      }
    );

    cy.apiGroupCheck(
      "gaGroupAdmin",
      "9999999",
      [],
      [],
      HttpStatusCode.Forbidden,
      {
        useRawGroupName: true,
      }
    );
  });

  it("Cannot create group with same name (even with different case)", () => {
    cy.log("Add duplicate group (same user)");
    cy.apiGroupAdd(
      "gaGroupAdmin",
      "gaGroup",
      true,
      HttpStatusCode.Unprocessable
    );
    cy.log("Add duplicate group (different user)");
    cy.apiGroupAdd("gaTestUser", "gaGroup", true, HttpStatusCode.Unprocessable);
    cy.log("Add duplicate group (different case)");
    cy.apiGroupAdd(
      "gaGroupAdmin",
      "GAGROUP",
      true,
      HttpStatusCode.Unprocessable
    );
  });
  it("Invalid group names rejected", () => {
    cy.log("Cannot add group with no letters");
    cy.apiGroupAdd("gaGroupAdmin", "", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });
    cy.apiGroupAdd("gaGroupAdmin", "1234", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });

    cy.log("Cannot add group with other non-alphanumeric characters");
    cy.apiGroupAdd("gaGroupAdmin", "ABC%", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });
    cy.apiGroupAdd("gaGroupAdmin", "ABC&", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });
    cy.apiGroupAdd("gaGroupAdmin", "ABC<", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });
    cy.apiGroupAdd("gaGroupAdmin", "ABC>", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });

    cy.log("Cannot add group with -, _ or space as first letter");
    cy.apiGroupAdd("gaGroupAdmin", " ABC", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });
    cy.apiGroupAdd("gaGroupAdmin", "-ABC", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });
    cy.apiGroupAdd("gaGroupAdmin", "_ABC", true, HttpStatusCode.Unprocessable, {
      useRawGroupName: true,
    });

    cy.log("Can add group with -, _ or space as subsequent letter");
    cy.apiGroupAdd("gaGroupAdmin", "A B-C_D", true, HttpStatusCode.Ok);
  });
});
