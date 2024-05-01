// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  // Avoiding redefinition in this namespace
  type TestThermalRecordingInfoAlias =
    import("../types").TestThermalRecordingInfo;
  type RecordingIdAlias = import("@typedefs/api/common").RecordingId;

  interface Chainable {
    /**
     * Upload a single recording to for a particular camera using pre-rolled test metadata
     * using api/v1/recordings (POST)
     * Optionally check for a non-200 statusCode
     * Optionally, save the id against provided recordingName
     * Optionally specify the filename to upload (from fixtures directory)
     */
    testUploadRecording(
      deviceName: string,
      details: TestThermalRecordingInfoAlias,
      recordingName?: string,
      fileName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<RecordingIdAlias>;

    /**
     * Upload a single recording to for a particular camera using pre-rolled test metadata
     * using api/v1/recordings/device/{name}/device{name} (POST)
     * Add un behalf using user's credentials and specifying group and device
     * Optionally, save the id against provided recordingName
     * Optionally check for a non-200 statusCode
     * Optionally specify the filename to upload (from fixtures directory)
     */
    testUploadRecordingOnBehalfUsingGroup(
      userName: string,
      deviceName: string,
      groupName: string,
      details: TestThermalRecordingInfoAlias,
      recordingName?: string,
      fileName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<RecordingIdAlias>;

    /**
     * Upload a single recording to for a particular camera using pre-rolled test metadata
     * using api/v1/recordings/device/{idOrName} (POST)
     * Add on behalf using user's credentials and specifying device id or name
     * Optionally, save the id against provided recordingName
     * Optionally check for a non-200 statusCode
     * Optionally specify the filename to upload (from fixtures directory)
     */
    testUploadRecordingOnBehalfUsingDevice(
      userName: string,
      deviceName: string,
      details: TestThermalRecordingInfoAlias,
      recordingName?: string,
      fileName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<RecordingIdAlias>;

    testAddRecordingThenUserTag(
      deviceName: string,
      details: TestThermalRecordingInfoAlias,
      tagger: string,
      tag: string
    ): any;

    /**
     * Replaces an existing track tag for a recording.
     */
    testUserTagRecording(
      recordingId: number,
      trackIndex: number,
      tagger: string,
      tag: string
    ): any;

    /**
     * Adds a new user track tag to a recording.
     */
    testUserAddTagRecording(
      recordingId: number,
      trackIndex: number,
      tagger: string,
      tag: string
    ): any;

    testAddRecordingsAtTimes(
      deviceName: string,
      times: string[],
      location: { lat: number; lng: number }
    ): Cypress.Chainable<number[]>;

    // to be run straight after an apiRecordingAdd
    thenUserTagAs(tagger: string, tag: string): any;

    /**
     * Check recording count for device matches expected value
     */
    testCheckDeviceHasRecordings(
      userName: string,
      deviceName: string,
      count: number
    ): any;
    /**
     * Return a list of recording ids that match a query
     */

    testGetRecordingIdsForQuery(
      userName: string,
      where: any
    ): Cypress.Chainable<number[]>;

    /**
     * Delete all recordings matching state and type
     * (requires a superuser to be signed in prior using apiSignInAs ...)
     */
    testDeleteRecordingsInState(
      superuser: string,
      type: string,
      state: string
    ): any;
  }
}
