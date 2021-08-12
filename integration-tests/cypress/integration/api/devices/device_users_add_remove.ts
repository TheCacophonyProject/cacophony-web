/// <reference path="../../../support/index.d.ts" />

const HTTP_AuthorizationError = 401;
const HTTP_Forbidden = 403;
const HTTP_Unprocessable = 422;
const HTTP_OK = 200;

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

describe("Devices add / view / remove users", () => {
  const groupAdmin = "Harold-groupAdmin";
  const groupMember = "Henry-groupMember";
  const deviceAdmin = "Hermert-deviceAdmin";
  const deviceMember = "Henrietta-deviceMember";
  const hacker = "HonestHacker";
  const group = "H-Team";
  const camera = "camera1";
  const NOT_ADMIN = false;
  const ADMIN = true;
  const group2 = "second_H_group";
  const userB = "Baldrick";
  const userC = "Candy";
  const userD = "Dylan";
  const camera2 = "second_H_camera";
  const superuser = "admin_test";
  const suPassword = "admin_test";
  let deviceMemberDetails: ApiDeviceUsersUser;
  let deviceAdminDetails: ApiDeviceUsersUser;
  let groupAdminDetails: ApiDeviceUsersUser;
  let groupMemberDetails: ApiDeviceUsersUser;
  let userBDetails: ApiDeviceUsersUser;
  let userCDetails: ApiDeviceUsersUser;
  let userDDetails: ApiDeviceUsersUser;
  let expectedDeviceInGroupUserView: ApiDeviceInGroupDevice;

  before(() => {
    cy.apiCreateUser(groupMember);
    cy.apiCreateUser(deviceMember);
    cy.apiCreateUser(deviceAdmin);
    cy.apiCreateUser(hacker);
    cy.apiCreateUserGroupAndDevice(groupAdmin, group, camera).then(() => {
      deviceMemberDetails = {
        id: getCreds(deviceMember).id,
        username: getTestName(deviceMember),
        email: getTestName(deviceMember.toLowerCase()) + "@api.created.com",
        relation: "device",
        admin: false,
      };
      deviceAdminDetails = {
        id: getCreds(deviceAdmin).id,
        username: getTestName(deviceAdmin),
        email: getTestName(deviceAdmin.toLowerCase()) + "@api.created.com",
        relation: "device",
        admin: true,
      };
      groupAdminDetails = {
        id: getCreds(groupAdmin).id,
        username: getTestName(groupAdmin),
        email: getTestName(groupAdmin.toLowerCase()) + "@api.created.com",
        relation: "group",
        admin: true,
      };
      groupMemberDetails = {
        id: getCreds(groupMember).id,
        username: getTestName(groupMember),
        email: getTestName(groupMember.toLowerCase()) + "@api.created.com",
        relation: "group",
        admin: false,
      };
      expectedDeviceInGroupUserView = {
        id: getCreds(camera).id,
        devicename: getTestName(camera),
        groupName: getTestName(group),
        userIsAdmin: false,
        users: null,
      };
    });
    cy.apiAddUserToDevice(groupAdmin, deviceAdmin, camera, ADMIN);

    // second group users & device
    cy.apiCreateUser(userC).then(() => {
      userCDetails = {
        id: getCreds(userC).id,
        username: getTestName(userC),
        email: getTestName(userC.toLowerCase()) + "@api.created.com",
        relation: "device",
        admin: true,
      };
    });
    cy.apiCreateUser(userD).then(() => {
      userDDetails = {
        id: getCreds(userD).id,
        username: getTestName(userD),
        email: getTestName(userD.toLowerCase()) + "@api.created.com",
        relation: "device",
        admin: true,
      };
    });
    cy.apiCreateUserGroupAndDevice(userB, group2, camera2).then(() => {
      userBDetails = {
        id: getCreds(userB).id,
        username: getTestName(userB),
        email: getTestName(userB.toLowerCase()) + "@api.created.com",
        relation: "group",
        admin: true,
      };
    });
  });

  it("Group admin can add/remove user to/from device", () => {
    // add user to device
    cy.apiAddUserToDevice(groupAdmin, deviceMember, camera);

    // check user (and group admin) are added
    cy.apiCheckDevicesUsers(groupAdmin, camera, [
      groupAdminDetails,
      deviceAdminDetails,
      deviceMemberDetails,
    ]);

    // check user can access device (one endpoint only - test all endpoints in their own test specs )
    cy.apiCheckDeviceInGroup(
      deviceMember,
      camera,
      group,
      null,
      expectedDeviceInGroupUserView
    );

    // check user can be removed from device
    cy.apiRemoveUserFromDevice(groupAdmin, deviceMember, camera);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(groupAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  it("Device admin can add/remove user to/from device", () => {
    // add user to device
    cy.apiAddUserToDevice(deviceAdmin, deviceMember, camera);

    // check user (and group admin) are added
    cy.apiCheckDevicesUsers(deviceAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
      deviceMemberDetails,
    ]);

    // check user can access device (one endpoint only - test all endpoints in their own test specs )
    cy.apiCheckDeviceInGroup(
      deviceMember,
      camera,
      group,
      null,
      expectedDeviceInGroupUserView
    );

    // check user can be removed from device
    cy.apiRemoveUserFromDevice(deviceAdmin, deviceMember, camera);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(deviceAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("test_using_default_superuser") == true) {
    it("Superuser can add/remove user to/from device", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);

      // add user to device
      cy.apiAddUserToDevice(superuser, deviceMember, camera);

      // check user (and group admin) are added
      cy.apiCheckDevicesUsers(superuser, camera, [
        deviceAdminDetails,
        groupAdminDetails,
        deviceMemberDetails,
      ]);

      // check user can access device (one endpoint only - test all endpoints in their own test specs )
      cy.apiCheckDeviceInGroup(
        deviceMember,
        camera,
        group,
        null,
        expectedDeviceInGroupUserView
      );

      // check user can be removed from device
      cy.apiRemoveUserFromDevice(superuser, deviceMember, camera);

      // check user (but not group admin) has been removed
      cy.apiCheckDevicesUsers(superuser, camera, [
        deviceAdminDetails,
        groupAdminDetails,
      ]);
    });
  } else {
    it.skip("Superuser can add/remove user to/from device", () => {});
  }

  it("Non-admin device member cannot add view or remove user to device", () => {
    // add non-admin user to device
    cy.apiAddUserToDevice(groupAdmin, deviceMember, camera);

    // non-admin cannot add another user
    cy.apiAddUserToDevice(deviceMember, userB, camera, false, HTTP_Forbidden);

    // non-admin cannot remove a user
    cy.apiRemoveUserFromDevice(
      deviceMember,
      deviceMember,
      camera,
      HTTP_Forbidden
    );

    // check group member cannot see user details
    // TODO: FAIL - Issue 63 - request should be rejected with Forbidden if user does not have permissions, not return empty array
    cy.apiCheckDevicesUsers(deviceMember, camera, []);

    // check user can be removed from device
    cy.apiRemoveUserFromDevice(groupAdmin, deviceMember, camera);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(groupAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  it("Non-admin group member cannot add view or remove user to device", () => {
    // add non-admin user to group
    cy.apiAddUserToGroup(groupAdmin, groupMember, group);

    // non-admin cannot add another user
    cy.apiAddUserToDevice(groupMember, userB, camera, false, HTTP_Forbidden);

    // non-admin cannot remove a user
    cy.apiRemoveUserFromDevice(
      groupMember,
      deviceMember,
      camera,
      HTTP_Forbidden
    );

    // check group member cannot see user details
    // TODO: FAIL - Issue 63 - request should be rejected with Unauthorised if user does not have permissions, not return empty array
    cy.apiCheckDevicesUsers(groupMember, camera, []);

    // check admin member can see ggroup member
    cy.apiCheckDevicesUsers(groupAdmin, camera, [
      groupMemberDetails,
      deviceAdminDetails,
      groupAdminDetails,
    ]);

    // remove user from group
    cy.apiRemoveUserFromGroup(groupAdmin, groupMember, group);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(groupAdmin, camera, [
      deviceAdminDetails,
      groupAdminDetails,
    ]);
  });

  it("Admin cannot add or remove user to another device", () => {
    // cannot add user to another group's devices
    cy.apiAddUserToDevice(
      groupAdmin,
      deviceMember,
      camera2,
      false,
      HTTP_Forbidden
    );

    // but group member can add group user
    cy.apiAddUserToDevice(userB, userC, camera2, true);

    // admin can't remove another groups users
    cy.apiRemoveUserFromDevice(groupAdmin, userB, camera2, HTTP_Forbidden);

    // check both users are there (delete failed)
    cy.apiCheckDevicesUsers(userB, camera2, [userBDetails, userCDetails]);

    // but device member can remove themselves
    cy.apiRemoveUserFromDevice(userC, userC, camera2);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(userB, camera2, [userBDetails]);
  });

  it("Can create a device admin-user who can then manage users", () => {
    // create an admin device user
    cy.apiAddUserToDevice(groupAdmin, userC, camera, true);

    // device admin user can add another user
    cy.apiAddUserToDevice(userC, userD, camera, true);

    // check both users are there (delete failed)
    cy.apiCheckDevicesUsers(userC, camera, [
      deviceAdminDetails,
      groupAdminDetails,
      userCDetails,
      userDDetails,
    ]);

    // Remove test users dfrom device
    cy.apiRemoveUserFromDevice(userC, userD, camera);
    cy.apiRemoveUserFromDevice(userC, userC, camera);
  });

  it("Invalid usernames rejected", () => {
    // add non existant user to device
    cy.apiAddUserToDevice(
      groupAdmin,
      "bad-user",
      camera,
      false,
      HTTP_Unprocessable
    );

    // remove non existant user from device
    cy.apiRemoveUserFromDevice(
      groupAdmin,
      "bad-user",
      camera,
      HTTP_Unprocessable
    );
  });
});
