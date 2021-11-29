// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiDeviceResponse = import("@typedefs/api/device").ApiDeviceResponse;
  type ApiDeviceUserRelationshipResponse =
    import("@typedefs/api/device").ApiDeviceUserRelationshipResponse;

  interface Chainable {
    /**
     * create a device in the given group
     * optionally check for non-200 statusCode
     */
    apiDeviceAdd(
      deviceName: string,
      groupName: string,
      saltId?: number,
      password?: string,
      generateUniqueName?: boolean,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * register a device under a new group or name
     * optionally check for an error response (statusCode!=200OK)
     * optionally supply a password (autogenerate if not)
     * optionally check for non-200 statusCode
     */
    apiDeviceReregister(
      oldName: string,
      newName: string,
      newGroup: string,
      newPassword?: string,
      generateUniqueName?: boolean,
      statusCode?: number
    ): any;

    /**
     * Retrieve devices list from /devices
     * compare with expected device details (JSON equivalent to that returned by API)
     * pass optional params (params) to API call
     * optionally check for a non-200 status code
     */
    apiDevicesCheck(
      userName: string,
      expectedDevice: ApiDeviceResponse[],
      params?: any,
      statusCode?: number
    ): any;

    /**
     * Same as apiDevicesCheck but check the expected items are in the list, rather than the only things in the list
     */
    apiDevicesCheckContains(
      userName: string,
      expectedDevices: ApiDeviceResponse[],
      params?: string,
      statusCode?: number
    ): any;

    /**
     * Retrieve device details using name and groupname from /device/XX/in-group/YY
     * use groupId if provided, otherwise groupName - the unused parameter should be set to null
     * compare with expected device details (JSON equivalent to that returned by API)
     * optionally check for a non-200 status code
     */
    apiDeviceInGroupCheck(
      userName: string,
      deviceName: string,
      groupName: string | null,
      groupId: number | null,
      expectedDevices: ApiDeviceResponse,
      params?: any,
      statusCode?: number
    ): any;

    // FIXME - Delete?  Just use deviceInGroup?
    /**
     * Retrieve list of users  who can access a device from /devices/users
     * compare with expected list of users
     * takes deviceName and looks up the device Id to pass tot he API.  Hence deviceName must be unique within test environment
     * optionally check for a non-200 status code
     */
    apiDeviceUsersCheck(
      userName: string,
      deviceName: string,
      expectedUsers: ApiDeviceUserRelationshipResponse[],
      statusCode?: number
    ): any;

    // FIXME - Delete?  Doesn't disambiguate by group
    /**
     * Add user to a device using /device/users
     * Specify admin or non admin user (default=non-admin)
     * takes deviceName and looks up the device Id to pass tot he API.  Hence deviceName must be unique within test environment
     * optionally check for a non-200 status code
     * By default user name is made unique. Specify
     * additionalChecks.useRawUserName=true to keep name as supplied.
     */
    apiDeviceUserAdd(
      deviceAdminUser: string,
      userName: string,
      deviceName: string,
      admin?: boolean,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    // FIXME - Delete?  Doesn't disambiguate by group
    /**
     * Remove user from a device using /device/users
     * takes deviceName and looks up the device Id to pass to the API.  Hence deviceName must be unique within test environment
     * optionally check for a non-200 status code
     * By default user name is made unique. Specify
     * additionalChecks.useRawUserName=true to keep name as supplied.
     */
    apiDeviceUserRemove(
      deviceAdminUser: string,
      userName: string,
      deviceName: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Register a heartbeat for a device using /devices/heartbeat (POST)
     * Looks up the JWT using deviceName
     * Requires nextHeartbeat as an ISO timestamp
     * Optionally check for a non-200 statusCode
     * Optionally check for returned messages includes substring of 
     *   additionalChecks["message"]
     */
    apiDeviceHeartbeat(
      deviceName: string,
      nextHeartbeat: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

  }
}
