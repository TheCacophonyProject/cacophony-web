// load the global Cypress types
/// <reference types="cypress" />
type ApiStationResponse = import("@typedefs/api/station").ApiStationResponse;
declare namespace Cypress {
  type ApiGroupReturned = import("../types").ApiGroupReturned;
  type ApiDeviceIdAndName = import("../types").ApiDeviceIdAndName;
  type ApiGroupsDevice = import("../types").ApiGroupsDevice;
  type ApiStationDataAlias = import("../types").ApiStationData;
  type ApiStationDataReturned = import("../types").ApiStationDataReturned;
  type ApiDeviceResponseAlias =
    import("@typedefs/api/device").ApiDeviceResponse;
  type ApiGroupUserRelationshipResponse =
    import("@typedefs/api/group").ApiGroupUserResponse;

  interface Chainable {
    /**
     * create a group for the given user (who has already been referenced in the test)
     * Optionally check for fail response (statusCode!=200))
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */

    apiGroupAdd(
      userName: string,
      groupName: string,
      log?: boolean,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Add user to group
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */
    apiGroupUserAdd(
      groupAdminUser: string,
      userName: string,
      groupName: string,
      admin?: boolean,
      owner?: boolean,
      log?: boolean,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Invite user to group
     * Optionally check for fail response (statusCode!=200)
     * By default gropuAdminUser and groupName are converted into unique (for this test run) names.
     */
    apiGroupUserInvite(
      groupAdminUser: string,
      inviteeEmail: string,
      groupName: string,
      admin?: boolean,
      owner?: boolean,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Ask an admin user to join one of their groups.
     */
    apiGroupUserRequestInvite(
      groupAdminUserEmail: string,
      userName: string,
      groupName: string,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Accept a user request to join one of your groups.
     */
    apiGroupUserAcceptInviteRequest(
      groupAdminUser: string,
      token: string,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Accept group invitation
     * Optionally check for fail response (statusCode!=200)
     * By default invitedUser and groupName are converted into unique (for this test run) names.
     */
    apiGroupUserAcceptInvite(
      invitedUser: string,
      groupName: string,
      token: string,
      useExistingUser?: boolean,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Call api/v1/groups/<groupnameorid> and check that returned values match expectedGroups
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     * By default groups and expectedGroups are sorted on groupName before comparison and
     * devices by devicename, Users by username, GroupUsers by userId
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
     */
    apiGroupCheck(
      userName: string,
      groupNameOrId: string,
      expectedGroups: ApiGroupReturned[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Call api/v1/groups and check that returned values match expectedGroups
     * Optionally check for fail response (statusCode!=200)
     * By default groups and expectedGroups are sorted on groupName before comparison and
     * devices by devicename, Users by username, GroupUsers by userId
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
     */
    apiGroupsCheck(
      userName: string,
      where: any,
      expectedGroups: ApiGroupReturned[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Call api/v1/groups/<groupnameorid>/devices and check that returned values match expectedGroups
     * Optionally check for fail response (statusCode!=200)
     * By default devices and expectedDevices are sorted on devicename before comparison
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */
    apiGroupDevicesCheck(
      userName: string,
      groupNameOrId: any,
      expectedDevices: ApiDeviceResponseAlias[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Call api/v1/groups/<groupname>/users and check that returned values match expectedUsers
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     * By default users and expectedUsers are sorted on userName before comparison
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
     */
    apiGroupUsersCheck(
      userName: string,
      groupName: string,
      expectedUsers: ApiGroupUserRelationshipResponse[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Remove user from group
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */
    apiGroupUserRemove(
      groupAdminUser: string,
      userName: string,
      groupName: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /*******************************************************************************************************
     * Following are legacy test functions from old tests. The above standard-format API wrappers should be used in
     * preference to these functions.  These may be deleted in the future
     *****************************************************************************************************/

    /**
     * Verify that user can see a group
     * Optionally verify they can't see the group (set testForSuccess=false)
     */
    testGroupUserCheckAccess(
      username: string,
      groupname: string,
      testForSuccess?: boolean
    ): any;
  }
}
