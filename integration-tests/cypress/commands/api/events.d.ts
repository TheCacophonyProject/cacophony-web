/// <reference types="cypress" />
/// <reference types="../types" />

declare namespace Cypress {
  type TestComparablePowerEvent = import("../types").TestComparablePowerEvent;
  interface Chainable {
    /**
<<<<<<< HEAD
     * Record a event for this device using device's credentials
     * optionally, check for a non-200 status code returned
     */
    apiEventsAdd(
      camera: string,
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
      user: string,
      camera: string,
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
      user: string,
      device: string,
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
      user: string,
      device: string,
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
      user: string,
      device: string,
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
=======
     * Record a event for this device
     */
    recordEvent(
      cameraName: string,
      type: string,
      details?: any,
      date?: Date,
      log?: boolean
    ): any;

    /**
     * check the this device is reported as stopped or not
>>>>>>> main
     *
     */
    apiPowerEventsCheckAgainstExpected(
      user: string,
      camera: string,
<<<<<<< HEAD
      expectedEvent: TestComparablePowerEvent,
      statusCode?: number
    ): Chainable<Element>;

    /**
     * Legacy test function to check the this device has a matching event.
=======
      expectedEvent: TestComparablePowerEvent
    ): Chainable<Element>;

    /**
     * check the this device has a matching event.
>>>>>>> main
     * if supplied then Nth event will be checked where N is taken from eventNumber
     * eventName will be rendered unique _per test_
     */
    apiEventsCheckAgainstExpected(
      user: string,
      camera: string,
      eventName: string,
<<<<<<< HEAD
      eventNumber?: number,
      statusCode?: number
=======
      eventNumber?: number
>>>>>>> main
    ): Chainable<Element>;

    /**
     * Create a template event to compare received events against
     * eventName will be rendered unique _per test_
     */
    createExpectedEvent(
      name: string,
      user: string,
      device: string,
      recording: string,
      alertName: string
    ): any;
  }
}
