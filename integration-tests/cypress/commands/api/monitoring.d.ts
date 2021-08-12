// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

declare namespace Cypress {
  type TestVisitSearchParams = import("../types").TestVisitSearchParams;
  interface Chainable {
    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkMonitoring(
      user: string,
      camera: string,
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
      user: string,
      camera: string,
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
      user: string,
      camera: string,
      expectedTags: string[]
    ): any;
  }
}
