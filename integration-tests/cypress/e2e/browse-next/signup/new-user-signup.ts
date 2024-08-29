import { uniqueName } from "@commands/testUtils";
import {
  ACCEPT_INVITE_PREFIX,
  JOIN_GROUP_REQUEST_PREFIX,
  extractTokenStartingWith,
  startMailServerStub,
  waitForEmail,
  RESET_PASSWORD_PREFIX,
} from "@commands/emailUtils";
const apiRoot = `${Cypress.env("cacophony-api-server")}/api/v1`;
const cyEl = (str: string) => {
  return cy.get(`[data-cy='${str}']`);
};
const getEmailConfirmationToken = `${apiRoot}/users/get-email-confirmation-token`;
const getEmail = (userName: string) =>
  `${userName.replace(/ /g, "-")}@api.created.com`.toLowerCase();
export const urlNormaliseProjectName = (name: string): string => {
  return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};

const modalOkayButton = (modalId: string) => {
  return cy.get(`#${modalId} .modal-footer > .btn-primary`);
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

const createProjectFromInitialSetup = (project: string) => {
  cy.url().should("contain", "/setup");
  cyEl("create new project button").click();
  cy.log("Create project", project);
  cyEl("new project name").type(project, { force: true });
  cyEl("new project name").should("have.value", project);
  cyEl("create project button").click();
  // We should be taken to the project page (probably the dashboard page?)
  cy.url().should("contain", urlNormaliseProjectName(project));
};

const createNewProject = (project: string) => {
  cyEl("switch or join project button").click();
  cyEl("create new project button").click();
  cy.log("Create project", project);
  cyEl("new project name").type(project, { force: true });
  cyEl("new project name").should("have.value", project);
  cyEl("create project button").click();
  // We should be taken to the project page (probably the dashboard page?)
  cy.url().should("contain", urlNormaliseProjectName(project));
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
      expect(cyEl("create new project button")).to.exist;
      expect(cyEl("join existing project button")).to.exist;
    }
  );
};

describe("New users can sign up and confirm their email address", () => {
  before(() => {
    startMailServerStub();
  });

  it.only("Existing user (with projects) is able to request to join an existing project from main view", () => {
    cy.log("User 1 creates a project");
    const user1 = uniqueName("Bob");
    const password = uniqueName("pass");
    const project1 = uniqueName("bobs project");
    registerNewUser(user1, password);
    confirmNewUserEmailAddress(user1);
    createProjectFromInitialSetup(project1);
    signOut();

    cy.log("User 2 creates a project");
    const user2 = uniqueName("Alice");
    const project2 = uniqueName("alices project");
    registerNewUser(user2, password);
    confirmNewUserEmailAddress(user2);
    createProjectFromInitialSetup(project2);
    cyEl("switch or join project button").click();
    cyEl("join existing project button").click();
    cyEl("project admin email address").type(getEmail(user1), { force: true });
    cyEl("list joinable projects button").click();

    // Since there is only one project, it won't show a list of options to choose from.
    modalOkayButton("join-project-modal").click();

    signOut();

    waitForEmail("join request").then((email) => {
      const { token } = extractTokenStartingWith(
        email,
        JOIN_GROUP_REQUEST_PREFIX
      );

      cy.log("Bob signs in and accepts the email link");
      signInExistingUser(user1, password);
      cy.url().should("contain", urlNormaliseProjectName(project1));
      cy.visit(`/confirm-project-membership-request/${token}`);
      cy.url().should("contain", urlNormaliseProjectName(project1));
      signOut();
      // Now if alice signs in, she should see the project in her projects list.
      signInExistingUser(user2, password);
      cyEl("switch project button").should("exist");
    });
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
      expect(cyEl("create new project button")).to.exist;
      expect(cyEl("join existing project button")).to.exist;
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
    expect(cyEl("create new project button")).to.exist;
    expect(cyEl("join existing project button")).to.exist;
  });

  it("Existing new user is able to create a new project from setup view", () => {
    const user = uniqueName("Bob");
    const password = uniqueName("pass");
    const project = uniqueName("project");
    registerNewUser(user, password);
    confirmNewUserEmailAddress(user);
    createProjectFromInitialSetup(project);

    // TODO: Assert that we're taken to the dashboard or somewhere else to complete setup.

    signOut();
  });

  it("Existing new user is able to request to join an existing project from setup view", () => {
    cy.log("User 1 creates a project");
    const user1 = uniqueName("Bob");
    const password = uniqueName("pass");
    const project = uniqueName("project");
    registerNewUser(user1, password);
    confirmNewUserEmailAddress(user1);
    createProjectFromInitialSetup(project);
    signOut();

    cy.log("User 2 requests permission to join the project");
    const user2 = uniqueName("Bob");
    registerNewUser(user2, password);
    confirmNewUserEmailAddress(user2);
    cy.url().should("contain", "/setup");
    cyEl("join existing project button").click();
    cyEl("project admin email address").type(getEmail(user1), { force: true });

    cyEl("list joinable projects button").click();
    // Since there is only one project, it won't show a list of options to choose from.
    modalOkayButton("join-project-modal").click();

    cy.log(
      "User should we should see our requested project listed with a pending status"
    );
    expect(cyEl("pending project memberships")).to.exist;
    expect(cyEl("pending project memberships").contains(project)).to.exist;
    expect(
      cyEl("pending project memberships").contains(
        "Waiting for approval from project admin"
      )
    ).to.exist;
  });

  it("New user with a pending invitation is able to see and accept that invitation from their setup screen", () => {
    cy.log("User 1 creates a project");
    const user1 = uniqueName("Bob");
    const password = uniqueName("pass");
    const project = uniqueName("project");
    registerNewUser(user1, password);
    confirmNewUserEmailAddress(user1);
    createProjectFromInitialSetup(project);
    cy.log("They invite a non-member to join their project via email address.");

    const user2 = uniqueName("Bob");

    cy.visit(`/${urlNormaliseProjectName(project)}/settings/users`);
    cyEl("invite someone to project button").click();
    cyEl("invitee email address").type(getEmail(user2), { force: true });
    modalOkayButton("invite-someone-modal").click();
    signOut();

    cy.log("User 2 signs up with their email address.");
    registerNewUser(user2, password);
    confirmNewUserEmailAddress(user2);
    cy.url().should("contain", "/setup");
    cy.log("Should see our invited project listed with a pending status");
    expect(cyEl("pending project memberships")).to.exist;
    expect(cyEl("pending project memberships").contains(project)).to.exist;
    cyEl("accept project invitation button").click();
    cy.log("User is redirected to dashboard for joined project");
    cy.url().should("contain", `/${urlNormaliseProjectName(project)}`);
    signOut();
  });

  it("Existing user (with projects) is able to invite an existing user to their project", () => {
    const password = uniqueName("pass");

    cy.log("User 1 creates a project");
    const user1 = uniqueName("Bob");
    const project1 = uniqueName("project");
    registerNewUser(user1, password);
    confirmNewUserEmailAddress(user1);
    createProjectFromInitialSetup(project1);
    signOut();

    cy.log("User 2 creates a project");
    const user2 = uniqueName("Alice");
    const project2 = uniqueName("Alice project");
    registerNewUser(user2, password);
    confirmNewUserEmailAddress(user2);
    createProjectFromInitialSetup(project2);

    cy.log("Alice invites Bob to her project Alice-project");
    cy.visit(`/${urlNormaliseProjectName(project2)}/settings/users`);
    cyEl("invite someone to project button").click();
    cyEl("invitee email address").type(getEmail(user1), { force: true });
    modalOkayButton("invite-someone-modal").click();
    signOut();

    waitForEmail("invite").then((email) => {
      const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
      cy.log("Bob signs in and accepts the email link");
      signInExistingUser(user1, password);
      cy.url().should("contain", urlNormaliseProjectName(project1));
      cy.visit(`/accept-invite/${token}`);
      cy.url().should("contain", urlNormaliseProjectName(project2));
    });
  });

  it("Logged in user with a project invite link is able to accept the invitation", () => {
    cy.log("User 1 registers and creates a project");
    const user1 = uniqueName("Bob");
    const password1 = uniqueName("pass");
    const project1 = uniqueName("project");
    registerNewUser(user1, password1);
    confirmNewUserEmailAddress(user1);
    createProjectFromInitialSetup(project1);
    signOut();

    cy.log("User 2 registers and creates a project");
    const user2 = uniqueName("Alice");
    const password2 = uniqueName("pass");
    const project2 = uniqueName("project");

    registerNewUser(user2, password2);
    confirmNewUserEmailAddress(user2);
    createProjectFromInitialSetup(project2);

    cy.log("User 2 invites User 1 to their project");
    cy.visit(`/${urlNormaliseProjectName(project2)}/settings/users`);
    cyEl("invite someone to project button").click();
    cyEl("invitee email address").type(getEmail(user1), { force: true });
    modalOkayButton("invite-someone-modal").click();
    signOut();

    cy.log("User 1 signs in and accepts the email link");
    signInExistingUser(user1, password1);
    waitForEmail("invite").then((email) => {
      const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
      cy.url().should("contain", urlNormaliseProjectName(project1));
      cy.visit(`/accept-invite/${token}`);
      cy.url().should("contain", urlNormaliseProjectName(project2));
      signOut();

      cy.log(
        "Logged out user with a project invite link should be able to accept the invitation after login"
      );
      signInExistingUser(user2, password2);
      const project3 = uniqueName("project");
      createNewProject(project3);
      cy.visit(`/${urlNormaliseProjectName(project3)}/settings/users`);
      cyEl("invite someone to project button").click();
      cyEl("invitee email address").type(getEmail(user1), { force: true });
      modalOkayButton("invite-someone-modal").click();
      signOut();
      cy.url().should("contain", "sign-in");

      waitForEmail("invite-2").then((email) => {
        const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
        cy.log("Accepting project invite while logged out");
        cy.visit(`/accept-invite/${token}`);
        signInExistingUser(user1, password1);
        // Now the invite should be accepted, and we should be able redirected to the project
        cy.url().should("contain", urlNormaliseProjectName(project3));
      });
    });
  });

  it("User is able to reset their forgotten password", () => {
    cy.log("User 1 registers and creates a project");
    const user = uniqueName("Bob");
    const password = uniqueName("pass");
    const newPassword = uniqueName("pass");
    const project = uniqueName("project");
    registerNewUser(user, password);
    confirmNewUserEmailAddress(user);
    createProjectFromInitialSetup(project);
    signOut();
    cy.log("User clicks forgotten password link");
    cyEl("forgotten password link").click();
    cy.url().should("contain", "forgot-password");
    cyEl("user email address").type(getEmail(user), { force: true });
    cyEl("send reset password email button").click();

    waitForEmail("reset-email").then((email) => {
      const { token } = extractTokenStartingWith(email, RESET_PASSWORD_PREFIX);
      cy.visit(`/reset-password/${token}`);
      cy.url().should("contain", "reset-password");

      cyEl("new password field").type(newPassword, { force: true });
      cyEl("new password confirmation field").type(newPassword, {
        force: true,
      });
      cyEl("reset password button").click();
      cyEl("sign in button").click();

      cy.url().should("contain", "sign-in");
      signInExistingUser(user, newPassword);
      cy.url().should("contain", urlNormaliseProjectName(project));
    });
  });

  it("Legacy browse users can sign in and have the option of confirming their current email address or choosing a new one", () => {
    cy.log(
      "Create an existing user with projects but without confirming email address"
    );
    const user1 = uniqueName("Bob");
    const password = uniqueName("pass");
    const project = uniqueName("project");
    registerNewUser(user1, password);
    confirmNewUserEmailAddress(user1);
    createProjectFromInitialSetup(project);

    cy.visit("/my-settings");

    // TODO - various things filling the fields incorrectly for changing username and email and
    //  making sure we get good validation error messages.

    cy.log("Check that user can change their display name");
    cyEl("change display name button").click();
    const newDisplayName = uniqueName("Bob updated");
    cyEl("display name").type(newDisplayName, { force: true });
    modalOkayButton("change-display-name").click();
    expect(cyEl("user display name").contains(newDisplayName)).to.exist;

    cy.log("Un-confirm user email address by changing email");
    cyEl("change email address button").click();
    const newEmailAddress = getEmail(newDisplayName);
    cyEl("email address").type(newEmailAddress, { force: true });
    modalOkayButton("change-email-address").click();

    cy.url().should("contain", "/setup");

    cyEl("send account confirmation email").should("not.exist");
    cyEl("new email address").should("not.exist");
    //sign out
    signOut();

    //sign in
    signInExistingUser(newDisplayName, password);
    cy.url().should("contain", "/setup");
    expect(cyEl("send account confirmation email")).to.exist;
    expect(cyEl("new email address")).to.exist;

    cy.log(
      "Check that we can correctly choose another email address from here"
    );
    const evenNewerEmailAddress = getEmail(uniqueName("Bob3"));
    cyEl("new email address").type(evenNewerEmailAddress, { force: true });
    cyEl("update email address button").click();
  });
});
