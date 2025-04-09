declare namespace Cypress {
  interface Chainable {
    /**
     * Create an alert for a device. Optioanlly expect to fail with code: failCode
     */
    apiDeviceAlertAdd(
      userName: string,
      alertName: string,
      tag: ApiAlertCondition[],
      deviceName: string,
      frequency?: number,
      statusCode?: number,
    ): Cypress.Chainable<AlertId>;

    /**
     * Create an alert for a station. Optioanlly expect to fail with code: failCode
     */
    apiStationAlertAdd(
      userName: string,
      alertName: string,
      tag: ApiAlertCondition[],
      stationId: number,
      frequency?: number,
      statusCode?: number,
    ): Cypress.Chainable<AlertId>;

    /**
     * Read alerts for a device
     * Optionally expect to fail with statusCode!=200
     * expectedAlert can be null if non-200 statusCode is supplied
     */
    apiDeviceAlertCheck(
      userName: string,
      deviceName: string,
      expectedAlert: any,
      statusCode?: number,
    ): any;

    /**
     * Read alerts for a station
     * Optionally expect to fail with statusCode!=200
     * expectedAlert can be null if non-200 statusCode is supplied
     */
    apiStationAlertCheck(
      userName: string,
      stationId: StationId,
      expectedAlert: any,
      statusCode?: number,
    ): Cypress.Chainable<ApiAlertResponse>;
  }
}
