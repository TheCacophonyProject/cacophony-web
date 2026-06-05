import { getTestEmail, getTestName } from "../names";
import {
  apiPath,
  checkTreeStructuresAreEqualExcept,
  expectRequestHasFailed,
  getCreds,
  makeAuthorizedRequestWithStatus,
  renameCreds,
  saveCreds,
  sortArrayOn,
  v1ApiPath,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { LATEST_END_USER_AGREEMENT } from "../constants";
import {
  ApiLoggedInUserResponse,
  ApiUserResponse,
  ApiUserUpdateRequest,
} from "@typedefs/api/user";
import { GroupId, UserId } from "@typedefs/api/common";
import { HttpStatusCode, UserGlobalPermission } from "@shared/api/consts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Create user and save api credentials further use
       * By default makes the userName unique.
       * Optionally: Use the raw provided username additionalChecks["useRawUserName"]==true
       * By default unique password, email are generated.  Optionally supply these parameters
       * By default set endUserAgreement to latest value. Optionally supply this parameter
       * Optionally, check for non-200 return statusCode
       * Optionally, check that returned error messages[] contains additionalChecks["message"]
       */
      apiUserAdd(
        userName: string,
        password?: string,
        email?: string,
        endUserAgreement?: number,
        statusCode?: number,
        additionalChecks?: {
          useRawUserName?: boolean;
          additionalParams?: object;
          message?: string;
          errors?: { location: string; path: string }[];
        },
        inviteToken?: string,
      ): Cypress.Chainable<UserId>;

      /**
       * Update user with parameters supplied in updates. Valid updates parameters are:
       * { userName: "..", password: "..", email: "..." }
       * Optionally, check for non-200 return statusCode
       * Optionally, check that returned error messages[] contains additionalChecks["message"]
       * By default makes the userNameOrId unique.
       * Optionally: Use the raw provided userNameOrId additionalChecks["useRawUserName"]==true
       */
      apiAdminUpdate(
        userName: string,
        updateUserNameOrId: string,
        permission: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawUserName?: boolean;
          message?: string;
          errors?: { path: string; location: string }[];
        },
      ): Cypress.Chainable<void>;

      /**
       * Update user's super-user (global) permissions
       * Optionally, check for non-200 return statusCode
       * Optionally, check that returned error messages[] contains additionalChecks["message"]
       */
      apiUserUpdate(
        userName: string,
        updates: ApiUserUpdateRequest,
        statusCode?: number,
        additionalChecks?: { useRawUserName?: boolean; message?: string },
      ): Cypress.Chainable<void>;

      /**
       * Query an individual user's details by name or id and check returned values
       * Note: userName is the user doing the query
       *       checkedUserNameOrId is the user being queried
       * Optionally: exclude checks on specific parameters detailed in excludeCheckOn
       * Optionally, check for non-200 return statusCode
       * Optionally, check that returned error messages[] contains additionalChecks["message"]
       */
      apiUserCheck(
        userName: string,
        checkedUserNameOrId: string,
        expectedUser: ApiLoggedInUserResponse,
        excludeCheckOn?: string[],
        statusCode?: number,
        additionalChecks?: { message?: string },
      ): Cypress.Chainable<void>;

      /**
       * Query an all users' details and check returned values
       * Optionally: exclude checks on specific parameters detailed in excludeCheckOn
       * Optionally, check for non-200 return statusCode
       * Optionally, check that returned error messages[] contains additionalChecks["message"]
       * By default returned usersList and expectedUsers are sorted by username before comparison
       * Optionally do not sort by specifying additionalChecks["doNotSort"]=true
       * By default checks that the returned usersList MATCHES the expectedUsers
       * Optionally, check that usersLists CONTAINS expectedUsers (additionalChecks["contains"]=true)
       */
      apiUsersCheck(
        userName: string,
        expectedUsers: ApiUserResponse[],
        excludeCheckOn?: string[],
        statusCode?: number,
        additionalChecks?: {
          contains?: boolean;
          doNotSort?: boolean;
          message?: string;
        },
      ): Cypress.Chainable<void>;

      /**
       * Query latest end user agreement version
       */
      apiEUACheck(expectedVersion: number): Cypress.Chainable<number>;

      /**
       * Request password reset on user by name
       * Optionally, check for non-200 return statusCode
       * By default makes the userName unique.
       * Optionally: Use the raw provided username additionalChecks["useRawUserName"]==true
       */
      apiResetPassword(
        userName: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawUserName?: boolean },
      ): Chainable<void>;

      /**
       * Request password reset on user by name
       * Optionally, check for non-200 return statusCode
       * By default makes the userName unique.
       * Optionally: Use the raw provided username additionalChecks["useRawUserName"]==true
       */
      apiResetPasswordLegacy(
        userName: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawUserName?: boolean },
      ): Chainable<void>;

      /**
       * Change password using reset token
       * Optionally, check for non-200 return statusCode
       */
      apiUserChangePassword(token: string, password: string): Chainable<void>;

      /**
       * Confirm the email address of the user on sign-up and
       * when the user changes their email address
       */
      apiConfirmEmailAddress(token: string): Chainable<void>;

      /**
       * create user group and camera at the same time
       */
      testCreateUserGroupAndDevice(
        userName: string,
        group: string,
        camera: string,
        atTime?: Date,
      ): Chainable<void>;

      /**
       * create user group and camera at the same time
       */
      testCreateUserAndGroup(
        userName: string,
        group: string,
      ): Cypress.Chainable<{ userId: UserId; groupId: GroupId }>;

      /**
       * create user group and camera at the same time
       */
      testCreateGroupAndDevices(
        userName: string,
        group: string,
        ...cameras: string[]
      ): Cypress.Chainable<{ groupId: GroupId; deviceIds: DeviceId[] }>;
    }
  }
}

Cypress.Commands.add(
  "apiUserAdd",
  (
    userName: string,
    password: string = "p" + getTestName(userName),
    email: string = getTestEmail(userName),
    endUserAgreement: number = LATEST_END_USER_AGREEMENT,
    statusCode = 200,
    additionalChecks: {
      useRawUserName?: boolean;
      additionalParams?: object;
      message?: string;
      errors?: { path: string; location: string }[];
    } = {},
    inviteToken: string | undefined = undefined,
  ) => {
    logTestDescription(`Create user '${userName}'`, { user: userName }, true);

    const usersUrl = apiPath() + "/api/v1/users";
    let fullName: string;

    if (additionalChecks.useRawUserName === true) {
      fullName = userName;
    } else {
      fullName = getTestName(userName);
    }
    const data = {
      userName: fullName,
      password: password,
      email: email,
      endUserAgreement: endUserAgreement,
      ...(additionalChecks.additionalParams || {}),
    };
    if (inviteToken) {
      data["inviteTokenJWT"] = inviteToken.replace(/:/g, ".");
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
        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
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
  },
);

Cypress.Commands.add(
  "apiUserUpdate",
  (
    userName: string,
    updates: { userName?: string; email?: string },
    statusCode = 200,
    additionalChecks: { useRawUserName?: boolean; message?: string } = {},
  ) => {
    logTestDescription(`Update user ${userName} `, {});

    const url = v1ApiPath(`users`);

    const newUserName = updates.userName;
    //make name unique if supplied, unless asked not to
    if (additionalChecks.useRawUserName !== true && newUserName !== undefined) {
      updates.userName = getTestName(newUserName);
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: url,
        body: updates,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (statusCode == 200) {
        if (newUserName !== undefined) {
          renameCreds(userName, newUserName);
        }
      }
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks.message,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiAdminUpdate",
  (
    userName: string,
    updateUserNameOrId: string,
    permission: string,
    statusCode = 200,
    additionalChecks: { useRawUserName?: boolean; message?: string } = {},
  ) => {
    logTestDescription(
      `Update user ${updateUserNameOrId} access to ${permission}`,
      {},
    );

    let fullUserName: string;

    //make name unique if supplied, unless asked not to
    if (additionalChecks.useRawUserName === true) {
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
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks.message,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiUserCheck",
  (
    userName: string,
    checkedUserNameOrId: string,
    expectedUser: ApiLoggedInUserResponse,
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { message?: string } = {},
  ) => {
    logTestDescription(`Check user ${checkedUserNameOrId} `, {});

    const url = v1ApiPath(`users/${checkedUserNameOrId}`);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          userData: ApiLoggedInUserResponse;
          messages: string[];
        }>,
      ) => {
        if (statusCode === 200) {
          checkTreeStructuresAreEqualExcept(
            expectedUser,
            response.body.userData,
            excludeCheckOn,
          );
        } else {
          if (additionalChecks.message !== undefined) {
            expect(response.body.messages.join("|")).to.include(
              additionalChecks.message,
            );
          }
        }
      },
    );
  },
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
      "End user agreement version should be",
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
    statusCode = 200,
    additionalChecks: {
      contains?: boolean;
      doNotSort?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(`Check users`, {});

    const url = v1ApiPath(`users/list-users`);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          usersList: ApiLoggedInUserResponse[];
          messages: string[];
        }>,
      ) => {
        if (statusCode === 200) {
          if (additionalChecks.contains === true) {
            expectedUsers.forEach((expectedUser) => {
              //check expectedUser is in returned usersList
              const index = response.body.usersList.findIndex(
                (user) => user.userName === expectedUser.userName,
              );
              expect(
                index,
                `User ${expectedUser.userName} is in returned usersList`,
              ).to.be.gt(0);

              //check expectedUser and usersList[x] entries match
              checkTreeStructuresAreEqualExcept(
                expectedUser,
                response.body.usersList[index],
                excludeCheckOn,
              );
            });
          } else {
            //!contains so check for match
            let sortUsers: ApiUserResponse[];
            let sortExpectedUsers: ApiUserResponse[];

            if (additionalChecks.doNotSort === true) {
              sortUsers = response.body.usersList;
              sortExpectedUsers = expectedUsers;
            } else {
              sortUsers = sortArrayOn(response.body.usersList, "userName");
              sortExpectedUsers = sortArrayOn(expectedUsers, "userName");
            }

            checkTreeStructuresAreEqualExcept(
              sortExpectedUsers,
              sortUsers,
              excludeCheckOn,
            );
          }
        } else {
          //statusCode!=200
          if (additionalChecks.message !== undefined) {
            expect(response.body.messages.join("|")).to.include(
              additionalChecks.message,
            );
          }
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiResetPassword",
  (
    userName: string,
    _statusCode: HttpStatusCode,
    additionalChecks: { useRawUserName?: boolean } = {},
  ) => {
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
  },
);

Cypress.Commands.add(
  "apiResetPasswordLegacy",
  (
    userName: string,
    _statusCode: HttpStatusCode,
    additionalChecks: { useRawUserName?: boolean } = {},
  ) => {
    const fullUrl = apiPath() + "/resetpassword";
    let fullName: string;

    if (additionalChecks.useRawUserName === true) {
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
  },
);

Cypress.Commands.add("apiConfirmEmailAddress", (token: string) => {
  const fullUrl = v1ApiPath("users/validate-email-confirmation-request");
  const data = {
    emailConfirmationJWT: token.replace(/:/g, "."),
  };

  cy.request({
    method: "POST",
    url: fullUrl,
    body: data,
    failOnStatusCode: true,
  });
});

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
  },
);

Cypress.Commands.add(
  "testCreateUserGroupAndDevice",
  (userName, group, camera, atTime) => {
    logTestDescription(
      `Create user '${userName}' with camera '${camera}' in group '${group}'`,
      { user: userName, group: group, camera: camera },
    );
    cy.apiUserAdd(userName);
    cy.apiGroupAdd(userName, group, false);
    cy.apiDeviceAdd(camera, group, atTime, null, null);
  },
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
      },
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
  },
);

export function TestCreateExpectedUser(
  userName: string,
  params: {
    globalPermission?: UserGlobalPermission;
    endUserAgreement?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
  } = {},
): ApiLoggedInUserResponse {
  return {
    email:
      params["email"] ||
      (getTestName(userName) + "@api.created.com").toLowerCase(),
    emailConfirmed: false,
    userName: getTestName(userName),
    globalPermission: params["globalPermission"] || UserGlobalPermission.Off,
    endUserAgreement: params["endUserAgreement"] || LATEST_END_USER_AGREEMENT,
    id: getCreds(userName).id,
  };
}
