/// <reference types="cypress" />
/// <reference types="../types" />

declare namespace Cypress {
  interface Chainable {
    /**
     * Record a event for this device
     */
    recordEvent( cameraName: string, type: string, details?: any, date?: Date, log?: boolean);
    /**
     * check the this device is reported as stopped or not
     *
     */
    checkPowerEvents(
      user: string,
      camera: string,
      expectedEvent: TestComparablePowerEvent
    ): Chainable<Element>;
    /**
     * check the this device has a matching event. 
     * if supplied then Nth event will be checked where N is taken from eventNumber
     * eventName will be rendered unique _per test_
     */
    apiCheckEvents(
      user: string,
      camera: string,
      eventName: string,
      eventNumber?: number
    ): Chainable<Element>;
    /**
     * Create a template event to compare received events against
     * eventName will be rendered unique _per test_
     */
    createExpectedEvent(name: string, user: string, device: string, recording: string, alertName: string);
  }
}
