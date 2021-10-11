// load the global Cypress types
/// <reference types="cypress" />

import { ApiAuthenticateAccess } from "@commands/types";
import { getTestName } from "../names";
import {
  apiPath,
  makeAuthorizedRequestWithStatus,
  saveCreds,
  getCreds,
  expectRequestHasFailed,
} from "../server";
Cypress.Commands.add(
  "apiSignInAs",
  (
    userName: string | null = null,
    email: string | null = null,
    nameOrEmail: string | null = null,
    password: string | null = null,
    statusCode: number = 200
  ) => {
    const theUrl = apiPath() + "/authenticate_user";
    const data = {};

    if (userName !== null) {
      data["username"] = getTestName(userName);
    }
    if (email !== null) {
      data["email"] = email;
      userName = email;
    }
    if (nameOrEmail !== null) {
      data["nameOrEmail"] = nameOrEmail;
      userName = nameOrEmail;
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
  }
);

Cypress.Commands.add(
  "apiAuthenticateAs",
  (userA: string, userB: string | null = null, statusCode: number = 200) => {
    const theUrl = apiPath() + "/admin_authenticate_as_other_user";
    const data = {};

    if (userB !== null) {
      data["deviceid"] = getCreds(userB).id;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: theUrl,
        body: data,
      },
      userA,
      statusCode
    ).then((response) => {
      if (statusCode == 200) {
        saveCreds(response, userB + "_on_behalf");
      }
    });
  }
);

Cypress.Commands.add(
  "apiAuthenticateDevice",
  (
    deviceName: string,
    groupName: string,
    password: string | null = null,
    statusCode: number = 200, 
    additionalChecks: any = {}
  ) => {
    const theUrl = apiPath() + "/authenticate_device";
    const fullDeviceName = getTestName(deviceName);
    const fullGroupName = getTestName(groupName);
    let data: any;

    if (password === null) {
      password = "p" + fullDeviceName;
    }

    if (additionalChecks["useDeviceId"]===true) {
      data = {
       deviceId: getCreds(deviceName).id,
       password: password,
      };
    } else {
      data = {
       devicename: fullDeviceName,
       groupname: fullGroupName,
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
  }
);

Cypress.Commands.add(
  "apiToken",
  (
    userName: string,
    ttl: string | null = null,
    access: ApiAuthenticateAccess | null = null,
    statusCode: number = 200
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
      statusCode
    ).then((response) => {
      //TODO: remove this once fixed - issue 45 workaround
      response.body.token = "JWT " + response.body.token;
      if (statusCode == 200) {
        saveCreds(response, userName + "_temp_token");
      }
    });
  }
);
