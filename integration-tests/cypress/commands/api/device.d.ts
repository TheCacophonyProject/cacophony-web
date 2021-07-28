// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * Record a event for this device
     */
    recordEvent(
      cameraName: string,
      type: string,
      details?: any,
      date?: Date,
      log?: boolean
    );

    /**
     * create a device in the given group
     */
    apiCreateCamera(
      cameraName: string,
      group: string,
      saltId: number,
      log: boolean,
      statusCode: number
    );

     /**
     *register a device under a new group or name
     *optionally check for an error response (statusCode!=200OK)
     *optionally supply a password (autogenerat if not)
     */
    apiDeviceReregister(
      oldName: string,
      newName: string,
      newGroup: string,
      newPassword: string,
      log: boolean,
      statusCode: number
    );


    /**
     * use to test when a camera should not be able to be created.
     *
     * Use makeCameraNameTestName = false if you don't want cy_ etc added to the camera name
     */
    apiShouldFailToCreateCamera(
      cameraName: string,
      group: string,
      makeCameraNameTestName?: boolean
    );


    /**
    * Retrieve device details using name and groupname
    * use groupId if provided, otherwise groupName
    * compare with expected device details (JSON equivalent to that retunred by API)
    * optioanlly check for a non-200 status code
    */
    apiCheckDeviceInGroup(userName: string, cameraName: string, groupName: string, groupId: number, expectedDevice: all, statusCode: number);


    /**
    * Retrieve devices list
    * compare with expected device details (JSON equivalent to that retunred by API)
    * pass optional params (params) to API call
    * optionlly check for a non-200 status code
    */
    apiCheckDevices(userName: string, expectedDevice: [ComparableDevice], params: string, statusCode: number);

    /**
     * upload a file from a camera. Recording_name is the path to the raw cptv file
     *
     */
    apiUploadRecording(cameraName: string, recording_name: string);
  }
}
