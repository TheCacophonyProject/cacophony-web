// load the global Cypress types
/// <reference types="cypress" />
type ApiLoggedInUserResponse =
  import("@typedefs/api/user").ApiLoggedInUserResponse;
type ApiUserResponse = import("@typedefs/api/user").ApiUserResponse;

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
      additionalChecks?: any
    ): any;

    /**
     * Update user with parameters supplied in updates. Valid updates parameters are:
     * { userName: "..", password: "..", email: "..." }
     * Optionally, check for non-200 return statusCode
     * Optionally, check that returned error messages[] contains additionalChecks["message"]
     * By default makes the userNameOrId unique.
     * Optionally: Use the raw provided userNameOrId additionalChecks["useRawUserName"]==true
     */
    apiAdminUpdate(
      userName: string,
      updateUserNameOrId: string,
      permission: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Update user's super-user (global) permisssions
     * Optionally, check for non-200 return statusCode
     * Optionally, check that returned error messages[] contains additionalChecks["message"]
     */
    apiUserUpdate(
      userName: string,
      updates: any,
      statusCode?: number,
      additionalChecks?: any
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
     * Query an all users' details and check returned values
     * Optionally: exclude checks on specific parameters detailed in excludeCheckOn
     * Optionally, check for non-200 return statusCode
     * Optionally, check that returned error messages[] contains additionalChecks["message"]
     * By default returned usersList and expectedUsers are sorted by username before comparison
     * Optionally do not sort by specifcying additionalChecks["doNotSort"]=true
     * By default checks that the returned usersList MATCHES the expectedUsers
     * Optionally, check that usersLists CONTAINS expectedUsers (additionalChecks["contains"]=true)
     */
    apiUsersCheck(
      userName: string,
      expectedUsers: ApiUserResponse[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Query latest end user agreement version
     */
    apiEUACheck(expectedVersion: number): number;

    /**
     * create a group for the given user (who has already been referenced in the test
     */
    apiGroupAdd(userName: string, groupName: string, log?: boolean): any;

    /**
     * Request password reset on user by name
     * Optionally, check for non-200 return statusCode
     * By default makes the userName unique.
     * Optionally: Use the raw provided username additionalChecks["useRawUserName"]==true
     */
    apiResetPassword(
      userName: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Change password using reset token
     * Optionally, check for non-200 return statusCode
     */
    apiUserChangePassword(
      token: string,
      password: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

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
