// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiDeviceResponse = import("@typedefs/api/device").ApiDeviceResponse;
  type LatLng = import("@typedefs/api/common").LatLng;
  type ApiGroupsUserRelationshipResponse =
    import("@typedefs/api/group").ApiGroupUserResponse;
  type DeviceType = import("@typedefs/api/consts").DeviceType;
  type DeviceHistoryEntry = import("@commands/types").DeviceHistoryEntry;
  type DeviceId = import("@typedefs/api/common").DeviceId;

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
    ): Cypress.Chainable<DeviceId>;

    /**
     * Upate a device's station (deviceHistory) at a given time
     * optionally check for non-200 statusCode
     * By default deviceId and stationId are looked up from
     * names in deviceIdOrName and stationIdOrName
     * Optionally supply raw ids by specifying
     *   additonalParams: {useRawDeviceId: true}
     *   additonalParams: {useRawStationId: true}
     */
    apiDeviceFixLocation(
      userName: string,
      deviceIdOrName: string,
      stationFromDate: string,
      stationIdOrName: string,
      location?: LatLng,
      statusCode?: number,
      additionalParams?: any
    ): any;

    /**
     * Get history for a device
     * compare with expected history
     * by default DeviceId is looked up using name.  Set additionalChecks["useRawDeviceId"]=true to use Id provided
     * By default history and expectedHistory are sorted before comparison
     * Set additionalChecks["doNotSort"]=true to skip sorting
     * optionally check for a non-200 status code
     */
    apiDeviceHistoryCheck(
      userName: string,
      deviceIdOrName: string,
      expectedHistory: any[],
      statusCode?: number,
      additionalChecks?: any
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
     */
    apiDevice(userName: string, deviceName: string, statusCode?: number): any;

    /**
     * Retrieve device details using name and groupname from /device/XX/in-group/YY
     * use groupId if provided, otherwise groupName - the unused parameter should be set to null
     */
    apiDeviceInGroup(
      userName: string,
      deviceName: string,
      groupName: string | null,
      groupId: number | null,
      expectedDevices: ApiDeviceResponse,
      params?: any,
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
      expectedUsers: ApiGroupsUserRelationshipResponse[],
      statusCode?: number
    ): any;

    apiDeviceHeartbeat(
      deviceName: string,
      nextHeartbeat: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Retrieve list of users  who can access a device from /devices/users
     * compare with expected list of users
     * takes deviceName and looks up the device Id to pass tot he API.  Hence deviceName must be unique within test environment
     * optionally check for a non-200 status code
     */
    createDeviceStationRecordingAndFix(
      userName: string,
      deviceName: string,
      stationName: string,
      recName: string,
      group: string,
      oldLocation: LatLng,
      newLocation: LatLng,
      recTime: string,
      stationTime: string,
      move?: boolean,
      additionalRecTime?: string
    ): any;
  }
}
