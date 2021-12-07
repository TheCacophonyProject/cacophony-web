// load the global Cypress types
/// <reference types="cypress" />

import { getTestName } from "../names";
import { apiPath, v1ApiPath, getCreds, saveCreds, expectRequestHasFailed, makeAuthorizedRequestWithStatus, sortArrayOn, checkTreeStructuresAreEqualExcept, removeUndefinedParams } from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { LATEST_END_USER_AGREEMENT } from "../constants";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";

Cypress.Commands.add(
  "apiUserAdd", 
  (
    userName: string, 
    password: string = "p" + getTestName(userName),
    email: string = "p" + getTestName(userName) + "@api.created.com",
    endUserAgreement: number = LATEST_END_USER_AGREEMENT,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
  logTestDescription(`Create user '${userName}'`, { user: userName }, true);

  const usersUrl = apiPath() + "/api/v1/users";
  var fullName: string;
  var email: string;

  if (additionalChecks["useRawUserName"]===true) {
    fullName = userName;
  } else {
    fullName = getTestName(userName);
  };
  const data = {
    userName: fullName,
    password: password,
    email: email,
    endUserAgreement: endUserAgreement,
    ...additionalChecks["additionalParams"]
  };

  if (statusCode && statusCode > 200) {
    cy.request({
      method: "POST",
      url: usersUrl,
      body: data,
      failOnStatusCode: false,
    }).then((response) => {
      //expect fail
      expectRequestHasFailed(response, statusCode);
      //check messages[] contain expected error`
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  } else {
    cy.request("POST", usersUrl, data).then((response) => {
      if (statusCode == 200) {
        const id = response.body.userData.id;
        saveCreds(response, userName, id);
      }
    });
  }
});

Cypress.Commands.add(
  "apiUserCheck",
  (
    userName: string,
    checkedUserNameOrId: string,
    expectedUser: ApiLoggedInUserResponse,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check user ${checkedUserNameOrId} `, {
    });

    const url = v1ApiPath(`users/${checkedUserNameOrId}`);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        checkTreeStructuresAreEqualExcept(
          expectedUser,
          response.body.userData,
          excludeCheckOn
        );
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks["message"]
          );
        }
      }
    });
  }
);


Cypress.Commands.add(
  "testCreateUserGroupAndDevice",
  (userName, group, camera) => {
    logTestDescription(
      `Create user '${userName}' with camera '${camera}' in group '${group}'`,
      { user: userName, group: group, camera: camera }
    );
    cy.apiUserAdd(userName, false);
    cy.apiGroupAdd(userName, group, false);
    cy.apiDeviceAdd(camera, group, null, null);
  }
);

Cypress.Commands.add("testCreateUserAndGroup", (userName, group) => {
  logTestDescription(`Create user '${userName}' with group '${group}'`, {
    user: userName,
    group: group,
  });
  cy.apiUserAdd(userName, false);
  cy.apiGroupAdd(userName, group, false);
});

Cypress.Commands.add(
  "testCreateGroupAndDevices",
  (userName, group, ...cameras) => {
    logTestDescription(
      `Create group '${group}' with cameras '${prettyLog(cameras)}'`,
      {
        user: userName,
        group,
        cameras,
      }
    );
    cy.apiGroupAdd(userName, group, false);
    cameras.forEach((camera) => {
      cy.apiDeviceAdd(camera, group);
    });
  }
);

export function TestCreateExpectedUser(userName: string, params: any):ApiLoggedInUserResponse {
  var user: ApiLoggedInUserResponse =
    {
      email: params["email"]||(("p" + getTestName(userName) + "@api.created.com").toLowerCase()),
      userName: getTestName(userName),
      globalPermission: params["globalPermission"]||"off",
      endUserAgreement: params["endUserAgreement"]||LATEST_END_USER_AGREEMENT,
      id: getCreds(userName).id,
      firstName: params["firstName"]||null,
      lastName: params["lastName"]||null
    };

  return(user);
};
