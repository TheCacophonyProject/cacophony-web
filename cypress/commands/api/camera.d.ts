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
     * upload a file from a camera. Recording_name is the path to the raw cptv file
     *
     */
    apiUploadRecording(cameraName: string, recording_name: string);
  }
}
