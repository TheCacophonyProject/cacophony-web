// load the global Cypress types
/// <reference types="cypress" />

import { getTestName } from "../names";
import {
  apiPath,
  getCreds,
  makeAuthorizedRequest,
  makeAuthorizedRequestWithStatus,
  saveCreds,
  saveIdOnly,
  v1ApiPath
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";

Cypress.Commands.add(
  "apiAddUserToGroup",
  (
    groupAdminUser: string,
    userName: string,
    group: string,
    admin = false,
    log = true,
    statusCode: number = 200
  ) => {
    const adminStr = admin ? " as admin " : "";
    logTestDescription(
      `${groupAdminUser} Adding user '${userName}' ${adminStr} to group '${group}' ${
        admin ? "as admin" : ""
      }`,
      { user: userName, group, isAdmin: admin },
      log
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("groups/users"),
        body: {
          group: getTestName(group),
          admin: admin.toString(),
          username: getTestName(userName)
        }
      },
      groupAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiRemoveUserFromGroup",
  (
    groupAdminUser: string,
    userName: string,
    group: string,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${groupAdminUser} Removing user '${userName}' from group '${group}' `,
      { user: userName, group },
      true
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: v1ApiPath("groups/users"),
        body: {
          group: getTestName(group),
          username: getTestName(userName)
        }
      },
      groupAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add("apiCheckUserCanSeeGroup", (username: string, groupname: string, testForSuccess: boolean = true) => {
  const user = getCreds(username);
  const fullGroupname = getTestName(groupname);
  const fullUrl = v1ApiPath('')+encodeURI('groups?where={}');

  logTestDescription(
      `${username} Check user '${username}' can see group '${groupname}' `,
      { user: username, groupname },
      true
  );

  cy.request({
    url: fullUrl,
    headers: user.headers
  }).then((request) => {
    const allGroupNames = Object.keys(request.body.groups).map(key => request.body.groups[key].groupname);
    if (testForSuccess==true) {
      expect(allGroupNames).to.contain(fullGroupname);
    } else {
      expect(allGroupNames).not.to.contain(fullGroupname);
    }
  });
});

Cypress.Commands.add(
  "apiCreateGroup",
  (userName: string, group: string, log = true) => {
    logTestDescription(
      `Create group '${group}' for user '${userName}'`,
      { user: userName, group: group },
      log
    );

    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath("groups"),
        body: { groupname: getTestName(group) }
      },
      userName
    ).then((response) => {
      saveIdOnly(group, response.body.groupId);
    });
  }
);


