// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiDevicesDevice = import("../types").ApiDevicesDevice;
  type ApiDeviceInGroupDevice = import("../types").ApiDeviceInGroupDevice;
  type TestDeviceAndGroup = import("../../../../types/api/device").TestDeviceAndGroup;
  type ApiDeviceQueryDevice = import("../types").ApiDeviceQueryDevice;
  type ApiDeviceUsersUser = import("../types").ApiDeviceUsersUser;

  interface Chainable {
    /**
     * create a device in the given group
     * optionally check for non-200 statusCode
     */
    apiCreateDevice(
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
    apiCheckDevices(
      userName: string,
      expectedDevice: ApiDevicesDevice[],
      params?: any,
      statusCode?: number
    ): any;

    /**
     * Same as apiCheckDevices but check the expected items are on the list, rather than the only things on the list
     */
    apiCheckDevicesContains(
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
    apiCheckDeviceInGroup(
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
    apiCheckDevicesQuery(
      userName: string,
      devicesArray: TestDeviceAndGroup[] | undefined,
      groupsArray: string[] | undefined,
      expectedDevice: ApiDeviceQueryDevice[],
      operator?: "and" | "or",
      statusCode?: number
    ): any;

    /**
     * Retrieve list of users  who can access a device from /devices/users
     * compare with expected list of users
     * takes devicename and looks up the device Id to pass tot he API.  Hence devicename must be unique within test environment
     * optionally check for a non-200 status code
     */
    apiCheckDevicesUsers(
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
     */
    apiAddUserToDevice(
      deviceAdminUser: string,
      userName: string,
      deviceName: string,
      admin?: boolean,
      statusCode?: number
    ): any;

    /**
     * Remove user from a device using /device/users
     * takes devicename and looks up the device Id to pass tot he API.  Hence devicename must be unique within test environment
     * optionally check for a non-200 status code
     */
    apiRemoveUserFromDevice(
      deviceAdminUser: string,
      userName: string,
      deviceName: string,
      statusCode?: number
    ): any;
  }
}
