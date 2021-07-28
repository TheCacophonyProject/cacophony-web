// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * create user and save api credentials further use
     */
    apiCreateUser(userName: string, log?: boolean);

    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateGroup(
      userName: string,
      groupName: string,
      log?: boolean
    );

    /**
     * create user group and camera at the same time
     */
    apiCreateUserGroupAndCamera(
      userName: string,
      group: string,
      camera: string
    );

    /**
     * create user group and camera at the same time
     */
    apiCreateUserGroup(userName: string, group: string);


    /**
     * create user group and camera at the same time
     */
    apiCreateGroupAndCameras(userName: string, group: string, ...cameras : string[] );

  }
}
