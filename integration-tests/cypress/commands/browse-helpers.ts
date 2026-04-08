export const apiRoot = `${Cypress.env("cacophony-api-server")}/api/v1`;
export const cyEl = (str: string) => {
  return cy.get(`[data-cy='${str}']`);
};
export const getEmailConfirmationToken = `${apiRoot}/users/get-email-confirmation-token`;
export const getEmail = (userName: string) =>
  `${userName.replace(/ /g, "-")}@api.created.com`.toLowerCase();
export const urlNormaliseProjectName = (name: string): string => {
  return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};

export const modalOkayButton = (modalId: string) => {
  return cy.get(`#${modalId} .modal-footer > .btn-primary`);
};

export const registerNewUser = (userName: string, password: string) => {
  cy.log(`Registering user: ${userName}`);
  cy.visit("/");
  cy.get("[href^='/register']").click();
  cyEl("username").type(userName);
  cyEl("email address").type(getEmail(userName));
  cyEl("password").type(password);
  cyEl("password confirmation").type(password);
  cyEl("accept eua").click();
  cyEl("register button").click();
};
export const signOut = () => {
  cyEl("sign out link").click({ force: true });
};

export const signInExistingUser = (userName: string, password: string) => {
  cy.url().should("contain", `sign-in`);
  cyEl("email address").type(getEmail(userName));
  cyEl("password").type(password);
  cyEl("sign in button").click();
};

export const createProjectFromInitialSetup = (project: string) => {
  cy.url().should("contain", "/setup");
  cyEl("create new project button").click();
  cy.log("Create project", project);
  cyEl("new project name").type(project, { force: true });
  cyEl("new project name").should("have.value", project);
  cyEl("create project button").click();
  // We should be taken to the project page (probably the dashboard page?)
  cy.url().should("contain", urlNormaliseProjectName(project));
};

export const createNewProject = (project: string) => {
  cyEl("switch or join project button").click();
  cyEl("create new project button").click();
  cy.log("Create project", project);
  cyEl("new project name").type(project, { force: true });
  cyEl("new project name").should("have.value", project);
  cyEl("create project button").click();
  // We should be taken to the project page (probably the dashboard page?)
  cy.url().should("contain", urlNormaliseProjectName(project));
};

export const confirmNewUserEmailAddress = (user: string) => {
  cy.log(`Confirming email address for ${user}`);
  cy.url().should("contain", "/setup");
  // User should be taken to account setup page, where they are prompted to confirm their email address.
  expect(cyEl("resend confirmation email")).to.exist;

  // Get the confirmation email link and visit it.
  cy.request("POST", getEmailConfirmationToken, { email: getEmail(user) }).then(
    (response) => {
      expect(response.body).to.exist;
      expect(response.body.token).to.exist;
      cy.visit(
        `/confirm-account-email/${response.body.token.replace(/\./g, ":")}`,
      );
      cy.url().should("contain", "/setup");
      cy.get("body").then((body) => {
        if (!body.find(`[data-cy='pending project memberships']`).length) {
          expect(cyEl("create new project button")).to.exist;
          expect(cyEl("join existing project button")).to.exist;
        }
      });
    },
  );
};
