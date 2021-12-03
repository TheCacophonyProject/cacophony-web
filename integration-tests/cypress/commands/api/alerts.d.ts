/// <reference types="../types" />

declare namespace Cypress {
  type ApiAlertCondition = import("@typedefs/api/alerts").ApiAlertCondition;
  interface Chainable {
    /**
     * Create an alert for a device. Optioanlly expect to fail with code: failCode
     */
    apiAlertAdd(
      userName: string,
      alertName: string,
      tag: ApiAlertCondition[],
      deviceName: string,
      frequency?: number,
      statusCode?: number
    ): any;

    /**
     * Read alerts for a device
     * Optionally expect to fail with statusCode!=200
     * expectedAlert can be null if non-200 statusCode is supplied
     */
    apiAlertCheck(
      userName: string,
      deviceName: string,
      expectedAlert: any,
      statusCode?: number
    ): any;
  }
}
