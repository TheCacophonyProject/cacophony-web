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
     * create a group for the given user (who has already been referenced in the test
     */
    apiCreateCamera(
      cameraName: string,
      group: string,
      log?: boolean
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
    * compare with expected device details (JSON equivalent to that retunred by API)
    * optioanlly check for a non-200 status code
    */
    apiCheckDevice(userName: string, cameraName: string, groupName: string, expectedDevice: ComparableDevice, statusCode: number): Chainable<Element>;

    /**
     * upload a file from a camera. Recording_name is the path to the raw cptv file
     *
     */
    apiUploadRecording(cameraName: string, recording_name: string);
  }
}
