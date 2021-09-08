// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiCreateStationData = import("@typedefs/api/station").ApiCreateStationData;
  interface Chainable {
    /**
     * upload stations data for a group
     */
    apiUploadStations(
      userName: string,
      groupName: string,
      stations: ApiCreateStationData[],
      updateFrom?: Date
    ): any;

    /**
     * upload stations data for a group
     */
    apiCheckStations(
      userName: string,
      groupName: string,
      stations: ApiCreateStationData[]
    ): any;

    // to be run straight after an uploadRecording
    // check that the recording has been assigned the right station name. sS
    thenCheckStationIs(userName: string, station: string): any;

    // Only works if there is a single recording for the user
    checkRecordingsStationIs(userName: string, station: string): any;
  }
}
