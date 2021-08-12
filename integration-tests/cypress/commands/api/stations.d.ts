// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

declare namespace Cypress {
  interface Chainable {
    /**
     * upload stations data for a group
     */
    apiUploadStations(
      user: string,
      group: string,
      stations: ApiCreateStationData[],
      updateFrom?: Date
    ): any;

    /**
     * upload stations data for a group
     */
    apiCheckStations(
      user: string,
      group: string,
      stations: ApiCreateStationData[]
    ): any;

    // to be run straight after an uploadRecording
    // check that the recording has been assigned the right station name. sS
    thenCheckStationIs(user: string, station: string): any;

    // Only works if there is a single recording for the user
    checkRecordingsStationIs(user: string, station: string): any;
  }
}
