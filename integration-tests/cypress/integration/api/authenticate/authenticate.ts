/// <reference path="../../../support/index.d.ts" />
import { getTestName } from "../../../commands/names";

const HTTP_AuthorizationError = 401;
const HTTP_BadRequest = 400;
const HTTP_OK = 200;


describe("Authentication", () => {
  const group1 = "first_group";
  const group2 = "second_group";
  const userA = "Alice";
  const userB = "Barbara";
  const camera1 = 'first_camera';
  const camera2 = 'second_camera';

  before(() => {
    cy.apiCreateUserGroupAndCamera(userA, group1, camera1);
    cy.apiCreateUserGroupAndCamera(userB, group2, camera2);
  });

  it("Can authenticate as a device", () => {
    cy.apiAuthenticateDevice(camera1,group1);
  });

  it("Device is correctly rejected if password is wrong", () => {
    cy.apiAuthenticateDevice(camera1,group1,'wrong-password',HTTP_AuthorizationError);
  });

  it("Device is correctly rejected if devicename is wrong", () => {
    cy.apiAuthenticateDevice(camera2,group1,'p'+getTestName(camera1),HTTP_AuthorizationError);
  });

  it("Device is correctly rejected if groupname is wrong", () => {
    cy.apiAuthenticateDevice(camera1,group2,'p'+getTestName(camera1),HTTP_AuthorizationError);
  });

  it("Can authenticate as a user using name", () => {
    cy.apiSignInAs(userA);
  });

  it("Can authenticate as a user using email", () => {
    cy.apiSignInAs(null,getTestName(userA)+'@api.created.com',null,'p'+getTestName(userA));
  });

  it("Can authenticate as a user using nameoremail", () => {
    //test using email
    cy.apiSignInAs(null,null,getTestName(userA)+'@api.created.com','p'+getTestName(userA));
    //test using name
    cy.apiSignInAs(null,null,getTestName(userA),'p'+getTestName(userA));
  });

  it("User is rejected for wrong password", () => {
    //test using username & name
    cy.apiSignInAs(userA,null,null,'bad_password',401);
    //test using email and email
    cy.apiSignInAs(null,getTestName(userA)+'@api.created.com',null,'bad_password',HTTP_AuthorizationError);
    //test using nameoremail and email
    cy.apiSignInAs(null,null,getTestName(userA)+'@api.created.com','bad_password', HTTP_AuthorizationError);
    //test using nameoremail and name
    cy.apiSignInAs(null,null,getTestName(userA),'bad_password',401);
  });

  it("Superuser can authenticate as another user and receive their permissions", () => {
    cy.apiSignInAs(null,null,'admin_test','admin_test');
    //admin_test authenticates as Bruce
    cy.apiAuthenticateAs('admin_test', userB);
    //verify each user gets their own data
    cy.apiCheckUserCanSeeGroup(userB+'_on_behalf',group2);
    //vefiry user cannot see items outside their group (i.e. are not super_user)
    cy.apiCheckUserCanSeeGroup(userB+'_on_behalf',group1,false);
  });

  it("Non-superuser cannot authenticate as another user", () => {
    cy.apiSignInAs(userA);
    //verify non superuser userA cannot authenticte as userB
    cy.apiAuthenticateAs(userA, userB, 401);
  });

  // TODO: Temporary token features appear to be broken  for everything except /devices/query. Test disabled until this is resolved
  //

  it("Temp Token - User can obtain a temporary readonly token for user's devices", () => {
    cy.apiSignInAs(userA);

    // issue a temporary readonly token for devices
    cy.apiToken(userA, null, {'devices': 'r'});

    //get device
    cy.apiCheckDevicesQuery(userA+"_temp_token",[{"devicename": getTestName(camera1), "groupname": getTestName(group1)}],'and',HTTP_OK);

    //TODO: enable the remainder of the checks once issue 57 is fixed, or remove the remaining checks if we do not implement.

    //get devices list
    //cy.apiCheckDevices(userA+"_temp_token",[{id: getCreds(camera1).id, devicename: getTestName(camera1), groupName: getTestName(group1), userIsAdmin: true, Users: []}]);

    //get device users

    //upload a recording for device (using user's main token)
    //cy.uploadRecordingOnBehalfUsingDevice(camera1, userA, { tags: ["possum"]}, null, 'recording1');

    //retrieve recording for device
    //cy.apiCheckDeviceHasRecordings(userA+'_temp_token',camera1,1);

    //vefiry user cannot see items outside their group (i.e. are not super_user)
    //cy.apiCheckDevice(userA+"_temp_token",camera1,group1,{},HTTP_AuthorizationError);
  });

  it.skip("Temp Token - superuser can obtain a temporary token", () => {
  });

  it.skip("Temp Token - User can restrict token access by entity type", () => {
  });

  it.skip("Temp Token times out as specified", () => {
  });


});

