// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

declare namespace Cypress {
  interface Chainable {
    /**
     * create user and save api credentials further use
     */
    apiCreateUser(userName: string, log?: boolean): any;

    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateGroup(
      userName: string,
      groupName: string,
      log?: boolean
    ): any;

    /**
     * create user group and camera at the same time
     */
    apiCreateUserGroupAndDevice(
      userName: string,
      group: string,
      camera: string
    ): any;

    /**
     * create user group and camera at the same time
     */
    apiCreateUserGroup(userName: string, group: string): any;


    /**
     * create user group and camera at the same time
     */
    apiCreateGroupAndDevices(userName: string, group: string, ...cameras : string[]): any;

  }
}
