// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateGroup(userName: string, groupName: string, log?: boolean): any;

    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateGroup(userName: string, groupName: string, log?: boolean): any;

    /**
     * Verify that user can see a group
     * Optionally verify they can't see the group (set testForSuccess=false)
     */
    apiCheckUserCanSeeGroup(
      username: string,
      groupname: string,
      testForSuccess?: boolean
    ): any;

    /**
     * Add user to group
     * Optionally check for fail response (statusCode!=200)
     */
    apiAddUserToGroup(
      groupAdminUser: string,
      userName: string,
      groupName: string,
      admin?: boolean,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Remove user from group
     * Optionally check for fail response (statusCode!=200)
     */
    apiRemoveUserFromGroup(
      groupAdminUser: string,
      userName: string,
      groupName: string,
      statusCode?: number
    ): any;
  }
}
