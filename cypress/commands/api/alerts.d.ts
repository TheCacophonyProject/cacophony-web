interface ComparableAlert {
  hasStopped: boolean;
  hasAlerted: boolean;
}

declare namespace Cypress {
  interface Chainable {
     /**
     * Create an alert for a device. Optioanlly expect to fail with code: failCode
     */
    apiAddAlert(user: string, alertName: string, tag: string, device: string, automatic: boolean, frequency: number, failCode: number);

     /**
     * Read alerts for a device
     */
    apiCheckAlert(user: string, device: string,alertName: string);
     /**
     * create a template alert to compare with
     */
    createExpectedAlert(name: string, alertName, frequencySeconds: number, conditions: any, lastAlert: boolean, user: string, device: string)
  }
}
