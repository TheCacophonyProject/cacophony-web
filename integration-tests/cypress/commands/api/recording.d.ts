// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type TestThermalRecordingInfo = import("../types").TestThermalRecordingInfo;
  type ApiRecordingData = import("../types").ApiRecordingData;
  type ApiRecordingDataMetadata = import("../types").ApiRecordingDataMetadata;
  type Interception = import("cypress/types/net-stubbing").Interception;
  type RecordingId = number;

  interface Chainable {
    /**
     * upload a single recording to for a particular camera using deviceId and user credentials
     * Optionally, save the id against provided recordingName
     */
    apiRecordingAddOnBehalfUsingDevice(
      deviceName: string,
      userName: string,
      details: TestThermalRecordingInfo,
      log?: boolean,
      recordingName?: string
    ): Cypress.Chainable<RecordingId>;

    /**
     * upload a single recording to for a particular camera using devicename and groupname and user credentials
     * Optionally, save the id against provided recordingName
     */
    apiRecordingAddOnBehalfUsingGroup(
      deviceName: string,
      groupName: string,
      userName: string,
      details: TestThermalRecordingInfo,
      log?: boolean,
      recordingName?: string
    ): Cypress.Chainable<RecordingId>;

    /**
     * Upload a single recording using device credentials
     * Save the provided ID against the provided recording name
     * Optionally, check for a non-200 return statusCode
     */
    apiRecordingAdd(
      recordingName: string,
      deviceName: string,
      data: ApiRecordingData,
      fileName: string,
      metadata: ApiRecordingDataMetadata,
      statusCode: number,
      additionalChecks: any
    ): any;

    /**
     * upload a single recording to for a particular camera using pre-rolled test metadata
     * Optionally, save the id against provided recordingName
     */
    testUploadRecording(
      deviceName: string,
      details: TestThermalRecordingInfo,
      log?: boolean,
      recordingName?: string,
      statusCode?: number
    ): Cypress.Chainable<RecordingId>;

    testAddRecordingThenUserTag(
      deviceName: string,
      details: TestThermalRecordingInfo,
      tagger: string,
      tag: string
    ): any;

    testUserTagRecording(
      recordingId: number,
      trackIndex: number,
      tagger: string,
      tag: string
    ): any;

    testAddRecordingsAtTimes(deviceName: string, times: string[]): any;

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
  }
}
