// load the global Cypress types
/// <reference types="cypress" />

import { getTestName } from "../names";
import {
  apiPath,
  v1ApiPath,
  getCreds,
  renameCreds,
  saveCreds,
  expectRequestHasFailed,
  makeAuthorizedRequestWithStatus,
  sortArrayOn,
  checkTreeStructuresAreEqualExcept,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { LATEST_END_USER_AGREEMENT } from "../constants";
import { ApiLoggedInUserResponse, ApiUserResponse } from "@typedefs/api/user";

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
    let fullName: string;

    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestName(userName);
    }
    const data = {
      userName: fullName,
      password: password,
      email: email,
      endUserAgreement: endUserAgreement,
      ...additionalChecks["additionalParams"],
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
  }
);

Cypress.Commands.add(
  "apiUserUpdate",
  (
    userName: string,
    updates: any,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Update user ${userName} `, {});

    const url = v1ApiPath(`users`);

    const newUserName = updates["userName"];
    //make name unique if supplied, unless asked not to
    if (
      additionalChecks["useRawUserName"] != true &&
      newUserName !== undefined
    ) {
      updates["userName"] = getTestName(newUserName);
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: url,
        body: updates,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode == 200) {
        if (newUserName !== undefined) {
          renameCreds(userName, newUserName);
        }
      }
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiAdminUpdate",
  (
    userName: string,
    updateUserNameOrId: string,
    permission: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Update user ${updateUserNameOrId} access to ${permission}`,
      {}
    );

    let fullUserName: string;

    //make name unique if supplied, unless asked not to
    if (additionalChecks["useRawUserName"] == true) {
      fullUserName = updateUserNameOrId;
    } else {
      fullUserName = getTestName(updateUserNameOrId);
    }

    const url = v1ApiPath(`admin/global-permission/${fullUserName}`);
    const data = { permission: permission };

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: url,
        body: data,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

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
    logTestDescription(`Check user ${checkedUserNameOrId} `, {});

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

Cypress.Commands.add("apiEUACheck", (expectedVersion: number) => {
  const url = v1ApiPath(`endUserAgreement/latest`);

  cy.request({
    method: "GET",
    url: url,
    failOnStatusCode: false,
  }).then((response) => {
    expect(
      response.body.euaVersion,
      "End user agreement version should be"
    ).to.equal(expectedVersion);
    cy.wrap(response.body.euaVersion);
  });
});

Cypress.Commands.add(
  "apiUsersCheck",
  (
    userName: string,
    expectedUsers: ApiUserResponse[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check users`, {});

    const url = v1ApiPath(`listUsers/`);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        if (additionalChecks["contains"] === true) {
          expectedUsers.forEach((expectedUser) => {
            //check expectedUser is in returned usersList
            const index = response.body.usersList.findIndex(
              (user) => user.userName === expectedUser.userName
            );
            expect(
              index,
              `User ${expectedUser.userName} is in returned usersList`
            ).to.be.gt(0);

            //check expectedUser and usersList[x] entries match
            checkTreeStructuresAreEqualExcept(
              expectedUser,
              response.body.usersList[index],
              excludeCheckOn
            );
          });
        } else {
          //!contains so check for match
          let sortUsers: ApiUserResponse[];
          let sortExpectedUsers: ApiUserResponse[];

          if (additionalChecks["doNotSort"] === true) {
            sortUsers = response.body.usrsList;
            sortExpectedUsers = expectedUsers;
          } else {
            sortUsers = sortArrayOn(response.body.usersList, "userName");
            sortExpectedUsers = sortArrayOn(expectedUsers, "userName");
          }

          checkTreeStructuresAreEqualExcept(
            sortExpectedUsers,
            sortUsers,
            excludeCheckOn
          );
        }
      } else {
        //statusCode!=200
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
    cy.apiUserAdd(userName);
    cy.apiGroupAdd(userName, group, false);
    cy.apiDeviceAdd(camera, group, null, null);
  }
);

Cypress.Commands.add("testCreateUserAndGroup", (userName, group) => {
  logTestDescription(`Create user '${userName}' with group '${group}'`, {
    user: userName,
    group: group,
  });
  cy.apiUserAdd(userName);
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

export function TestCreateExpectedUser(
  userName: string,
  params: any
): ApiLoggedInUserResponse {
  const user: ApiLoggedInUserResponse = {
    email:
      params["email"] ||
      ("p" + getTestName(userName) + "@api.created.com").toLowerCase(),
    userName: getTestName(userName),
    globalPermission: params["globalPermission"] || "off",
    endUserAgreement: params["endUserAgreement"] || LATEST_END_USER_AGREEMENT,
    id: getCreds(userName).id,
    firstName: params["firstName"] || null,
    lastName: params["lastName"] || null,
  };

  return user;
}
