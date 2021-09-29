// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiRecordingSet = import("../types").ApiRecordingSet;
  type ApiRecordingReturned = import("../types").ApiRecordingReturned;
  type TestThermalRecordingInfo = import("../types").TestThermalRecordingInfo;
  type RecordingId = number;

  interface Chainable {
    /** Check the values returned by /api/fileProcessing (get)
     * specify type and processingState (state)
     * Verify that the recording data matched the expectedRecording
     * Optionally: check for a non-200 statusCode
     * Optionally: check for a returned error message (additionalChecks.message)
     */
    processingApiCheck(
      type: string,
      state: string,
      expectedRecording: any,
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Post to /api/fileProcessing 'done' endpoint
     * recordingId and jobkey is looked up using recordingName
     * other parameters are passed to the endpoint transparently
     * Optionally: check for a non-200 statusCode
     */

    processingApiPost(
      recordingName: string,
      success: boolean,
      result: any,
      complete: boolean,
      newProcessedFileKey: string,
      statusCode?: number
    ): any;
    /**
     * upload a single recording to for a particular camera using deviceId and user credentials
     * Optionally, save the id against provided recordingName
     */
    apiRecordingAddOnBehalfUsingDevice(
      userName: string,
      deviceName: string,
      details: TestThermalRecordingInfo,
      recordingName?: string,
      fileName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<RecordingId>;

    /**
     * upload a single recording to for a particular camera using deviceName and groupName and user credentials
     * Optionally, save the id against provided recordingName
     */
    apiRecordingAddOnBehalfUsingGroup(
      userName: string,
      deviceName: string,
      groupName: string,
      data: ApiRecordingSet,
      recordingName?: string,
      fileName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<RecordingId>;

    /**
     * Upload a single recording using device credentials
     * Save the provided ID against the provided recording name
     * Optionally, check for a non-200 return statusCode
     */
    apiRecordingAdd(
      deviceName: string,
      data: ApiRecordingSet,
      fileName?: string,
      recordingName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /* Get a single recording using api/v1/recordings/{id}
     * Verfiy that the recording data matched the expectedRecording
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     */
    apiRecordingCheck(
      userName: string,
      recordingNameOrId: string,
      expectedRecording: ApiRecordingReturned,
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /* Query recordings (/api/v1/recordings) using where (query["where"]) and optional (query[...]) API parameters
     * Verfiy that the recording data matched the expectedRecordings
     * Optionally: check for a non-200 statusCode
     * Optionally: check returned messages for additionalChecks["message"]
     */
    apiRecordingsQueryCheck(
      userName: string,
      query: any,
      expectedRecordings?: ApiRecordingReturned[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /* Query recordings (/api/v1/recordings) using where (query["where"]) and optional (query[...]) API parameters
     * Verify that the recording data matched the expectedRecordings
     * Optionally: check for a non-200 statusCode
     * Optionally: check returned messages for additionalChecks["message"]
     */
    apiRecordingsCountCheck(
      userName: string,
      query: any,
      expectedCount: number,
      statusCode?: number,
      additionalChecks?: any
    ): number;

    /* Delete a single recording using api/v1/recordings/{id} DELETE
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     */
    apiRecordingDelete(
      userName: string,
      recordingNameOrId: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /* Mark a list of recordings (recordingIds[]) for reprocessing
     * Optionally: check for a non-200 statusCode
     * Optionally: check for a returned error message (additionalChecks["message"])
     */
    apiReprocess(
      userName: string,
      recordingIds: number[],
      statusCode?: number,
      additionalChecks?: any
    ): any;
  }
}
