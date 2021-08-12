// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

import { getTestName } from "../names";
import {
  apiPath,
  makeAuthorizedRequestWithStatus,
  saveCreds,
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
    let data = {};

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
    let data = {};

    if (userB !== null) {
      data["name"] = getTestName(userB);
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
    statusCode: number = 200
  ) => {
    const theUrl = apiPath() + "/authenticate_device";
    const fullDeviceName = getTestName(deviceName);
    const fullGroupName = getTestName(groupName);
    if (password === null) {
      password = "p" + fullDeviceName;
    }

    const data = {
      devicename: fullDeviceName,
      groupname: fullGroupName,
      password: password,
    };

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

    let data = {};

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
