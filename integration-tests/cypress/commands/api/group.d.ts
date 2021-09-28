// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiGroupsUserReturned = import("../types").ApiGroupsUserReturned;
  type ApiGroupReturned = import("../types").ApiGroupReturned;
  type ApiDeviceIdAndName = import("../types").ApiDeviceIdAndName;
  type ApiGroupsDevice = import("../types").ApiGroupsDevice;
  type ApiStationData = import("../types").ApiStationData;
  type ApiStationDataReturned = import("../types").ApiStationDataReturned;
  //type ApiDeviceResponse = import("../../../../types/api/device").ApiDeviceResponse;
  type ApiGroupUserRelationshipResponse =
    import("../../../../types/api/group").ApiGroupUserRelationshipResponse;

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
      expectedDevices: ApiDeviceResponse[],
      excludeCheckOn?: string[],
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
      log?: boolean,
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

    /**
     * POST to api/v1/groups/<groupidorname>/stations to add, update or retire stations from the group
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */
    apiGroupStationsUpdate(
      userName: string,
      groupIdOrName: string,
      stations: ApiStationData[],
      updateFrom?: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Call api/v1/groups/<groupidorname>/stations and check that returned values match expectedStations
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     * By default stations and expectedStations are sorted on userName before comparison
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
     */
    apiGroupsStationsCheck(
      userName: string,
      groupIdOrName: any,
      expectedStations: ApiStationDataReturned[],
      excludeCheckOn?: string[],
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
