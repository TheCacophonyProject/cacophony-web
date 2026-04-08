import { uniqueName } from "@commands/testUtils";
import {
  JOIN_PROJECT_REQUEST_PREFIX,
  extractTokenStartingWith,
  waitForEmail,
  RESET_PASSWORD_PREFIX,
  CONFIRM_EMAIL_PREFIX,
  startMailServerStubPromise,
  waitForEmailPromise,
} from "@commands/emailUtils";
import {
  confirmNewUserEmailAddress,
  createProjectFromInitialSetup,
  cyEl,
  getEmail,
  getEmailConfirmationToken,
  modalOkayButton,
  registerNewUser,
  signInExistingUser,
  signOut,
  urlNormaliseProjectName,
} from "@commands/browse-helpers";

describe("New users can sign up and confirm their email address", () => {
  before(async () => {
    await startMailServerStubPromise();
  });

  // eslint-disable-next-line cypress/no-async-tests
  it("Existing user (with projects) is able to request to join an existing project from main view", async () => {
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
    cy.get(".list-joinable-projects-button").click();

    // Since there is only one project, it won't show a list of options to choose from.
    modalOkayButton("join-project-modal").click();

    signOut();

    const email = await waitForEmailPromise("join request");
    const { token } = extractTokenStartingWith(
      email,
      JOIN_PROJECT_REQUEST_PREFIX,
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
        `sign-in?nextUrl=/confirm-account-email/${urlFriendlyToken}`,
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
    cy.url().should("contain", `/${urlNormaliseProjectName(project)}`);
    signOut();
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
      "Create an existing user with projects but without confirming email address",
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
      "Check that we can correctly choose another email address from here",
    );
    const evenNewerEmailAddress = getEmail(uniqueName("Bob3"));
    cyEl("new email address").type(evenNewerEmailAddress, { force: true });
    cyEl("update email address button").click();

    // Make sure a confirmation email is sent for that new address.
    waitForEmail("email confirmation").then((email) => {
      const { token } = extractTokenStartingWith(email, CONFIRM_EMAIL_PREFIX);
      // TODO: Check if we can do confirm account email successfully if logged out
      cy.visit(`/confirm-account-email/${token}`);
      cy.log("Redirected to Dashboard");
      cy.url().should("contain", `/${project}`);
    });
  });
});
