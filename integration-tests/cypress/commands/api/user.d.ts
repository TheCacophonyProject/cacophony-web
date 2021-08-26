// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * create user and save api credentials further use
     */
    apiUserAdd(userName: string, log?: boolean): any;

    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiGroupAdd(userName: string, groupName: string, log?: boolean): any;

    /**
     * create user group and camera at the same time
     */
    testCreateUserGroupAndDevice(
      userName: string,
      group: string,
      camera: string
    ): any;

    /**
     * create user group and camera at the same time
     */
    testCreateUserAndGroup(userName: string, group: string): any;

    /**
     * create user group and camera at the same time
     */
    testCreateGroupAndDevices(
      userName: string,
      group: string,
      ...cameras: string[]
    ): any;
  }
}
