declare namespace Cypress {
  interface Chainable {
    /**
     * GET to api/v1/stations to retrieve all stations for current user
     * Check returned data matches expectedStations
     * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
     * Optionally check for fail response (statusCode!=200)
     * Optionally: check for returned additionalChecks["messages"]
     * Optionally: check for returned additionalChecks["warnings"]
     */
    apiStationsCheck(
      userName: string,
      expectedStations: ApiStationResponse[],
      excludeCheckOn?: any,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * GET to api/v1/stations/:stationId to retrieve a single station
     * Check returned data matches expectedStation
     * Optionally check for fail response (statusCode!=200)
     * By default stationId is looked up from name in stationIdOrName.
     * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
     * Optionally: check for returned additionalChecks["messages"]
     * Optionally: check for returned additionalChecks["warnings"]
     */
    apiStationCheck(
      userName: string,
      stationIdOrName: string,
      expectedStation: ApiStationResponse,
      excludeCheckOn?: any,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * PATCH to api/v1/stations/:stationId to update a single station
     * Optionally check for fail response (statusCode!=200)
     * By default stationId is looked up from name in stationIdOrName.
     * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
     * Optionally: check for returned additionalChecks["messages"]
     * Optionally: check for returned additionalChecks["warnings"]
     */
    apiStationUpdate(
      userName: string,
      stationIdOrName: string,
      stationUpdates: ApiStationData,
      fromDate?: string,
      untilDate?: string,
      retire?: boolean,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * DELETE to api/v1/stations/:stationId to delete a single station
     * Optionally check for fail response (statusCode!=200)
     * By default deleteRecordings is passed as true.
     * By default stationId is looked up from name in stationIdOrName.
     * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
     * Optionally: check for returned additionalChecks["messages"]
     * Optionally: check for returned additionalChecks["warnings"]
     */
    apiStationDelete(
      userName: string,
      stationIdOrName: string,
      deleteRecordings?: boolean,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /** Shortcut to apiStationUpdate which only sets the untilDate
     * (retirementDate)
     */
    testStationRetire(
      userName: string,
      stationIdOrName: string,
      retirementDate?: string,
      additionalChecks?: any
    ): Cypress.Chainable<void>;
  }
}
