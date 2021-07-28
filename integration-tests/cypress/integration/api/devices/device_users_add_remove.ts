/// <reference path="../../../support/index.d.ts" />

const HTTP_AuthorizationError = 401;
const HTTP_BadRequest = 400;
const HTTP_OK = 200;

import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";

describe("Devices add / view / remove users", () => {
  const group_admin = "Harold-group_admin";
  const group_member = "Henry-group_member";
  const device_admin = "Hermert-device_admin";
  const device_member = "Henrietta-device_member";
  const hacker = "HonestHacker";
  const group = "H-Team";
  const camera = "camera1";
  const NOT_ADMIN = false;
  const ADMIN = true;
  const group2 = "second_H_group";
  const userB = "Baldrick";
  const userC = "Candy";
  const userD = "Dylan";
  const camera2 = 'second_H_camera';
  const superuser = 'admin_test';
  const su_passwd = 'admin_test';
  let device_member_details;
  let device_admin_details;
  let group_admin_details;
  let group_member_details;
  let userB_details;
  let userC_details;
  let userD_details;
  let expectedDeviceInGroupUserView;

  before(() => {
    cy.apiCreateUser(group_member);
    cy.apiCreateUser(device_member);
    cy.apiCreateUser(device_admin);
    cy.apiCreateUser(hacker);
    cy.apiCreateUserGroupAndCamera(group_admin, group, camera).then(() => {
      device_member_details = {id: getCreds(device_member).id, username: getTestName(device_member), email: getTestName(device_member.toLowerCase())+"@api.created.com", relation: 'device', admin: false};
      device_admin_details = {id: getCreds(device_admin).id, username: getTestName(device_admin), email: getTestName(device_admin.toLowerCase())+"@api.created.com", relation: 'device', admin: true};
      group_admin_details = {id: getCreds(group_admin).id, username: getTestName(group_admin), email: getTestName(group_admin.toLowerCase())+"@api.created.com", relation: 'group', admin: true};
      group_member_details = {id: getCreds(group_member).id, username: getTestName(group_member), email: getTestName(group_member.toLowerCase())+"@api.created.com", relation: 'group', admin: false};
      expectedDeviceInGroupUserView={id: getCreds(camera).id, devicename: getTestName(camera), groupName: getTestName(group), userIsAdmin: false, users: null};
    });
    cy.apiAddUserToDevice(group_admin, device_admin, camera, ADMIN);

    // second group users & device
    cy.apiCreateUser(userC).then(() => {
      userC_details = {id: getCreds(userC).id, username: getTestName(userC), email: getTestName(userC.toLowerCase())+"@api.created.com", relation: 'device', admin: true};
    });
    cy.apiCreateUser(userD).then(() => {
      userD_details = {id: getCreds(userD).id, username: getTestName(userD), email: getTestName(userD.toLowerCase())+"@api.created.com", relation: 'device', admin: true};
    });
    cy.apiCreateUserGroupAndCamera(userB, group2, camera2).then(() => {
      userB_details = {id: getCreds(userB).id, username: getTestName(userB), email: getTestName(userB.toLowerCase())+"@api.created.com", relation: 'group', admin: true};
    });
  });

  it("Group admin can add/remove user to/from device", () => {
    // add user to device
    cy.apiAddUserToDevice(group_admin, device_member, camera);

    // check user (and group admin) are added
    cy.apiCheckDevicesUsers(group_admin, camera, [group_admin_details, device_admin_details, device_member_details]);

    // check user can access device (one endpoint only - test all endpoints in their own test specs )
    cy.apiCheckDeviceInGroup(device_member, camera, group, null, expectedDeviceInGroupUserView);

    // check user can be removed from device
    cy.apiRemoveUserFromDevice(group_admin, device_member, camera);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(group_admin, camera, [device_admin_details, group_admin_details]);
  });

  it("Device admin can add/remove user to/from device", () => {

    // add user to device
    cy.apiAddUserToDevice(device_admin, device_member, camera);

    // check user (and group admin) are added
    cy.apiCheckDevicesUsers(device_admin, camera, [device_admin_details, group_admin_details, device_member_details]);

    // check user can access device (one endpoint only - test all endpoints in their own test specs )
    cy.apiCheckDeviceInGroup(device_member, camera, group, null, expectedDeviceInGroupUserView);

    // check user can be removed from device
    cy.apiRemoveUserFromDevice(device_admin, device_member, camera);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(device_admin, camera, [device_admin_details, group_admin_details]);
  });

  //Do not run against a live server as we don't have superuser login
  if(Cypress.env('test_using_default_superuser')==true) {
    it("Superuser can add/remove user to/from device", () => {
      cy.apiSignInAs(null,null,superuser,su_passwd);
 
      // add user to device
      cy.apiAddUserToDevice(superuser, device_member, camera);
  
      // check user (and group admin) are added
      cy.apiCheckDevicesUsers(superuser, camera, [device_admin_details, group_admin_details, device_member_details]);
  
      // check user can access device (one endpoint only - test all endpoints in their own test specs )
      cy.apiCheckDeviceInGroup(device_member, camera, group, null, expectedDeviceInGroupUserView);
  
      // check user can be removed from device
      cy.apiRemoveUserFromDevice(superuser, device_member, camera);
  
      // check user (but not group admin) has been removed
      cy.apiCheckDevicesUsers(superuser, camera, [device_admin_details, group_admin_details]);
  
    });
  } else {
    it.skip("Superuser can add/remove user to/from device", () => {});
  }

  it("Non-admin device member cannot add view or remove user to device", () => {
    // add non-admin user to device
    cy.apiAddUserToDevice(group_admin, device_member, camera);

    // non-admin cannot add another user
    cy.apiAddUserToDevice(device_member, userB, camera, false, HTTP_AuthorizationError);
 
    // non-admin cannot remove a user
    cy.apiRemoveUserFromDevice(device_member, device_member, camera, HTTP_AuthorizationError);

    // check group member cannot see user details
    // TODO: FAIL - Issue 63 - request should be rejected with Unauthorised if user does not have permissions, not return empty array
    cy.apiCheckDevicesUsers(device_member, camera, []);

    // check user can be removed from device
    cy.apiRemoveUserFromDevice(group_admin, device_member, camera);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(group_admin, camera, [device_admin_details, group_admin_details]);

  });

  it("Non-admin group member cannot add view or remove user to device", () => {
    // add non-admin user to group
    cy.apiAddUserToGroup(group_admin, group_member, group);

    // non-admin cannot add another user
    cy.apiAddUserToDevice(group_member, userB, camera, false, HTTP_AuthorizationError);
 
    // non-admin cannot remove a user
    cy.apiRemoveUserFromDevice(group_member, device_member, camera, HTTP_AuthorizationError);

    // check group member cannot see user details
    // TODO: FAIL - Issue 63 - request should be rejected with Unauthorised if user does not have permissions, not return empty array
    cy.apiCheckDevicesUsers(group_member, camera, []);

    // check admin member can see ggroup member
    cy.apiCheckDevicesUsers(group_admin, camera, [group_member_details, device_admin_details, group_admin_details]);

    // remove user from group
    cy.apiRemoveUserFromGroup(group_admin, group_member, group);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(group_admin, camera, [device_admin_details, group_admin_details]);

  });

  it("Admin cannot add or remove user to another device", () => {
    // cannot add user to another group's devices
    cy.apiAddUserToDevice(group_admin, device_member, camera2, false, HTTP_AuthorizationError);

    // but group member can add group user
    cy.apiAddUserToDevice(userB, userC, camera2, true);

    // admin can't remove another groups users
    cy.apiRemoveUserFromDevice(group_admin, userB, camera2, HTTP_AuthorizationError);

    // check both users are there (delete failed)
    cy.apiCheckDevicesUsers(userB, camera2, [userB_details, userC_details]);

    // but device member can remove themselves
    cy.apiRemoveUserFromDevice(userC, userC, camera2);

    // check user (but not group admin) has been removed
    cy.apiCheckDevicesUsers(userB, camera2, [userB_details]);
  });

  it("Can create a device admin-user who can then manage users", () => {
    // create an admin device user
    cy.apiAddUserToDevice(group_admin, userC, camera, true);

    // device admin user can add another user
    cy.apiAddUserToDevice(userC, userD, camera, true);

    // check both users are there (delete failed)
    cy.apiCheckDevicesUsers(userC, camera, [device_admin_details, group_admin_details, userC_details, userD_details]);

    // Remove test users dfrom device
    cy.apiRemoveUserFromDevice(userC, userD, camera);
    cy.apiRemoveUserFromDevice(userC, userC, camera);

  });


  it("Invalid usernames rejected", () => {
    // add non existant user to device
    cy.apiAddUserToDevice(group_admin, 'bad-user', camera, false, HTTP_BadRequest);

    // remove non existant user from device
    cy.apiRemoveUserFromDevice(group_admin, 'bad-user', camera, HTTP_BadRequest);
  });
});
