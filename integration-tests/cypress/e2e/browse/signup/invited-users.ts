import { uniqueName } from "@commands/testUtils";
import {
  ACCEPT_INVITE_PREFIX,
  CONFIRM_EMAIL_PREFIX,
  extractTokenStartingWith,
  JOIN_PROJECT_REQUEST_PREFIX,
  RESET_PASSWORD_PREFIX,
  startMailServerStubPromise,
  waitForEmail,
  waitForEmailPromise,
} from "@commands/emailUtils";
import {
  createNewProject,
  createProjectFromInitialSetup,
  cyEl,
  getEmail,
  modalOkayButton,
  registerNewUser,
  signInExistingUser,
  signOut,
  urlNormaliseProjectName,
} from "@commands/browse-helpers";
import { confirmNewUserEmailAddress } from "@commands/browse-helpers";

describe("User -> Project invite flows", () => {
  before(async () => {
    await startMailServerStubPromise();
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
    cy.get(".list-joinable-projects-button").click();
    // Since there is only one project, it won't show a list of options to choose from.
    modalOkayButton("join-project-modal").click();

    cy.log(
      "User should we should see our requested project listed with a pending status",
    );
    expect(cyEl("pending project memberships")).to.exist;
    expect(cyEl("pending project memberships").contains(project)).to.exist;
    expect(cyEl(`waiting for approval from admin of ${project}`)).to.exist;
    signOut();

    cy.log("Project admin should get a request via email");
    waitForEmail("join request").then((email) => {
      const { token } = extractTokenStartingWith(
        email,
        JOIN_PROJECT_REQUEST_PREFIX,
      );

      cy.log("Project admin signs in and accepts the email link");
      signInExistingUser(user1, password);
      cy.url().should("contain", urlNormaliseProjectName(project));
      cy.visit(`/confirm-project-membership-request/${token}`);
      cy.url().should("contain", urlNormaliseProjectName(project));
      signOut();

      cy.log("Requesting user should get email confirmation of join request");
      waitForEmail("join request accepted").then((email) => {
        expect(email).to.include(`You've been added to the group ${project}.`);
        cy.log(`Requesting user was added to project ${project}`);
        // Now if requesting user signs in, she should see the project in her projects list.
        signInExistingUser(user2, password);
        // The user only has the one project, so it should be selected on login.
        cy.url().should("contain", urlNormaliseProjectName(project));
      });
    });
  });

  it("An existing user with a project can invite a non-platform member using their email address", () => {
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

    waitForEmail("invite").then((email) => {
      cy.log(`${user2} receives invite email`);
      const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
      cy.log("Bob accepts the email invitation by clicking the link");
      cy.visit(`/accept-invite/${token}`);
      cy.log("Bob isn't logged in, so should get redirected to sign-in");
      cy.url().should("contain", `/sign-in?nextUrl=/accept-invite/${token}`);

      registerNewUser(user2, password);
      confirmNewUserEmailAddress(user2);

      // Now accept the token
      cy.visit(`/accept-invite/${token}`);
    });
  });

  it("An existing user with a project can invite a non-platform member using their email address, and if they sign up with a *different* address, they'll get an error.", () => {
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

    waitForEmail("invite").then((email) => {
      cy.log(`${user2} receives invite email`);
      const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
      cy.log("Bob accepts the email invitation by clicking the link");
      cy.visit(`/accept-invite/${token}`);
      cy.log("Bob isn't logged in, so should get redirected to sign-in");
      cy.url().should("contain", `/sign-in?nextUrl=/accept-invite/${token}`);

      const altUser2 = uniqueName("Bob-alt");
      registerNewUser(altUser2, password);
      confirmNewUserEmailAddress(altUser2);

      // Now accept the token
      cy.log("Accept invite error");
      cy.visit(`/accept-invite/${token}`);
      cyEl("accept invite error").should("exist");
    });
  });

  it("New user with a pending invitation is able to see and accept that invitation from their setup screen if they sign up normally", () => {
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
    cyEl(`accept project invitation button for ${project}`).click();
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

  it.only("Logged in user with a project invite link is able to accept the invitation", async () => {
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

    {
      cy.log("User 1 signs in and accepts the email link");
      signInExistingUser(user1, password1);
      const email = await waitForEmailPromise("invite");

      const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
      cy.url().should("contain", urlNormaliseProjectName(project1));
      cy.visit(`/accept-invite/${token}`);
      cy.url().should("contain", urlNormaliseProjectName(project2));
      signOut();
    }

    cy.log(
      "Logged out user with a project invite link should be able to accept the invitation after login",
    );
    signInExistingUser(user2, password2);
    const project3 = uniqueName("project");
    createNewProject(project3);
    cy.visit(`/${urlNormaliseProjectName(project3)}/settings/users`);
    cyEl("invite someone to project button").click();
    cyEl("invitee email address").type(getEmail(user1), { force: true });
    modalOkayButton("invite-someone-modal").click();
    signOut();
    {
      cy.url().should("contain", "sign-in");
      const email2 = await waitForEmailPromise("invite-2");

      const { token } = extractTokenStartingWith(email2, ACCEPT_INVITE_PREFIX);
      cy.log("Accepting project invite while logged out");
      cy.visit(`/accept-invite/${token}`);
      signInExistingUser(user1, password1);
      // Now the invite should be accepted, and we should be able redirected to the project
      cy.url().should("contain", urlNormaliseProjectName(project3));
    }
  });
});
