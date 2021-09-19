/// <reference types="cypress" />

declare namespace Cypress {
  type TestComparablePowerEvent = import("../types").TestComparablePowerEvent;
  type ApiEventDetail = import("../types").ApiEventDetail;
  type ApiEventReturned = import("../types").ApiEventReturned;
  type ApiEventErrorCategory = import("../types").ApiEventErrorCategory;
  type ApiPowerEventReturned = import("../types").ApiPowerEventReturned;
  interface Chainable {
    /**
     * Record a event for this device using device's credentials
     * optionally, check for a non-200 status code returned
     */
    apiEventsAdd(
      deviceName: string,
      description?: ApiEventDetail,
      dates?: string[],
      eventDetailId?: number,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Record a event for this device using user's credentials
     * optionally, check for a non-200 status code returned
     */
    apiEventsDeviceAddOnBehalf(
      userName: string,
      deviceIdOrName: string,
      description?: ApiEventDetail,
      dates?: string[],
      eventDetailId?: number,
      log?: boolean,
      statusCode?: number
    ): any;

    /**
     * Query events and check against expected
     * Optionally check for a non 200 returned statusCode
     * optionally exclude checks on values of specific keys (excludeCheckOn)
     * by default both returned events and expected events are sorted by date before comparison to ensure same order
     * Optionally: disable sorting with additionalChecks.doNotSort=true
     * Optionally: specify an additonalChecks.offset as a value to verify against the offset parameter in the returned results
     *   (defaults to 0)
     * Optionally: specify an additonalChecks.count as a value to verify against the count parameter in the returned results
     *   (defaults to the number of entries in ExpectedEvents)
     */
    apiEventsCheck(
      userName: string,
      deviceName: string,
      queryParams: any,
      expectedEvents: ApiEventReturned[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: {}
    ): any;

    /**
     * Query errors and check against expected
     * Optionally check for a non 200 returned statusCode
     * optionally exclude checks on values of specific keys (excludeCheckOn)
     */
    apiEventsErrorsCheck(
      userName: string,
      deviceName: string,
      queryParams: any,
      expectedErrors: ApiEventErrorCategory[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Query power events and check against expected
     * Optionally check for a non 200 returned statusCode
     * Optionally exclude checks on values of specific keys (excludeCheckOn)
     * by default both returned events and expected events are sorted by lastStarted before comparison to ensure same order
     * Optionally: disable sorting with additionalChecks.doNotSort=true
     */
    apiPowerEventsCheck(
      userName: string,
      deviceName: string,
      queryParams: any,
      expectedEvent: ApiPowerEventReturned[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    // *************************************************************************************************************************************
    // Remaining functions are legacy code from old tests and may one day be removed once these tests are migrated to use the above functions
    // *************************************************************************************************************************************
    /**
     * Legacy test  function to check the this device is reported as stopped or not
     *
     */
    testPowerEventsCheckAgainstExpected(
      userName: string,
      deviceName: string,
      expectedEvent: TestComparablePowerEvent,
      statusCode?: number
    ): Chainable<Element>;

    /**
     * Legacy test function to check the this device has a matching event.
     * if supplied then Nth event will be checked where N is taken from eventNumber
     * eventName will be rendered unique _per test_
     */
    testEventsCheckAgainstExpected(
      userName: string,
      deviceName: string,
      eventName: string,
      eventNumber?: number,
      statusCode?: number
    ): Chainable<Element>;

    /**
     * Create a template event to compare received events against
     * eventName will be rendered unique _per test_
     */
    createExpectedEvent(
      name: string,
      userName: string,
      deviceName: string,
      recording: string,
      alertName: string
    ): any;
  }
}
