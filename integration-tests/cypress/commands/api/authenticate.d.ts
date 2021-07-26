declare namespace Cypress {
  interface Chainable {
     /**
     * Sign is as user using supplied username and session-unique suffixi. 
     * Optionally supply a password, otherwise password is calculated)
     * optionally use email / nameOrEmail (as supplied) - these are not made unique. caller needs to supply
     * optionally wait for non-200 statusCode
     */
    apiSignInAs(userName: string, email: string, nameOrEmail: string, password: string, statuscode: number): Chainable<Element>;

     /**
     * Objain authentication as another user (userB) when signed in as a super-user (userA)
     * optionally wait for non-200 statusCode
     */
    apiAuthenticateAs(userA: string, userB: string, statusCode: number): Chainable<Element>;
 
     /**
     * Sign is as device/group.  
     * Optionally supply a password (otherwise password is calculated)
     * Optionaly expect a non-200 ststusCode
     */
    apiAuthenticateDevice(deviceName: string, groupName: string, password: string, statusCode: number): Chainable<Element>;
  }
}
