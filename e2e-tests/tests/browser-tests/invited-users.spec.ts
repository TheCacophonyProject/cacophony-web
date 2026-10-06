import { expect, test } from "@playwright/test";
import {
  clickModalOkayButton,
  confirmExistingUserNewEmailAddress,
  confirmNewUserEmailAddressWhileLoggedIn,
  createProjectFromInitialSetup,
  ensureMainNavIsAvailable,
  getEmail,
  registerNewUser,
  registerNewUserFromEmailLink,
  signInExistingUser,
  signOut,
  signOutFromSetup,
  uniqueName,
  urlNormaliseName,
  waitToNavigateToProject,
} from "@/helpers/browse-helpers";
import {
  openJoinProjectInviteEmailForExistingUser,
  openJoinProjectInviteEmailForNewUser,
  openJoinProjectRequestEmail,
  waitForEmailAndRenderEmailHtml,
} from "@/helpers/email-utils";

test("Existing new user is able to request to join an existing project from setup view", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
    await signOut(page);
  });
  await test.step(`${user2} registers a new account, then asks to join ${project}`, async () => {
    await registerNewUser(page, user2, password2);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user2);
    await page.getByTestId("join existing project button").click();
    await expect(page.getByTestId("join existing project form")).toBeVisible();
    await page.getByTestId("project admin email address").fill(getEmail(user1));
    await page.locator(".list-joinable-projects-button").click();
    // Since there is only one possible project to join, it won't show a list of options to choose from.
    await clickModalOkayButton(page, "join-project-modal");
    await test.step(`${user2} can see pending join project requests`, async () => {
      await expect(page.getByTestId("pending project memberships")).toBeVisible();
      await expect(page.getByTestId("pending project memberships")).toContainText(project);
      await expect(page.getByTestId(`waiting for approval from admin of ${project}`)).toBeVisible();
    });
    await signOutFromSetup(page);
  });
  await test.step(`${user1} (Project admin) gets a join request via email`, async () => {
    await signInExistingUser(page, user1, password1);
    await waitToNavigateToProject(page, project);
    await openJoinProjectRequestEmail(page, user1);
    await page.getByTestId("confirm project membership request").click();
    await waitToNavigateToProject(page, project);
    await signOut(page);
  });
  await test.step(`${user2} (requester) receives email confirmation that their request was accepted`, async () => {
    const email = await waitForEmailAndRenderEmailHtml(page, user2, "join request accepted");
    console.log("email", email);
    expect(email.body).toContain(`You're now a member of ${project}`);
    await page.goto("/");
  });
  await test.step(`${user2} signs in and is taken to project ${project}`, async () => {
    await signInExistingUser(page, user2, password2);
    await waitToNavigateToProject(page, project);
  });
});

test("An existing user with a project can invite a non-platform member using their email address", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  await test.step(`${user1} invites a non-member to join their project via email address, then signs out`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} receives invite email, and accepts it`, async () => {
    await openJoinProjectInviteEmailForNewUser(page, user2);
    await page.getByTestId("new user join project").click();
  });
  await test.step(`${user2} creates a new account, and are immediately added to the project`, async () => {
    // NOTE that users who are invited are not required to confirm their email address; they already are
    // responding to an email from that address.
    await registerNewUserFromEmailLink(page, user2, password2);
    await waitToNavigateToProject(page, project);
    const email = await waitForEmailAndRenderEmailHtml(page, user2, "welcome with projects");
    expect(email.body).toContain(
      "You've been automatically added to the following monitoring projects:",
    );
    expect(email.body).toContain(project);
  });
});

test("An existing user with a project can invite a non-platform member using their email address, and if they sign up with a *different* address, they'll need to do email confirmation first.", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const user2a = uniqueName("Alice alter");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  await test.step(`${user1} invites a non-member to join their project via email address, then signs out`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} receives invite email, and accepts it`, async () => {
    await openJoinProjectInviteEmailForNewUser(page, user2);
    await page.getByTestId("new user join project").click();
  });
  await test.step(`${user2} creates a new account with a *different email address* (${user2a}), and are immediately added to the project`, async () => {
    // NOTE that users who are invited are not required to confirm their email address; they already are
    // responding to an email from that address.
    await registerNewUserFromEmailLink(page, user2a, password2);
    await page.waitForURL("**/setup");
    // User should be taken to account setup page, where they are prompted to confirm their email address.
    await expect(page.getByTestId("resend confirmation email")).toBeAttached();
    await confirmExistingUserNewEmailAddress(page, user2a);
    await waitToNavigateToProject(page, project);
  });
});

test("An existing user can invite a platform member using an email address different to the one they signed up with, and they can still accept the invite using their existing account", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  const project2 = uniqueName("project2");
  await test.step(`${user2} creates a project`, async () => {
    await registerNewUser(page, user2, password2);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user2);
    await createProjectFromInitialSetup(page, project2);
    await signOut(page);
  });
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  await test.step(`${user1} invites a non-member email address to join their project, then signs out`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} receives invite email, and accepts it using an existing account`, async () => {
    await openJoinProjectInviteEmailForExistingUser(page, user2);
    await page.getByTestId("existing user join project").click();
    await signInExistingUser(page, user2, password2);
    await waitToNavigateToProject(page, project);
  });
});

test("New user with a pending invitation is able to see and accept that invitation from their setup screen if they sign up normally", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  await test.step(`${user1} invites a non-member email address to join their project, then signs out`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} receives invite email, ignores it, and signs up using her email address`, async () => {
    await openJoinProjectInviteEmailForNewUser(page, user2); // Ignore
    await registerNewUser(page, user2, password2);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user2);
  });
  await test.step(`${user2} can see pending invites, and accept them`, async () => {
    await expect(page.getByTestId("pending project memberships")).toBeVisible();
    await expect(page.getByTestId("pending project memberships")).toContainText(project);
    await page.getByTestId(`accept project invitation button for ${project}`).click();
    await waitToNavigateToProject(page, project);
  });
});

test("Existing user (with projects) is able to be invited to another project", async ({ page }) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  const project2 = uniqueName("project");
  await test.step(`${user2} creates a project`, async () => {
    await registerNewUser(page, user2, password2);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user2);
    await createProjectFromInitialSetup(page, project2);
    await signOut(page);
  });
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  await test.step(`${user1} invites a existing user to project, then signs out`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} receives invite email`, async () => {
    await openJoinProjectInviteEmailForExistingUser(page, user2); // Ignore
    await page.getByTestId("existing user join project").click();
    await signInExistingUser(page, user2, password2);
    await waitToNavigateToProject(page, project);
  });
});

test("Logged in user is able to accept a project invite", async ({ page }) => {
  const user1 = uniqueName("Bob");
  const user2 = uniqueName("Alice");
  const password1 = uniqueName("pass");
  const password2 = uniqueName("pass");
  const project = uniqueName("project");
  const project2 = uniqueName("project");
  await test.step(`${user2} creates a project`, async () => {
    await registerNewUser(page, user2, password2);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user2);
    await createProjectFromInitialSetup(page, project2);
    await signOut(page);
  });
  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project);
  });
  await test.step(`${user1} invites a existing user to project, then signs out`, async () => {
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} receives invite email, accepts while logged in`, async () => {
    await signInExistingUser(page, user2, password2);
    await waitToNavigateToProject(page, project2);
    await openJoinProjectInviteEmailForExistingUser(page, user2); // Ignore
    await page.getByTestId("existing user join project").click();
    await waitToNavigateToProject(page, project);
  });
});

test("Existing user (with projects) is able to request to join an existing project from main view", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const password1 = uniqueName("pass");
  const project1 = uniqueName("bobs project");

  const user2 = uniqueName("Alice");
  const project2 = uniqueName("alices project");
  const password2 = uniqueName("pass");

  await test.step(`${user1} creates a project`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project1);
    await signOut(page);
  });
  await test.step(`${user2} creates a project, then asks to join ${project1}`, async () => {
    await registerNewUser(page, user2, password2);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user2);
    await createProjectFromInitialSetup(page, project2);
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("switch or join project button").click();
    await page.getByTestId("join existing project button").click();
    await expect(page.getByTestId("join existing project form")).toBeVisible();
    await page.getByTestId("project admin email address").fill(getEmail(user1));
    await page.locator(".list-joinable-projects-button").click();

    // NOTE: Since there is only one project available to join, it won't show a list of options to choose from.
    await clickModalOkayButton(page, "join-project-modal");
    await signOut(page);
  });
  await test.step(`${user1} signs in and, opens the email and accepts join request`, async () => {
    await signInExistingUser(page, user1, password1);
    await waitToNavigateToProject(page, project1);
    await openJoinProjectRequestEmail(page, user1);
    await page.getByTestId("confirm project membership request").click();
    await waitToNavigateToProject(page, project1);
    await signOut(page);
  });
  await test.step(`${user2} signs in and can see the project in her projects list`, async () => {
    await signInExistingUser(page, user2, password2);
    await expect(page.getByTestId("switch project button")).toBeAttached();
    await page.getByTestId("switch project button").click();
    await page.getByTestId(urlNormaliseName(project1)).click();
    await waitToNavigateToProject(page, project1);
  });
});

test("If someone else already approved a request to join a project, accepting a duplicate request shows that the user was already approved", async ({
  page,
}) => {
  const user1 = uniqueName("Bob");
  const password1 = uniqueName("pass");
  const project1 = uniqueName("bobs project");

  const user2 = uniqueName("Alice");
  const password2 = uniqueName("pass");

  const user3 = uniqueName("Carol");
  const password3 = uniqueName("pass");
  const project3 = uniqueName("carols project");

  await test.step(`${user1} creates a project and invites ${user2} as a project admin`, async () => {
    await registerNewUser(page, user1, password1);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user1);
    await createProjectFromInitialSetup(page, project1);
    await ensureMainNavIsAvailable(page);
    await page.getByTestId("manage project").click();
    await expect(page).toHaveURL(`/${urlNormaliseName(project1)}/settings/users`);
    await page.getByTestId("invite someone to project button").click();
    await page.getByTestId("invitee email address").fill(getEmail(user2));
    await page.getByTestId("invite as project admin checkbox").check();
    await expect(page.getByTestId("invite as project admin checkbox")).toBeChecked();
    await clickModalOkayButton(page, "invite-someone-modal");
    await signOut(page);
  });
  await test.step(`${user2} accepts the invite by creating a new account, so ${project1} has two admins`, async () => {
    await openJoinProjectInviteEmailForNewUser(page, user2);
    await page.getByTestId("new user join project").click();
    await registerNewUserFromEmailLink(page, user2, password2);
    await waitToNavigateToProject(page, project1);
    // Consume the welcome email, so it isn't mistaken for the join request email later.
    await waitForEmail(user2, "welcome with projects");
    await signOut(page);
  });
  await test.step(`${user3} creates a project, then asks both admins to let them join ${project1}`, async () => {
    await registerNewUser(page, user3, password3);
    await confirmNewUserEmailAddressWhileLoggedIn(page, user3);
    await createProjectFromInitialSetup(page, project3);
    for (const admin of [user1, user2]) {
      await ensureMainNavIsAvailable(page);
      await page.getByTestId("switch or join project button").click();
      await page.getByTestId("join existing project button").click();
      await expect(page.getByTestId("join existing project form")).toBeVisible();
      await page.getByTestId("project admin email address").fill(getEmail(admin));
      await page.locator(".list-joinable-projects-button").click();
      // NOTE: Since there is only one project available to join, it won't show a list of options to choose from.
      await clickModalOkayButton(page, "join-project-modal");
    }
    await signOut(page);
  });
  await test.step(`${user1} approves the request via email`, async () => {
    await signInExistingUser(page, user1, password1);
    await waitToNavigateToProject(page, project1);
    await openJoinProjectRequestEmail(page, user1);
    await page.getByTestId("confirm project membership request").click();
    await waitToNavigateToProject(page, project1);
    await signOut(page);
  });
  await test.step(`${user2} approves the same request via email, and is told ${user3} is already a member`, async () => {
    await signInExistingUser(page, user2, password2);
    await waitToNavigateToProject(page, project1);
    await openJoinProjectRequestEmail(page, user2);
    await page.getByTestId("confirm project membership request").click();
    await expect(page.getByTestId("user already member of project")).toBeVisible();
    // The confirmation page has no main nav, so go back to the app before signing out.
    await page.goto("/");
    await waitToNavigateToProject(page, project1);
    await signOut(page);
  });
  await test.step(`${user3} can see ${project1} in their projects list`, async () => {
    await signInExistingUser(page, user3, password3);
    await expect(page.getByTestId("switch project button")).toBeAttached();
    await page.getByTestId("switch project button").click();
    await page.getByTestId(urlNormaliseName(project1)).click();
    await waitToNavigateToProject(page, project1);
  });
});
