// load the global Cypress types
/// <reference types="cypress" />

import { getTestEmail, getTestName } from "../names";
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
import { GroupId, UserId } from "@typedefs/api/common";
import type { ApiUserSettings } from "@typedefs/api/user";


Cypress.Commands.add(
  "apiUserAdd",
  (
    userName: string,
    password: string = "p" + getTestName(userName),
    email: string = getTestEmail(userName),
    endUserAgreement: number = LATEST_END_USER_AGREEMENT,
    statusCode: number = 200,
    additionalChecks: any = {},
    inviteToken: string | undefined = undefined
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
    if (inviteToken) {
      (data as any).inviteTokenJWT = inviteToken.replace(/:/g, ".");
    }

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
          cy.wrap(id);
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
      additionalChecks["useRawUserName"] !== true &&
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
      fullUserName = getTestEmail(updateUserNameOrId);
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

    const url = v1ApiPath(`users/list-users`);

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
  "apiResetPassword",
  (userName: string, statusCode: number, additionalChecks: any = {}) => {
    const fullUrl = v1ApiPath("users/reset-password");
    let fullName: string;

    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestEmail(userName);
    }

    const data = {
      email: fullName,
    };

    cy.request({
      method: "POST",
      url: fullUrl,
      body: data,
      failOnStatusCode: true,
    });
  }
);

Cypress.Commands.add(
  "apiAddUserSettings",
  (settings: ApiUserSettings) => {
    const fullUrl = v1ApiPath("users/user-settings");
    cy.request({
      method: "PATCH",
      url: fullUrl,
      body: settings,
      failOnStatusCode: true,
    });
  }
);


Cypress.Commands.add(
  "apiResetPasswordLegacy",
  (userName: string, statusCode: number, additionalChecks: any = {}) => {
    const fullUrl = apiPath() + "/resetpassword";
    let fullName: string;

    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestEmail(userName);
    }

    const data = {
      email: fullName,
    };

    cy.request({
      method: "POST",
      url: fullUrl,
      body: data,
      failOnStatusCode: true,
    });
  }
);

Cypress.Commands.add(
  "apiAddUserSettings",
  (
    userName: string,
    settings: ApiUserSettings,
    statusCode: number = 200,
  ) => {

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath("users/user-settings"),
        body: settings,
      },
      userName,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiUserChangePassword",
  (token: string, password: string) => {
    const fullUrl = v1ApiPath(`users/change-password`);

    const body = {
      token: token.replace(/:/g, "."),
      password,
    };

    cy.request({
      method: "PATCH",
      url: fullUrl,
      body,
      failOnStatusCode: true,
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
  cy.apiUserAdd(userName).then((userId: UserId) => {
    cy.apiGroupAdd(userName, group, false).then((groupId: GroupId) => {
      cy.wrap({ userId, groupId });
    });
  });
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
    const deviceIds = [];
    cy.apiGroupAdd(userName, group, false).then((groupId) => {
      cameras.forEach((camera) => {
        cy.apiDeviceAdd(camera, group).then((deviceId) => {
          deviceIds.push(deviceId);
        });
      });
      cy.wrap({ groupId, deviceIds });
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
      (getTestName(userName) + "@api.created.com").toLowerCase(),
    emailConfirmed: false,
    userName: getTestName(userName),
    globalPermission: params["globalPermission"] || "off",
    endUserAgreement: params["endUserAgreement"] || LATEST_END_USER_AGREEMENT,
    id: getCreds(userName).id,
  };

  return user;
}
