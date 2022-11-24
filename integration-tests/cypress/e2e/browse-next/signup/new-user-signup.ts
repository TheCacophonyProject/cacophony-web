import { uniqueName } from "@commands/testUtils";
import { startMailServerStub } from "@commands/emailUtils";
const apiRoot = `${Cypress.env("cacophony-api-server")}/api/v1`;
const cyEl = (str: string) => {
  return cy.get(`[data-cy='${str}']`);
};
const getEmailConfirmationToken = `${apiRoot}/users/get-email-confirmation-token`;
const getEmail = (userName: string) => `${userName}@api.created.com`;
export const urlNormaliseGroupName = (name: string): string => {
  return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};

const registerNewUser = (userName: string, password: string) => {
  cy.visit("/");
  cy.get("[href='/register']").click();
  cyEl("username").type(userName);
  cyEl("email address").type(getEmail(userName));
  cyEl("password").type(password);
  cyEl("password confirmation").type(password);
  cyEl("accept eua").click();
  cyEl("register button").click();
};
const signOut = () => {
  cyEl("sign out link").click();
};

const signInExistingUser = (userName: string, password: string) => {
  cy.url().should("contain", `sign-in`);
  cyEl("email address").type(getEmail(userName));
  cyEl("password").type(password);
  cyEl("sign in button").click();
};

const createGroupFromInitialSetup = (group: string) => {
  cy.url().should("contain", "/setup");
  cyEl("create new group button").click();
  cyEl("new group name").type(group);
  cyEl("create group button").click();

  // We should be taken to the group page (probably the dashboard page?)
  cy.url().should("contain", urlNormaliseGroupName(group));
};

const confirmNewUserEmailAddress = (user: string) => {
  cy.url().should("contain", "/setup");
  // User should be taken to account setup page, where they are prompted to confirm their email address.
  expect(cyEl("resend confirmation email")).to.exist;

  // Get the confirmation email link and visit it.
  cy.request("POST", getEmailConfirmationToken, { email: getEmail(user) }).then(
    (response) => {
      expect(response.body).to.exist;
      expect(response.body.token).to.exist;
      cy.visit(
        `/confirm-account-email/${response.body.token.replace(/\./g, ":")}`
      );
      cy.url().should("contain", "/setup");
      expect(cyEl("create new group button")).to.exist;
      expect(cyEl("join existing group button")).to.exist;
    }
  );
};

describe("New users can sign up and confirm their email address", () => {
  before(() => {
    startMailServerStub();
  });

  it("New user signup works, and email confirmation works while user is logged in", () => {
    const user = uniqueName("Bob");
    const password = uniqueName("pass");
    registerNewUser(user, password);
    confirmNewUserEmailAddress(user);
  });

  it("New user signup works, and email confirmation works if the user is not signed in, after signing in.", () => {
    const user = uniqueName("Bob");
    const password = uniqueName("pass");

    registerNewUser(user, password);
    signOut();

    cy.request("POST", getEmailConfirmationToken, {
      email: getEmail(user),
    }).then((response) => {
      expect(response.body).to.exist;
      expect(response.body.token).to.exist;
      const urlFriendlyToken = response.body.token.replace(/\./g, ":");
      // User clicks the link from their email, and if they're not signed in they'll be redirected to the sign-in page.
      cy.visit(`/confirm-account-email/${urlFriendlyToken}`);
      // We should be taken to the sign-in page.
      cy.url().should(
        "contain",
        `sign-in?nextUrl=/confirm-account-email/${urlFriendlyToken}`
      );

      signInExistingUser(user, password);

      cy.url().should("contain", "/setup");
      expect(cyEl("create new group button")).to.exist;
      expect(cyEl("join existing group button")).to.exist;
    });
  });

  it("Existing new user signs in and is taken to their setup page", () => {
    const user = uniqueName("Bob");
    const password = uniqueName("pass");
    registerNewUser(user, password);
    confirmNewUserEmailAddress(user);
    signOut();
    signInExistingUser(user, password);
    cy.url().should("contain", "/setup");
    expect(cyEl("create new group button")).to.exist;
    expect(cyEl("join existing group button")).to.exist;
  });

  it("Existing new user is able to create a new group from setup view", () => {
    const user = uniqueName("Bob");
    const password = uniqueName("pass");
    const group = uniqueName("group");
    registerNewUser(user, password);
    confirmNewUserEmailAddress(user);
    createGroupFromInitialSetup(group);

    // TODO: Assert that we're taken to the dashboard or somewhere else to complete setup.

    signOut();
  });

  it("Existing new user is able to request to join an existing group from setup view", () => {
    // User 1 creates a group
    const user1 = uniqueName("Bob");
    const password = uniqueName("pass");
    const group = uniqueName("group");
    registerNewUser(user1, password);
    confirmNewUserEmailAddress(user1);
    createGroupFromInitialSetup(group);
    signOut();

    // User 2 requests permission to join the group
    const user2 = uniqueName("Bob");
    registerNewUser(user2, password);
    confirmNewUserEmailAddress(user2);
    cy.url().should("contain", "/setup");
    cyEl("join existing group button").click();
    cyEl("group admin email address").type(getEmail(user1));

    cyEl("list joinable groups button").click();
    // Since there is only one group, it won't show a list of options to choose from.
    cy.get("#join-group-modal .modal-footer > .btn-primary").click();

    // At this point, nothing happens, we stay on the setup screen.  Would be good to show some status update.
  });

  it("Existing user (with groups) is able to request to join an existing group from main view", () => {});

  it("Existing user (with groups) is able to invite an existing user to their group", () => {});

  it("Logged in user with a group invite link is able to accept the invitation", () => {});

  it("Logged out user with a group invite link is able to accept the invitation after login", () => {});
});
