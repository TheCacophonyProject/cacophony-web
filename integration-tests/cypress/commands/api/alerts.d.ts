/// <reference types="../types" />

declare namespace Cypress {
  interface Chainable {
     /**
     * Create an alert for a device. Optioanlly expect to fail with code: failCode
     */
    apiAddAlert(user: string, alertName: string, tag: [ApiAlertConditions], device: string, frequency?: number, statusCode?: number);

     /**
     * Read alerts for a device
     * Optionally expect to fail with statusCode!=200
     * alertName can be null if non-200 statusCode is supplied
     */
    apiCheckAlert(user: string, device: string,alertName?: string, statusCode?: number);

     /**
     * create a template alert to compare with
     */
    createExpectedAlert(name: string, alertName, frequencySeconds: number, conditions: [ApiAlertConditionsi], lastAlert: boolean, user: string, device: string);
  }
}
