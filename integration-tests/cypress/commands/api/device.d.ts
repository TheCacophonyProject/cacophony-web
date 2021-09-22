// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiDevicesDevice = import("../types").ApiDevicesDevice;
  type ApiDeviceInGroupDevice = import("../types").ApiDeviceInGroupDevice;
  type TestDeviceAndGroup = import("../types").TestDeviceAndGroup;
  type ApiDeviceQueryDevice = import("../types").ApiDeviceQueryDevice;
  type ApiDeviceUsersUser = import("../types").ApiDeviceUsersUser;

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
     * compare with expected device details (JSON equivalent to that retunred by API)
     * pass optional params (params) to API call
     * optionally check for a non-200 status code
     */
    apiDevicesCheck(
      userName: string,
      expectedDevice: ApiDevicesDevice[],
      params?: any,
      statusCode?: number
    ): any;

    /**
     * Same as apiDevicesCheck but check the expected items are on the list, rather than the only things on the list
     */
    apiDevicesCheckContains(
      userName: string,
      expectedDevices: ApiDevicesDevice[],
      params?: string,
      statusCode?: number
    ): any;

    /**
     * Retrieve device details using name and groupname from /device/XX/in-group/YY
     * use groupId if provided, otherwise groupName - the unused parameter should be set to null
     * compare with expected device details (JSON equivalent to that retunred by API)
     * optionally check for a non-200 status code
     */
    apiDeviceInGroupCheck(
      userName: string,
      deviceName: string,
      groupName: string,
      groupId: number,
      expectedDevices: ApiDeviceInGroupDevice,
      params?: any,
      statusCode?: number
    ): any;

    /**
     * Retrieve list of devices matching  name and groupname or just groupname from /devices/query
     * compare with expected device details (JSON equivalent to that retunred by API)
     * optionally use operator to specify whether to AND or OR the groups and devices conditions supplier (default=OR)
     * optionally check for a non-200 status code
     */
    apiDeviceQueryCheck(
      userName: string,
      devicesArray: TestDeviceAndGroup[],
      groupsArray: string[],
      expectedDevice: ApiDeviceQueryDevice[],
      opertor?: string,
      statusCode?: number
    ): any;

    /**
     * Retrieve list of users  who can access a device from /devices/users
     * compare with expected list of users
     * takes devicename and looks up the device Id to pass tot he API.  Hence devicename must be unique within test environment
     * optionally check for a non-200 status code
     */
    apiDeviceUsersCheck(
      userName: string,
      deviceName: string,
      expectedUsers: ApiDeviceUsersUser[],
      statusCode?: number
    ): any;

    /**
     * Add user to a device using /device/users
     * Specify admin or non admin user (defualt=non-admin)
     * takes devicename and looks up the device Id to pass tot he API.  Hence devicename must be unique within test environment
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

    /**
     * Remove user from a device using /device/users
     * takes devicename and looks up the device Id to pass tot he API.  Hence devicename must be unique within test environment
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
  }
}
