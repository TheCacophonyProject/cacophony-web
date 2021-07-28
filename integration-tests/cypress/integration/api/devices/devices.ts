/// <reference path="../../../support/index.d.ts" />

const HTTP_AuthorizationError = 401;
const HTTP_BadRequest = 400;
const HTTP_OK = 200;

import { getTestName } from "../../../commands/names";
import { 
  makeAuthorizedRequest, 
  v1ApiPath,
  getCreds
} from "../../../commands/server";

describe("Devices list", () => {
  const group_admin = "Edith-group_admin";
  const group_member = "Edwin-group_member";
  const device_member = "Egbert-device_member";
  const device_admin = "Emett-device_admin";
  const hacker = "E-Hacker";
  const group = "Edith-Team";
  const group2 = "Second-E-Team";
  const group3 = "Charlie-Team";
  const camera = "E-camera1";
  const NOT_ADMIN = false;
  const ADMIN = true;
  const user2 = "Bridget";
  const user3 = "Charlie";
  const camera2 = 'second_E_camera';
  const camera3 = 'Charlie-camera';
  const camera4 = 'Debbie-camera';
  const superuser = 'admin_test';
  const su_passwd = 'admin_test';
  let expectedDeviceAdminView;
  let expectedDeviceMemberView;
  let expectedDevice2AdminView;
  let expectedDevice3AdminView;
  let expectedDevice4AdminView;

  before(() => {
    cy.apiCreateUser(group_member);
    cy.apiCreateUser(device_admin);
    cy.apiCreateUser(device_member);
    cy.apiCreateUser(hacker);
    cy.apiCreateUserGroupAndCamera(group_admin, group, camera).then(() => {
      expectedDeviceAdminView={
        id: getCreds(camera).id, devicename: getTestName(camera), active: true, Users: [
          {id: getCreds(device_admin).id, username: getTestName(device_admin), 
            DeviceUsers: {admin: true, DeviceId: getCreds(camera).id, UserId: getCreds(device_admin).id}},
          {id: getCreds(device_member).id, username: getTestName(device_member), 
            DeviceUsers: {admin: false, DeviceId: getCreds(camera).id, UserId: getCreds(device_member).id}},
        ]};   
      expectedDeviceMemberView={id: getCreds(camera).id, devicename: getTestName(camera), active: true, Users: null};
    });
    cy.apiAddUserToGroup(group_admin, group_member, group, NOT_ADMIN);
    cy.apiAddUserToDevice(group_admin, device_member, camera);
    cy.apiAddUserToDevice(group_admin, device_admin, camera, ADMIN);

    //second group
    cy.apiCreateUserGroupAndCamera(user2, group2, camera2).then(() => {
      expectedDevice2AdminView={id: getCreds(camera2).id, devicename: getTestName(camera2), active: true, Users: []};
    });
    
    //reregistered device
    cy.apiCreateUserGroupAndCamera(user3, group3, camera3);
    cy.apiAddUserToDevice(user3, user3, camera3);
    cy.apiDeviceReregister(camera3,camera4,group3).then(() => {
      expectedDevice3AdminView={id: getCreds(camera3).id, devicename: getTestName(camera3), active: false, Users: [{id: getCreds(user3).id, username: getTestName(user3), DeviceUsers: {admin: false, DeviceId: getCreds(camera3).id, UserId: getCreds(user3).id}}]};
      expectedDevice4AdminView={id: getCreds(camera4).id, devicename: getTestName(camera4), active: true, Users: []};
    });
  });

  //Do not run against a live server as we don't have superuser login
  if(Cypress.env('test_using_default_superuser')==true) {
    it("Super-user should see all devices including User details", () => {
      cy.apiSignInAs(null,null,superuser,su_passwd);

      const expectedDevice2AdminView={id: getCreds(camera2).id, devicename: getTestName(camera2), active: true, Users: []};
  
      cy.apiCheckDevices_contains(superuser, [expectedDeviceAdminView,expectedDevice2AdminView]);
    });
  } else {
    it.skip("Super-user should see all devices including User details", () => {});
  }

  //Do not run against a live server as we don't have superuser login
  if(Cypress.env('test_using_default_superuser')==true) {
    it("Super-user 'as user' should see only their devices and users only where they are device admin", () => {
      // note: if this test fails and does not clean up after itself, it will continue to fail until the superuser is removed from the old test devices
      cy.apiSignInAs(null,null,superuser,su_passwd);
      // add superuser to group2
      makeAuthorizedRequest(
        {
          method: "POST",
          url: v1ApiPath("groups/users"),
          body: {
            group: getTestName(group2),
            admin: true,
            username: superuser
          }
        },
        user2
      );
  
  
      cy.apiCheckDevices(superuser, [expectedDevice2AdminView], {"view-mode": "user"});
  
      //remove superuser from group2
      makeAuthorizedRequest(
        {
          method: "DELETE",
          url: v1ApiPath("groups/users"),
          body: {
            group: getTestName(group2),
            username: superuser
          }
        },
        user2
      );
  
  
    });
  } else {
    it.skip("Super-user 'as user' should see only their devices and users only where they are device admin", () => {});
  } 

  it("Group admin should see everything including device users", () => {
    cy.apiCheckDevices(group_admin, [expectedDeviceAdminView]);
  });

  it("Group member should be able to read all but device users", () => {
    // TODO: View of users is allowed here but not in single device view.  Issue 62. Enable member view when fixed
    //cy.apiCheckDevices(group_member, [expectedDeviceMemberView]);
    cy.apiCheckDevices(group_member, [expectedDeviceAdminView]);
  });

  it("Device admin should see everything including device users", () => {
    cy.apiCheckDevices(device_admin, [expectedDeviceAdminView]);
  });

  it("Device member should be able to read all but device users", () => {
    // TODO: View of users is allowed here but not in single device view.  Issue 62. Enable member view when fixed
    //cy.apiCheckDevices(device_member, [expectedDeviceMemberView]);
    cy.apiCheckDevices(device_member, [expectedDeviceAdminView]);
  });

  it("Non member should not have any access to any devices", () => {
    cy.apiCheckDevices(hacker, []);
  });

  it("Should display inactive devices only when requested", () => { 
    //verify inactive device is not shown by default
    cy.apiCheckDevices(user3, [expectedDevice4AdminView]);

    //verify inactive device is shown when inactive is requested
    cy.apiCheckDevices(user3, [expectedDevice3AdminView,expectedDevice4AdminView], {onlyActive: false});
  });



});

