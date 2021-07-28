// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateGroup(
      userName: string,
      groupName: string,
      log?: boolean
    );

    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateGroup(
      userName: string,
      groupName: string,
      log?: boolean
    );

    /**
     * Verify that user can see a group
     * Optionally verify they can't see the group (set testForSuccess=false)
     */
     apiCheckUserCanSeeGroup(username: string, groupname: string, testForSuccess: boolean);

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
      statusCode: number
    );

    /**
     * Remove user from group
     * Optionally check for fail response (statusCode!=200)
     */
    apiRemoveUserToGroup(
      groupAdminUser: string,
      userName: string,
      groupName: string,
      statusCode: number
    );
  }
}
