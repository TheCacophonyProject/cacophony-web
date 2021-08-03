// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

import { getTestName } from "../names";
import {
  apiPath,
  saveCreds,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";

Cypress.Commands.add("apiCreateUser", (userName: string, log = true) => {
  logTestDescription(`Create user '${userName}'`, { user: userName }, log);

  const usersUrl = apiPath() + "/api/v1/users";

  const fullName = getTestName(userName);
  const password = "p" + fullName;

  const data = {
    username: fullName,
    password: password,
    email: fullName + "@api.created.com", 
    endUserAgreement: 3
  };

  cy.request("POST", usersUrl, data).then((response) => {
    const id=response.body.userData.id;
    saveCreds(response, userName,id);
  });
});

Cypress.Commands.add(
  "apiCreateUserGroupAndDevice",
  (userName, group, camera) => {
    logTestDescription(
      `Create user '${userName}' with camera '${camera}' in group '${group}'`,
      { user: userName, group: group, camera: camera }
    );
    cy.apiCreateUser(userName, false);
    cy.apiCreateGroup(userName, group, false);
    cy.apiCreateDevice(camera, group,  null, null);
  }
);

Cypress.Commands.add("apiCreateUserGroup", (userName, group) => {
  logTestDescription(`Create user '${userName}' with group '${group}'`, {
    user: userName,
    group: group
  });
  cy.apiCreateUser(userName, false);
  cy.apiCreateGroup(userName, group, false);
});

Cypress.Commands.add("apiCreateGroupAndDevices", (userName, group, ...cameras) => {
  logTestDescription(`Create group '${group}' with cameras '${prettyLog(cameras)}'`, {
    user: userName,
    group, 
    cameras
  });
  cy.apiCreateGroup(userName, group, false);
  cameras.forEach(camera => {
    cy.apiCreateDevice(camera, group);
  });
});


