declare namespace Cypress {
  interface Chainable {
    /**
     * Sign is as user using supplied username and session-unique suffix.
     * Optionally supply a password, otherwise password is calculated)
     * optionally use email (as supplied) - this is not made unique. caller needs to supply
     * optionally wait for non-200 statusCode
     */
    apiSignInAs(
      userName?: string,
      email?: string,
      password?: string,
      statuscode?: number,
    ): Chainable<Element>;

    /**
     * Obtain authentication as another user (userB) when signed in as a super-user (userA)
     * optionally wait for non-200 statusCode
     */
    apiAuthenticateAs(
      userA: string,
      userB?: string,
      statusCode?: number,
    ): Chainable<Element>;

    /**
     * Sign is as device/group.
     * Optionally supply a password (otherwise password is calculated)
     * Optionaly expect a non-200 statusCode
     * By default authenticates using devicename and groupname
     * Optionally authenticate with deviceid (additionalChecks["useDeviceId"]=true)
     */
    apiAuthenticateDevice(
      deviceName: string,
      groupName: string,
      password?: string,
      statusCode?: number,
      additionalChecks?: any,
    ): Chainable<Element>;

    /**
     * Obtain a temporary token for user
     * Optionally supply ttl and access conditions
     * Optionaly expect a non-200 statusCode
     */
    apiToken(
      userName: string,
      ttl?: string,
      access?: ApiAuthenticateAccess,
      statusCode?: number,
    ): any;
  }
}
