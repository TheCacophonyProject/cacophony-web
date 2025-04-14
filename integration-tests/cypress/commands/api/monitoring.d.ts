declare namespace Cypress {
  interface Chainable {
    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoring(
      userName: string,
      stationId: number,
      expectedVisits: TestComparableVisit[],
      log?: boolean,
    ): any;

    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoringWithFilter(
      userName: string,
      stationId: number | null,
      searchParams: TestVisitSearchParams,
      expectedVisits: TestComparableVisit[],
    ): any;
    /*
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoringTags(
      userName: string,
      stationId: number,
      expectedTags: string[],
    ): any;
  }
}
