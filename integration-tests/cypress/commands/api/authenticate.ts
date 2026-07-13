import { ApiAuthenticateAccess } from "@commands/types";
import { getTestEmail, getTestName } from "../names";
import {
  apiPath,
  makeAuthorizedRequestWithStatus,
  saveCreds,
  getCreds,
  expectRequestHasFailed,
} from "../server";

import { ApiLoggedInUserResponse } from "@shared/api/user";
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
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
       * Optionally expect a non-200 statusCode
       * By default authenticates using devicename and groupname
       * Optionally authenticate with deviceId (additionalChecks["useDeviceId"]=true)
       */
      apiAuthenticateDevice(
        deviceName: string,
        groupName: string,
        password?: string,
        statusCode?: number,
        additionalChecks?: { useDeviceId?: boolean },
      ): Chainable<void>;

      /**
       * Obtain a temporary token for user
       * Optionally supply ttl and access conditions
       * Optionally expect a non-200 statusCode
       */
      apiToken(
        userName: string,
        ttl?: string,
        access?: ApiAuthenticateAccess,
        statusCode?: number,
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "apiSignInAs",
  (
    userName: string | null = null,
    email: string | null = null,
    password: string | null = null,
    statusCode = 200,
  ) => {
    const theUrl = apiPath() + "/authenticate_user";
    const data = {};

    if (userName !== null) {
      data["email"] = getTestEmail(userName);
    }
    if (email !== null) {
      data["email"] = email;
      userName = email;
    }
    //calculate password if not specified
    if (password === null) {
      password = "p" + getTestName(userName);
    }
    data["password"] = password;

    if (statusCode && statusCode > 200) {
      cy.request({
        method: "POST",
        url: theUrl,
        body: data,
        failOnStatusCode: false,
      }).then((response) => {
        expectRequestHasFailed(response, statusCode);
      });
    } else {
      cy.request("POST", theUrl, data).then((response) => {
        if (statusCode == 200) {
          saveCreds(response, userName, response.body.id);
        }
      });
    }
  },
);

Cypress.Commands.add(
  "apiAuthenticateAs",
  (userA: string, userB: string | null = null, statusCode = 200) => {
    const theUrl = apiPath() + "/admin_authenticate_as_other_user";
    const data = {};

    if (userB !== null) {
      data["email"] = getTestEmail(userB);
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: theUrl,
        body: data,
      },
      userA,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          token: string;
          userData?: ApiLoggedInUserResponse;
        }>,
      ) => {
        if (statusCode == 200) {
          saveCreds(response, userB + "_on_behalf");
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiAuthenticateDevice",
  (
    deviceName: string,
    groupName: string,
    password: string | null = null,
    statusCode = 200,
    additionalChecks: { useDeviceId?: boolean } = {},
  ) => {
    const theUrl = apiPath() + "/authenticate_device";
    const fullDeviceName = getTestName(deviceName);
    const fullGroupName = getTestName(groupName);
    let data: object;

    if (password === null) {
      password = "p" + fullDeviceName;
    }

    if (additionalChecks.useDeviceId === true) {
      data = {
        deviceId: getCreds(deviceName).id,
        password: password,
      };
    } else {
      data = {
        deviceName: fullDeviceName,
        groupName: fullGroupName,
        password: password,
      };
    }

    if (statusCode && statusCode > 200) {
      cy.request({
        method: "POST",
        url: theUrl,
        body: data,
        failOnStatusCode: false,
      }).then((response) => {
        expectRequestHasFailed(response, statusCode);
      });
    } else {
      cy.request("POST", theUrl, data).then((response) => {
        saveCreds(response, deviceName, response.body.id);
      });
    }
  },
);

Cypress.Commands.add(
  "apiToken",
  (
    userName: string,
    ttl: string | null = null,
    access: ApiAuthenticateAccess | null = null,
    statusCode = 200,
  ) => {
    const theUrl = apiPath() + "/token";

    const data = {};

    if (ttl !== null) {
      data["ttl"] = ttl;
    }
    if (access !== null) {
      data["access"] = access;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: theUrl,
        body: data,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ token: string }>) => {
      response.body.token = "JWT " + response.body.token;
      if (statusCode == 200) {
        saveCreds(response, userName + "_temp_token");
      }
    });
  },
);
