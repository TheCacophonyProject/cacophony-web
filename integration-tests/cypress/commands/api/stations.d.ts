// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiCreateStationData =
    import("@typedefs/api/station").ApiCreateStationData;
  type ApiUpdateStationData =
    import("@typedefs/api/station").ApiUpdateStationData;
  type StationId = import("@typedefs/api/common").StationId;
  type Station = import("@typedefs/api/station").ApiStationResponse;
  interface Chainable {
    // to be run straight after an apiRecordingAdd
    // check that the recording has been assigned the right station name. sS
    thenCheckStationIs(
      userName: string,
      station: string
    ): Cypress.Chainable<StationId>;

    thenCheckAutomaticallyGeneratedStationIsAssignedToRecording(
      userName: string,
      deviceName: string
    ): Cypress.Chainable<StationId>;

    testRetireStation(
      userName: string,
      stationId: StationId,
      retirementDate?: Date
    ): Cypress.Chainable<void>;

    testUpdateStation(
      userName: string,
      stationId: StationId,
      stationUpdates?: ApiUpdateStationData | null,
      fromDate?: Date | null,
      untilDate?: Date | null
    ): Cypress.Chainable<void>;

    testDeleteStation(
      userName: string,
      stationId: StationId,
      deleteRecordings?: boolean
    ): Cypress.Chainable<void>;

    testGetStation(
      userName: string,
      stationId: StationId
    ): Cypress.Chainable<Station>;

    testCreateStation(
      groupName: string,
      userName: string,
      stationData: ApiCreateStationData,
      fromDate?: Date | null,
      untilDate?: Date | null,
      returnBody?: boolean,
      expectedStatus?: number
    ): Cypress.Chainable<StationId>;

    thenCheckStationBeginsWith(
      userName: string,
      deviceName: string
    ): Cypress.Chainable<StationId>;

    thenCheckRecordingsStationHasId(
      userName: string,
      stationId: StationId
    ): Cypress.Chainable<StationId>;

    // Only works if there is a single recording for the user
    checkRecordingsStationIs(
      userName: string,
      station: string
    ): Cypress.Chainable<StationId>;

    apiStationCheck(
      userName: string,
      stationId: StationId,
      expectedStation: ApiStationResponse,
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;
  }
}
