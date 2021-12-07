// load the global Cypress types
/// <reference types="cypress" />
type ApiLoggedInUserResponse = import("@typedefs/api/user").ApiLoggedInUserResponse;

declare namespace Cypress {
  interface Chainable {
    /**
     * Create user and save api credentials further use
     * By default makes the userName unique. 
     * Optionally: Use the raw provided username additionalChecks["useRawUserName"]==true
     * By default unique password, email are generated.  Optionally supply these parameters
     * By default set endUserAgreement to latest value. Optionally supply this parameter
     * Optionally, check for non-200 return statusCode
     * Optionally, check that returned error messages[] contains additionalChecks["message"]
     */
    apiUserAdd(
      userName: string,
      password?: string,
      email?: string,
      endUserAgreement?: number,
      statusCode?: number,
      additionalChecks?: any,
    ): any;


    /**
     * Query an individual user's details by name or id and check returned values
     * Note: userName is the user doing the query
     *       checkedUserNameOrId is the user being queried
     * Optionally: exclude checks on specific parameters detailed in excludeCheckOn
     * Optionally, check for non-200 return statusCode
     * Optionally, check that returned error messages[] contains additionalChecks["message"]
     */
    apiUserCheck(
      userName: string,
      checkedUserNameOrId: string,
      expectedUser: ApiLoggedInUserResponse,
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

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
