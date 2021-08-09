/// <reference types="../types" />

declare namespace Cypress {
  type ApiAlertConditions = import("../types").ApiAlertConditions;
  interface Chainable {
    /**
     * Create an alert for a device. Optioanlly expect to fail with code: failCode
     */
    apiAddAlert(
      user: string,
      alertName: string,
      tag: ApiAlertConditions[],
      device: string,
      frequency?: number,
      statusCode?: number
    ): any;

    /**
     * Read alerts for a device
     * Optionally expect to fail with statusCode!=200
     * alertName can be null if non-200 statusCode is supplied
     */
    apiCheckAlert(
      user: string,
      device: string,
      alertName?: string,
      statusCode?: number
    ): any;

    /**
     * create a template alert to compare with
     */
    createExpectedAlert(
      name: string,
      alertName: string,
      frequencySeconds: number,
      conditions: ApiAlertConditions[],
      lastAlert: boolean,
      user: string,
      device: string
    ): any;
  }
}
