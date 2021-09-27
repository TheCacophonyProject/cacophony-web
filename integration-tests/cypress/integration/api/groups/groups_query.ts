/// <reference path="../../../support/index.d.ts" />

import {
  ApiGroupReturned,
  ApiGroupUserRelation,
  ApiDeviceIdAndName,
  ApiGroupUser,
} from "../../../commands/types";
import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

import { HTTP_OK200 } from "../../../commands/constants";
import { HTTP_Unprocessable } from "../../../commands/constants";


describe("Groups - query groups", () => {
  const ADMIN = true;
  const NOT_ADMIN = false;
  let expectedGroup: ApiGroupReturned;
  let expectedGroup2: ApiGroupReturned;
  let expectedGroupAdminUser: ApiGroupUserRelation;
  let expectedGroupAdminGroupUser: ApiGroupUser;
  let expectedGroup2AdminUser: ApiGroupUserRelation;
  let expectedGroup2AdminGroupUser: ApiGroupUser;
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
    cy.testCreateUserGroupAndDevice("gqGroupAdmin", "gqGroup", "gqCamera").then(
      () => {
        expectedGroup = {
          id: getCreds("gqGroup").id,
          groupname: getTestName("gqGroup"),
          Users: [],
          Devices: [],
          GroupUsers: [],
        };
        expectedDevice = {
          id: getCreds("gqCamera").id,
          devicename: getTestName("gqCamera"),
        };
        expectedGroupAdminUser = {
          id: getCreds("gqGroupAdmin").id,
          username: getTestName("gqGroupAdmin"),
          GroupUsers: {
            admin: true,
            createdAt: "",
            updatedAt: "",
            GroupId: getCreds("gqGroup").id,
            UserId: getCreds("gqGroupAdmin").id,
          },
        };
        expectedGroupAdminGroupUser = {
          id: getCreds("gqGroupAdmin").id,
          username: getTestName("gqGroupAdmin"),
          isAdmin: true,
        };
      }
    );

    //2nd group
    cy.apiGroupAdd("gqGroupAdmin", "gqGroup2").then(() => {
      expectedGroup2 = {
        id: getCreds("gqGroup2").id,
        groupname: getTestName("gqGroup2"),
        Users: [],
        Devices: [],
        GroupUsers: [],
      };
      expectedGroup2AdminUser = {
        id: getCreds("gqGroupAdmin").id,
        username: getTestName("gqGroupAdmin"),
        GroupUsers: {
          admin: true,
          createdAt: "",
          updatedAt: "",
          GroupId: getCreds("gqGroup2").id,
          UserId: getCreds("gqGroupAdmin").id,
        },
      };
      expectedGroup2AdminGroupUser = {
        id: getCreds("gqGroupAdmin").id,
        username: getTestName("gqGroupAdmin"),
        isAdmin: true,
      };
    });

    //2nd device in this group
    cy.apiDeviceAdd("gqCamera1b", "gqGroup").then(() => {
      expectedDevice1b = {
        id: getCreds("gqCamera1b").id,
        devicename: getTestName("gqCamera1b"),
      };
    });

    //group member for this group
    cy.apiUserAdd("gqGroupMember");
    cy.apiGroupUserAdd(
      "gqGroupAdmin",
      "gqGroupMember",
      "gqGroup",
      NOT_ADMIN
    ).then(() => {
      expectedGroupMemberUser = {
        id: getCreds("gqGroupMember").id,
        username: getTestName("gqGroupMember"),
        GroupUsers: {
          admin: false,
          createdAt: "",
          updatedAt: "",
          GroupId: getCreds("gqGroup").id,
          UserId: getCreds("gqGroupMember").id,
        },
      };
      expectedGroupMemberGroupUser = {
        id: getCreds("gqGroupMember").id,
        username: getTestName("gqGroupMember"),
        isAdmin: false,
      };
    });

    //device admin for 1st device
    cy.apiUserAdd("gqDeviceAdmin");
    cy.apiDeviceUserAdd("gqGroupAdmin", "gqDeviceAdmin", "gqCamera", ADMIN);

    // test users
    cy.apiUserAdd("gqTestUser");
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
    cy.apiGroupsCheck(
      "gqGroupAdmin",
      { groupname: getTestName("gqGroup") },
      [expectedGroup],
      EXCLUDE_CREATED_UPDATED_AT
    );

    cy.log("Check member can view group, devices and user");
    expectedGroup2.Users = [expectedGroupMemberUser];
    cy.apiGroupsCheck(
      "gqGroupMember",
      { groupname: getTestName("gqGroup") },
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
    cy.apiGroupsCheck(
      "gqGroupAdmin",
      { id: getCreds("gqGroup").id },
      [expectedGroup],
      EXCLUDE_CREATED_UPDATED_AT,
      HTTP_OK200
    );
  });

  it("Can query using other operators (>=, <) and createdAt", () => {
    // create a new group with a later timestamp
    const timestamp = new Date().toISOString();
    let expectedGroup3: ApiGroupReturned;
    cy.testCreateUserGroupAndDevice(
      "gqGroupAdmin3",
      "gqGroup3",
      "gqCamera3"
    ).then(() => {
      expectedGroup3 = {
        id: getCreds("gqGroup3").id,
        groupname: getTestName("gqGroup3"),
        Users: [
          {
            id: getCreds("gqGroupAdmin3").id,
            username: getTestName("gqGroupAdmin3"),
            GroupUsers: {
              admin: true,
              createdAt: "",
              updatedAt: "",
              GroupId: getCreds("gqGroup3").id,
              UserId: getCreds("gqGroupAdmin3").id,
            },
          },
        ],
        Devices: [
          {
            id: getCreds("gqCamera3").id,
            devicename: getTestName("gqCamera3"),
          },
        ],
        GroupUsers: [
          {
            id: getCreds("gqGroupAdmin3").id,
            username: getTestName("gqGroupAdmin3"),
            isAdmin: true,
          },
        ],
      };

      cy.log(
        "Query using greater than or equal to createdAt - should be included in results"
      );
      cy.apiGroupsCheck(
        "gqGroupAdmin3",
        { createdAt: { $gte: timestamp } },
        [expectedGroup3],
        EXCLUDE_CREATED_UPDATED_AT,
        HTTP_OK200
      );

      cy.log(
        "Query using less than createdAt - should not be included in results"
      );
      cy.apiGroupsCheck(
        "gqGroupAdmin3",
        { createdAt: { $lte: timestamp } },
        [],
        [],
        HTTP_OK200
      );
    });
  });

  it("Lists all user's groups by default", () => {
    expectedGroup.Devices = [expectedDevice, expectedDevice1b];
    expectedGroup.GroupUsers = [
      expectedGroupAdminGroupUser,
      expectedGroupMemberGroupUser,
    ];
    expectedGroup.Users = [expectedGroupAdminUser];

    expectedGroup2.GroupUsers = [expectedGroup2AdminGroupUser];
    expectedGroup2.Users = [expectedGroup2AdminUser];

    cy.apiGroupsCheck(
      "gqGroupAdmin",
      {},
      [expectedGroup, expectedGroup2],
      EXCLUDE_CREATED_UPDATED_AT,
      HTTP_OK200
    );
  });

  it("Can query using multuiple conditions - and and or operators", () => {
    expectedGroup.Devices = [expectedDevice, expectedDevice1b];
    expectedGroup.GroupUsers = [
      expectedGroupAdminGroupUser,
      expectedGroupMemberGroupUser,
    ];
    expectedGroup.Users = [expectedGroupAdminUser];

    cy.log("Query using two conditions - defaults to AND");
    cy.apiGroupsCheck(
      "gqGroupAdmin",
      { groupname: getTestName("gqGroup"), id: getCreds("gqGroup").id },
      [expectedGroup],
      EXCLUDE_CREATED_UPDATED_AT
    );
  });

  it("Non member cannot query", () => {
    cy.log("Valid user with no access to this group");
    cy.apiGroupsCheck(
      "gqTestUser",
      { groupname: getTestName("gqGroup") },
      [],
      [],
      HTTP_OK200
    );

    cy.log("Device admin with no group-level permisssions");
    cy.apiGroupsCheck(
      "gqDeviceAdmin",
      { groupname: getTestName("gqGroup") },
      [],
      [],
      HTTP_OK200
    );
  });

  it("Query nonexistant group handled correctly", () => {
    cy.apiGroupsCheck(
      "gqGroupAdmin",
      { groupname: "IDontExist" },
      [],
      [],
      HTTP_OK200
    );

    cy.apiGroupsCheck("gqGroupAdmin", { id: 9999999 }, [], [], HTTP_OK200);
  });

  it("Handles bad parameters correctly", () => {
    cy.log("Invalid parameter");
    cy.apiGroupsCheck("gqGroupAdmin", "ImNotAHash", [], [], HTTP_Unprocessable);

    // TODO: FAILS with server error - Issue 78
    //cy.log("Search on non-existant field");
    //cy.apiGroupsCheck("gqGroupAdmin", {"KeyThatDoesNotExist": 1}, [], [], HTTP_Unprocessable);
  });
});
