/// <reference path="../../../support/index.d.ts" />

import { HTTP_BadRequest, HTTP_Forbidden } from "@commands/constants";
import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import ApiDeviceUserRelationshipResponse = Cypress.ApiDeviceUserRelationshipResponse;
import { DeviceType } from "@typedefs/api/consts";

describe("Devices add / view / remove users", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  const groupAdmin = "Harold-groupAdmin";
  const groupMember = "Henry-groupMember";
  const deviceAdmin = "Hermert-deviceAdmin";
  const deviceMember = "Henrietta-deviceMember";
  const hacker = "HonestHacker";
  const group = "H-Team";
  const camera = "camera1";
  const ADMIN = true;
  const group2 = "second_H_group";
  const userB = "Baldrick";
  const userC = "Candy";
  const userD = "Dylan";
  const camera2 = "second_H_camera";
  let deviceMemberDetails: ApiDeviceUserRelationshipResponse;
  let deviceAdminDetails: ApiDeviceUserRelationshipResponse;
  let groupAdminDetails: ApiDeviceUserRelationshipResponse;
  let groupMemberDetails: ApiDeviceUserRelationshipResponse;
  let userBDetails: ApiDeviceUserRelationshipResponse;
  let userCDetails: ApiDeviceUserRelationshipResponse;
  let userDDetails: ApiDeviceUserRelationshipResponse;
  let expectedDeviceInGroupUserView: ApiDeviceResponse;

  before(() => {
    cy.apiUserAdd(groupMember);
    cy.apiUserAdd(deviceMember);
    cy.apiUserAdd(deviceAdmin);
    cy.apiUserAdd(hacker);
    cy.testCreateUserGroupAndDevice(groupAdmin, group, camera).then(() => {
      deviceMemberDetails = {
        id: getCreds(deviceMember).id,
        userName: getTestName(deviceMember),
        relation: "device",
        admin: false,
      };
      deviceAdminDetails = {
        id: getCreds(deviceAdmin).id,
        userName: getTestName(deviceAdmin),
        relation: "device",
        admin: true,
      };
      groupAdminDetails = {
        id: getCreds(groupAdmin).id,
        userName: getTestName(groupAdmin),
        relation: "group",
        admin: true,
      };
      groupMemberDetails = {
        id: getCreds(groupMember).id,
        userName: getTestName(groupMember),
        relation: "group",
        admin: false,
      };
      expectedDeviceInGroupUserView = {
        id: getCreds(camera).id,
        saltId: getCreds(camera).id,
        deviceName: getTestName(camera),
        groupName: getTestName(group),
        groupId: getCreds(group).id,
        active: true,
        admin: false,
        type: DeviceType.Unknown,
      };
    });
    cy.apiDeviceUserAdd(groupAdmin, deviceAdmin, camera, ADMIN);

    // second group users & device
    cy.apiUserAdd(userC).then(() => {
      userCDetails = {
        id: getCreds(userC).id,
        userName: getTestName(userC),
        relation: "device",
        admin: true,
      };
    });
    cy.apiUserAdd(userD).then(() => {
      userDDetails = {
        id: getCreds(userD).id,
        userName: getTestName(userD),
        relation: "device",
        admin: true,
      };
    });
    cy.testCreateUserGroupAndDevice(userB, group2, camera2).then(() => {
      userBDetails = {
        id: getCreds(userB).id,
        userName: getTestName(userB),
        relation: "group",
        admin: true,
      };
    });
  });

  it("Group admin can add/remove user to/from device", () => {
    // add user to device
    cy.apiDeviceUserAdd(groupAdmin, deviceMember, camera);

    // check user (and group admin) are added
    cy.apiDeviceUsersCheck(groupAdmin, camera, [
      groupAdminDetails,
      deviceAdminDetails,
      deviceMemberDetails,
    ]);

    // check user can access device (one endpoint only - test all endpoints in their own test specs )
    cy.apiDeviceInGroupCheck(
      deviceMember,
      camera,
      group,
      null,
      expectedDeviceInGroupUserView
    );

    // check user can be removed from device
    cy.apiDeviceUserRemove(groupAdmin, deviceMember, camera);

    // check user (but not group admin) has been removed
    cy.apiDeviceUsersCheck(groupAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  it("Device admin can add/remove user to/from device", () => {
    // add user to device
    cy.apiDeviceUserAdd(deviceAdmin, deviceMember, camera);

    // check user (and group admin) are added
    cy.apiDeviceUsersCheck(deviceAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
      deviceMemberDetails,
    ]);

    // check user can access device (one endpoint only - test all endpoints in their own test specs )
    cy.apiDeviceInGroupCheck(
      deviceMember,
      camera,
      group,
      null,
      expectedDeviceInGroupUserView
    );

    // check user can be removed from device
    cy.apiDeviceUserRemove(deviceAdmin, deviceMember, camera);

    // check user (but not group admin) has been removed
    cy.apiDeviceUsersCheck(deviceAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Superuser can add/remove user to/from device", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);

      // add user to device
      cy.apiDeviceUserAdd(superuser, deviceMember, camera);

      // check user (and group admin) are added
      cy.apiDeviceUsersCheck(superuser, camera, [
        deviceAdminDetails,
        groupAdminDetails,
        deviceMemberDetails,
      ]);

      // check user can access device (one endpoint only - test all endpoints in their own test specs )
      cy.apiDeviceInGroupCheck(
        deviceMember,
        camera,
        group,
        null,
        expectedDeviceInGroupUserView
      );

      // check user can be removed from device
      cy.apiDeviceUserRemove(superuser, deviceMember, camera);

      // check user (but not group admin) has been removed
      cy.apiDeviceUsersCheck(superuser, camera, [
        deviceAdminDetails,
        groupAdminDetails,
      ]);
    });
  } else {
    it.skip("Superuser can add/remove user to/from device", () => {});
  }

  it("Non-admin device member cannot add view or remove user to device", () => {
    // add non-admin user to device
    cy.apiDeviceUserAdd(groupAdmin, deviceMember, camera);

    // non-admin cannot add another user
    cy.apiDeviceUserAdd(deviceMember, userB, camera, false, HTTP_Forbidden);

    // non-admin cannot remove a user
    cy.apiDeviceUserRemove(deviceMember, deviceMember, camera, HTTP_Forbidden);

    // check group member cannot see user details
    cy.apiDeviceUsersCheck(deviceMember, camera, [], HTTP_Forbidden);

    // check user can be removed from device
    cy.apiDeviceUserRemove(groupAdmin, deviceMember, camera);

    // check user (but not group admin) has been removed
    cy.apiDeviceUsersCheck(groupAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  it("Non-admin group member cannot add view or remove user to device", () => {
    // add non-admin user to group
    cy.apiGroupUserAdd(groupAdmin, groupMember, group);

    // non-admin cannot add another user
    cy.apiDeviceUserAdd(groupMember, userB, camera, false, HTTP_Forbidden);

    // non-admin cannot remove a user
    cy.apiDeviceUserRemove(groupMember, deviceMember, camera, HTTP_Forbidden);

    // check group member cannot see user details
    cy.apiDeviceUsersCheck(groupMember, camera, [], HTTP_Forbidden);

    // check admin member can see ggroup member
    cy.apiDeviceUsersCheck(groupAdmin, camera, [
      groupMemberDetails,
      deviceAdminDetails,
      groupAdminDetails,
    ]);

    // remove user from group
    cy.apiGroupUserRemove(groupAdmin, groupMember, group);

    // check user (but not group admin) has been removed
    cy.apiDeviceUsersCheck(groupAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  it("Admin cannot add or remove user to another device", () => {
    // cannot add user to another group's devices
    cy.apiDeviceUserAdd(
      groupAdmin,
      deviceMember,
      camera2,
      false,
      HTTP_Forbidden
    );

    // but group member can add group user
    cy.apiDeviceUserAdd(userB, userC, camera2, true);

    // admin can't remove another groups users
    cy.apiDeviceUserRemove(groupAdmin, userB, camera2, HTTP_Forbidden);

    // check both users are there (delete failed)
    cy.apiDeviceUsersCheck(userB, camera2, [userBDetails, userCDetails]);

    // but device member can remove themselves
    cy.apiDeviceUserRemove(userC, userC, camera2);

    // check user (but not group admin) has been removed
    cy.apiDeviceUsersCheck(userB, camera2, [userBDetails]);
  });

  it("Can create a device admin-user who can then manage users", () => {
    // create an admin device user
    cy.apiDeviceUserAdd(groupAdmin, userC, camera, true);

    // device admin user can add another user
    cy.apiDeviceUserAdd(userC, userD, camera, true);

    // check both users are there (delete failed)
    cy.apiDeviceUsersCheck(userC, camera, [
      deviceAdminDetails,
      groupAdminDetails,
      userCDetails,
      userDDetails,
    ]);

    // Remove test users dfrom device
    cy.apiDeviceUserRemove(userC, userD, camera);
    cy.apiDeviceUserRemove(userC, userC, camera);
  });

  it("Invalid usernames rejected", () => {
    // add non existent user to device
    cy.apiDeviceUserAdd(groupAdmin, "bad-user", camera, false, HTTP_BadRequest);

    // remove non existent user from device
    cy.apiDeviceUserRemove(groupAdmin, "bad-user", camera, HTTP_BadRequest);
  });
});
