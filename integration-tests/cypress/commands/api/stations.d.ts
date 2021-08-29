// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    // to be run straight after an apiRecordingAdd
    // check that the recording has been assigned the right station name. sS
    thenCheckStationIs(userName: string, station: string): any;

    // Only works if there is a single recording for the user
    checkRecordingsStationIs(userName: string, station: string): any;
  }
}
