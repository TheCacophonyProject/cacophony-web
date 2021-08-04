/// <reference types="cypress" />
/// <reference types="../types" />

declare namespace Cypress {
  interface Chainable {
    /**
     * Record a event for this device
     */
    apiEventAdd(camera: string, description?: ApiEventDetail, dates?: string[], eventDetailId?: number, log?: boolean, statusCode?: number): any;
    /**
     * Query events and check against expected
     * optionally exclude checks on values of specific keys (excludeCkeckOn)
     */
    apiEventsCheck(user: string, device: string, queryParams: any, expectedEventDetails: ApiEventReturned[], excludeCheckOn?: string[], statusCode?: number): any;

    /**
     * Record a event for this device
     */
    apiEventsDeviceAddOnBehalf(user: string, camera: string, description?: ApiEventDetail, dates?: string[], eventDetailId?: number, log?: boolean, statusCode?: number): any;

    /**
     * check the this device is reported as stopped or not
     *
     */
    apiPowerEventsCheck( user: string, camera: string, expectedEvent: TestComparablePowerEvent, statusCode?: number): Chainable<Element>;

    /**
     * check the this device has a matching event. 
     * if supplied then Nth event will be checked where N is taken from eventNumber
     * eventName will be rendered unique _per test_
     */
    apiEventsCheckAgainstExpected( user: string, camera: string, eventName: string, eventNumber?: number, statusCode?: number): Chainable<Element>;

    /**
     * Create a template event to compare received events against
     * eventName will be rendered unique _per test_
     */
    createExpectedEvent(name: string, user: string, device: string, recording: string, alertName: string): any;
  }
}
