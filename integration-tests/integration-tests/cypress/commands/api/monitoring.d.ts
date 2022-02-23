// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
  type TestVisitSearchParams = import("../types").TestVisitSearchParams;
  type TestComparableVisit = import("../types").TestComparableVisit;
  interface Chainable {
    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoring(
      userName: string,
      deviceName: string,
      expectedVisits: TestComparableVisit[],
      log?: boolean
    ): any;

    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoringWithFilter(
      userName: string,
      deviceName: string,
      searchParams: TestVisitSearchParams,
      expectedVisits: TestComparableVisit[]
    ): any;
    /*
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoringTags(
      userName: string,
      deviceName: string,
      expectedTags: string[]
    ): any;
  }
}
