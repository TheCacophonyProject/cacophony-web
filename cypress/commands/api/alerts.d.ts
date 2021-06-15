interface ComparableAlert {
  hasStopped: boolean;
  hasAlerted: boolean;
}

declare namespace Cypress {
  interface Chainable {
     /**
     * Create an alert for a device. Optioanlly expect to fail with code: failCode
     */
    apiAddAlert(user: string, alertName: string, tag: string, device: string, automatic: boolean, frequency: number, failCode: number): Chainable<Element>;

     /**
     * Read alewrts for a device
     */
    apiCheckAlert(user: string, device: string,alertName: string): Chainable<Element>;
     /**
     * create a template alert to compare with
     */
    createExpectedAlert(name: string, expectedAlert: ComparableAlert): Chainable<Element>;
  }
}
