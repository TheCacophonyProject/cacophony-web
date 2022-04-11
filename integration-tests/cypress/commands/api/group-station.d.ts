// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type ApiCreateStationData =
    import("@typedefs/api/station").ApiCreateStationData;
  interface Chainable {
    /**
     * POST to api/v1/groups/<groupidorname>/station to add a single station
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */

    apiGroupStationAdd(
      userName: string,
      groupIdOrName: string,
      station: ApiStationData,
      fromDate?: string,
      untilDate?: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * POST to api/v1/groups/<groupidorname>/stations to add, update or retire stations from the   group
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     */
    apiGroupStationsUpdate(
      userName: string,
      groupIdOrName: string,
      stations: ApiStationData[],
      updateFrom?: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Call api/v1/groups/<groupidorname>/station and check that returned values match expectedS  tation
     * Optionally check for fail response (statusCode!=200)
     * By default stationName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     * Optionally: use the raw stationName provided (additionalChecks["useRawStationName"]=true)
     */
    apiGroupStationCheck(
      userName: string,
      groupIdOrName: string,
      stationName: string,
      expectedStation: ApiStationResponse,
      excludeCheckOn?: any,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Call api/v1/groups/<groupidorname>/stations and check that returned values match expectedS  tations
     * Optionally check for fail response (statusCode!=200)
     * By default userName and groupName are converted into unique (for this test run) names.
     * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
     * By default stations and expectedStations are sorted on userName before comparison
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true  )
     */
    apiGroupsStationsCheck(
      userName: string,
      groupIdOrName: any,
      expectedStations: ApiStationResponse[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    // to be run straight after an apiRecordingAdd
    // check that the recording has been assigned the right station name. sS
    thenCheckStationNameIs(userName: string, station: string): any;
    thenCheckStationIdIs(userName: string, stationId: number): any;
    thenCheckStationIsNew(userName: string): any;

    // Only works if there is a single recording for the user
    checkRecordingsStationNameIs(userName: string, station: string): any;
    checkRecordingsStationIsNew(userName: string, recId: number): any;
  }
}
