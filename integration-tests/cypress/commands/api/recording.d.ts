// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiRecordingSet = import("../types").ApiRecordingSet;
  type ApiRecordingReturned = import("../types").ApiRecordingReturned;
  type ApiRecordingColumns = import("../types").ApiRecordingColumns;
  type ApiRecordingNeedsTagReturned =
    import("../types").ApiRecordingNeedsTagReturned;
  type ApiRecordingDataMetadata = import("../types").ApiRecordingDataMetadata;
  type Interception = import("cypress/types/net-stubbing").Interception;
  type ApiRecordingResponse =
    import("@typedefs/api/recording").ApiRecordingResponse;
  type TestThermalRecordingInfo = import("../types").TestThermalRecordingInfo;
  type RecordingId = number;

  type ApiAudioRecordingResponse =
    import("@typedefs/api/recording").ApiAudioRecordingResponse;
  type ApiThermalRecordingResponse =
    import("@typedefs/api/recording").ApiThermalRecordingResponse;

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
      recordingName: string,
      expectedRecording: any,
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Put to /api/fileProcessing 'done' endpoint
     * recordingId and jobkey is looked up using recordingName
     * other parameters are passed to the endpoint transparently
     * Optionally: check for a non-200 statusCode
     */

    processingApiPut(
      recordingName: string,
      success: boolean,
      result: any,
      newProcessedFileKey: string,
      statusCode?: number
    ): any;

    /** Post to /api/fileProcessing/algorithm
     * Add or look up algorithm matching supplied JSON algorithm
     * Returns algorithmId
     */

    processingApiAlgorithmPost(algorithm: any): Chainable<number>;

    /** Post to /api/fileProcessing/:id/tracks
     * recordingId is looked up using recordingName
     * other parameters are passed to the endpoint transparently
     * Optionally: check for a non-200 statusCode
     */
    processingApiTracksPost(
      trackName: string,
      recordingName: string,
      data: any,
      algorithmId: number,
      statusCode?: number
    ): any;

    /** Post to /api/fileProcessing/:id/tracks/:trackId/tags
     * recordingId is looked up using recordingName
     * other parameters are passed to the endpoint transparently
     * Optionally: check for a non-200 statusCode
     */
    processingApiTracksTagsPost(
      trackName: string,
      recordingName: string,
      what: any,
      confidence: number,
      data?: any,
      statusCode?: number
    ): any;

    /** Delete from /api/fileProcessing/:id/tracks
     * recordingId is looked up using recordingName
     * Optionally: add additional parameters from additionalParams
     * Optionally: check for a non-200 statusCode
     */
    processingApiTracksDelete(recordingName: string, statusCode?: number): any;

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
      fileName?: string | { filename: string; key: string }[],
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
      fileName?: string | { filename: string; key: string }[],
      recordingName?: string,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<RecordingId>;

    /** Get a single recording response using api/v1/recordings/{id}
     */
    apiRecordingGet(
      userName: string,
      recordingNameOrId: RecordingId,
      statusCode?: number
    ): any;

    /** Get a single recording using api/v1/recordings/{id}
     * Verify that the recording data matched the expectedRecording
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     */
    apiRecordingCheck(
      userName: string,
      recordingNameOrId: string,
      expectedRecording: ApiRecordingResponse,
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Get a single recording that needs tagging using api/v1/recordings/needs-tag
     * Verify that the recording data matches (one of) the expectedRecordings
     * Optionally: check for a non-200 statusCode
     * Specify a devieNameOrId to bias towards or undefined for no bias
     * By default function looks up the device Id using the deviceNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawDeviceId"] === true
     * Optionally: do not validate returned recording data (addtionalChecks["doNotValidate"]=true
     */
    apiRecordingNeedsTagCheck(
      userName: string,
      deviceNameOrId: string,
      recordingName: string,
      expectedRecordings: ApiRecordingNeedsTagReturned[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Update a single recording using api/v1/recordings/{id} PATCH
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     * Optionally: check for returned messages (additionalChecks.message)
     */
    apiRecordingUpdate(
      userName: string,
      recordingNameOrId: string,
      updates: any,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Get thumbnail for recording using api/v1/recordings/{id}/thumbnail
     * Verify that the recording returns a file
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     */
    apiRecordingThumbnailCheck(
      userName: string,
      recordingNameOrId: string,
      statusCode?: number,
      additionalChecks?: any,
      trackName?: string
    ): any;

    /** Query recordings (/api/v1/recordings) using where (query["where"]) and optional (query[...]) API parameters
     * Verify that the recording data matched the expectedRecordings
     * Optionally: check for a non-200 statusCode
     * Optionally: check returned messages for additionalChecks["message"]
     */
    apiRecordingsQueryCheck(
      userName: string,
      query: any,
      expectedRecordings?: (
        | ApiThermalRecordingResponse
        | ApiAudioRecordingResponse
      )[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Query recordings (/api/v1/recordings/report) using where (query["where"]) and optional (query[...]) API parameters
     * Verify that the recording data matched the expectedRecordings
     * Optionally: check for a non-200 statusCode
     * Optionally: check returned messages for additionalChecks["message"]
     */
    apiRecordingsReportCheck(
      userName: string,
      query: any,
      expectedRecordings?: ApiRecordingColumns[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Query recordings count (/api/v1/recordings/count) using where (query["where"]) and optional (query[...]) API parameters
     * Verify that the recording data matched the expectedCount
     * Optionally: check for a non-200 statusCode
     * Optionally: check returned messages for addditionalChecks["message"]
     */
    apiRecordingsCountCheck(
      userName: string,
      query: any,
      expectedCount: number,
      statusCode?: number,
      additionalChecks?: any
    ): Cypress.Chainable<number>;

    /** Delete a single recording using api/v1/recordings/{id} DELETE
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     * Optionally: add additional paramaters to request (additionalChecks["additionalParams"]={...})
     */
    apiRecordingDelete(
      userName: string,
      recordingNameOrId: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Undelete a single recording using api/v1/recordings/{id}/undelete GET
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     * Optionally: add additional paramaters to request (additionalChecks["additionalParams"]={...})
     */
    apiRecordingUndelete(
      userName: string,
      recordingNameOrId: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /* Delete a single recording using api/v1/recordings/{id} DELETE
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     * Optionally: add additional paramaters to request (additionalChecks["additionalParams"]={...})
     */
    apiRecordingBulkDelete(
      userName: string,
      query: any,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /* Undelete recording using api/v1/recordings/undelete PATCH
     * Optionally: check for a non-200 statusCode
     * By default function looks up the recording Id using the recordingNameOrId supplied when
     * recording was created
     * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
     * Optionally: add additional paramaters to request (additionalChecks["additionalParams"]={...})
     */
    apiRecordingBulkUndelete(
      userName: string,
      recordingIds: number[],
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
