import { expect, test } from "@/helpers/upload-tests";
import {
  addDeviceToProject,
  createProject,
  createUser,
  getUserTestName,
} from "@/helpers/create-test-entities";
import { getEmail, uniqueName } from "@/helpers/browse-helpers";
import { HttpStatusCode } from "@shared/api/consts";
import {
  ACCEPT_INVITE_PREFIX,
  CONFIRM_EMAIL_PREFIX,
  confirmEmailAddressViaApi,
  extractTokenStartingWith,
  JOIN_GROUP_REQUEST_PREFIX,
  receiveAndIgnoreConfirmationEmail,
  waitForEmail,
} from "@/helpers/email-utils";
import { TestApiImpl } from "@shared/client";
import { TestUserHandle } from "@shared/client/types";

const LATEST_END_USER_AGREEMENT = 3;

const getUserEmailConfirmed = async (
  user: TestUserHandle,
  email = getEmail(user.testId),
): Promise<boolean | undefined> => {
  const loginResponse = await TestApiImpl.Users.login(email, "password");
  expect(loginResponse.success, "login succeeded").toBe(true);
  return loginResponse.success ? loginResponse.result.userData.emailConfirmed : undefined;
};

test.describe("Transactional emails for different user lifecycle actions", () => {
  test("When a user signs up, they should receive a welcome email with an email confirmation link.", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const AdminApi = TestApiImpl.withAuth(adminUser.testId);
    const normalUser = await createUser("user");

    await test.step("Check that user email address is not confirmed", async () => {
      expect(await getUserEmailConfirmed(normalUser), "email is not confirmed").toBe(false);
    });

    await confirmEmailAddressViaApi(normalUser);

    await test.step("Check that user email address is confirmed", async () => {
      expect(await getUserEmailConfirmed(normalUser), "email is confirmed").toBe(true);
    });

    await test.step("Add the user to the project, then remove them and check that they get a notification email", async () => {
      const addResponse = await AdminApi.Projects.addOrUpdateProjectUser(
        project.testId,
        true,
        false,
        normalUser.id,
      );
      expect(addResponse.success, "add user to project succeeded").toBe(true);
      // Receive and ignore the acceptance email
      await waitForEmail(normalUser.testId, "project added notification");

      const removeResponse = await AdminApi.Projects.removeProjectUser(
        project.id,
        undefined,
        normalUser.id,
      );
      expect(removeResponse.success, "remove user from project succeeded").toBe(true);
      const email = await waitForEmail(normalUser.testId, "project remove notification");
      expect(email.headers.subject).toEqual(`❗️You've been removed from '${project.testId}'`);
      expect(email.headers.to).toEqual(getEmail(normalUser.testId));
    });
  });

  test("When a user signs up, they need to confirm their email before they can receive further transactional emails", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const AdminApi = TestApiImpl.withAuth(adminUser.testId);
    const normalUser = await createUser("user");

    await test.step("Check that user email address is not confirmed", async () => {
      expect(await getUserEmailConfirmed(normalUser), "email is not confirmed").toBe(false);
    });

    // Do something that would trigger a transactional email.
    await test.step("Admin adds user to project, then removes them", async () => {
      const addResponse = await AdminApi.Projects.addOrUpdateProjectUser(
        project.testId,
        true,
        false,
        normalUser.id,
      );
      expect(addResponse.success, "add user to project succeeded").toBe(true);
      const removeResponse = await AdminApi.Projects.removeProjectUser(
        project.id,
        undefined,
        normalUser.id,
      );
      expect(removeResponse.success, "remove user from project succeeded").toBe(true);
    });

    await test.step("User only receives the sign-up confirmation email, and no further emails", async () => {
      await receiveAndIgnoreConfirmationEmail(normalUser.testId);
      const email = await waitForEmail(
        normalUser.testId,
        "project remove notification",
        500,
        false,
        "You've been removed from",
      );
      expect(email.error, "removal email not sent").toBeDefined();
    });
  });

  test("When a new user joins a project from a project invite link they should receive a special welcome email, and their email should be automatically confirmed", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const AdminApi = TestApiImpl.withAuth(adminUser.testId);
    const newUserHandle = getUserTestName("user");

    const inviteResponse = await AdminApi.Projects.inviteSomeoneToProject(
      project.testId,
      getEmail(newUserHandle),
    );
    expect(inviteResponse.success, "invite user succeeded").toBe(true);

    const inviteEmail = await waitForEmail(newUserHandle, "invite");
    expect(inviteEmail.headers.subject).toEqual(
      "You've been invited to join a project on Cacophony Monitoring",
    );
    const { token } = await extractTokenStartingWith(inviteEmail, ACCEPT_INVITE_PREFIX);

    const newUser = await test.step("User signs up via invite link", async () => {
      const registerResponse = await TestApiImpl.Users.register(
        newUserHandle,
        "password",
        getEmail(newUserHandle),
        LATEST_END_USER_AGREEMENT,
        token.replaceAll(":", "."),
      );
      expect(registerResponse.success, "register user succeeded").toBe(true);
      if (!registerResponse.success) {
        throw new Error("Failed to register user");
      }
      TestApiImpl.registerCredentials(newUserHandle, {
        userData: registerResponse.result.userData,
        refreshToken: registerResponse.result.refreshToken,
        apiToken: registerResponse.result.token,
      });
      return {
        testId: newUserHandle,
        id: registerResponse.result.userData.id,
        type: "user",
      } as TestUserHandle;
    });

    await test.step("Project invite is automatically accepted upon sign-up", async () => {
      const welcomeEmail = await waitForEmail(newUser.testId, "welcome");
      expect(welcomeEmail.headers.subject).toEqual(
        "🎉 Welcome to your new Cacophony Monitoring account!",
      );
      const users = await AdminApi.Projects.getUsersForProject(project.id);
      // The API makes no guarantees about the order of users
      expect(users).toHaveLength(2);
      expect(users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userName: adminUser.testId,
            id: adminUser.id,
            owner: true,
            admin: true,
          }),
          expect.objectContaining({
            userName: newUser.testId,
            id: newUser.id,
            owner: false,
            admin: false,
          }),
        ]),
      );
    });

    await test.step("Ensure that user email is confirmed", async () => {
      expect(await getUserEmailConfirmed(newUser), "email is confirmed").toBe(true);
    });

    await test.step("Accepting the invite again is rejected, since it has already been used", async () => {
      // The user may have signed up with a different email, but the invite is already used.
      const acceptResponse = await TestApiImpl.Users.withAuth(
        newUser.testId,
      ).acceptProjectInvitation(project.id);
      expect(acceptResponse.success, "accepting a used invite fails").toBe(false);
      expect(acceptResponse.status).toEqual(HttpStatusCode.Forbidden);
    });
  });

  test("When a user removes themself from a project, they shouldn't receive email confirmation", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const secondAdminUser = await createUser("admin");
    // Make sure user can receive email notifications
    await confirmEmailAddressViaApi(secondAdminUser);

    await test.step("Add second user as admin user of project", async () => {
      const addResponse = await TestApiImpl.withAuth(
        adminUser.testId,
      ).Projects.addOrUpdateProjectUser(project.testId, true, false, secondAdminUser.id);
      expect(addResponse.success, "add user to project succeeded").toBe(true);
      // Receive and ignore the acceptance email
      await waitForEmail(secondAdminUser.testId, "project added notification");
    });

    await test.step("Second admin removes themselves from project", async () => {
      const removeResponse = await TestApiImpl.withAuth(
        secondAdminUser.testId,
      ).Projects.removeProjectUser(project.id, undefined, secondAdminUser.id);
      expect(removeResponse.success, "remove user from project succeeded").toBe(true);
    });

    await test.step("Because the user removes themselves, we don't expect a removal confirmation", async () => {
      const email = await waitForEmail(
        secondAdminUser.testId,
        "project remove confirmation",
        500,
        false,
        "You've been removed from",
      );
      expect(email.error, "removal email not sent").toBeDefined();
    });
  });

  test("When an admin user changes another user's project permissions, that user should receive an email notification", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const AdminApi = TestApiImpl.withAuth(adminUser.testId);
    const secondUser = await createUser("user");
    // Make sure user can receive email notifications
    await confirmEmailAddressViaApi(secondUser);

    await test.step("Add second user to project", async () => {
      const addResponse = await AdminApi.Projects.addOrUpdateProjectUser(
        project.testId,
        false,
        false,
        secondUser.id,
      );
      expect(addResponse.success, "add user to project succeeded").toBe(true);
      // Receive and ignore the acceptance email
      await waitForEmail(secondUser.testId, "project added notification");
    });

    await test.step("Admin makes other user an admin", async () => {
      const updateResponse = await AdminApi.Projects.addOrUpdateProjectUser(
        project.testId,
        true,
        false,
        secondUser.id,
      );
      expect(updateResponse.success, "update user permissions succeeded").toBe(true);
    });

    await test.step("User receives an email saying they've been made an admin", async () => {
      const email = await waitForEmail(
        secondUser.testId,
        "project permissions change confirmation",
        undefined,
        false,
        "has changed",
      );
      expect(email.headers.subject).toContain(
        `Your status in the group '${project.testId}' has changed`,
      );
      expect(email.body).toContain("You've been made a project administrator");
      expect(email.body).not.toContain("You've been made a project owner");
      expect(email.body).not.toContain("You are no longer an administrator of this project");
      expect(email.body).not.toContain("You are no longer an owner of this project");
    });
  });

  test("When a user changes their own project permissions, they shouldn't receive email confirmation", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const secondAdminUser = await createUser("admin");
    // Make sure user can receive email notifications
    await confirmEmailAddressViaApi(secondAdminUser);

    await test.step("Add second user as admin user of project", async () => {
      const addResponse = await TestApiImpl.withAuth(
        adminUser.testId,
      ).Projects.addOrUpdateProjectUser(project.testId, true, false, secondAdminUser.id);
      expect(addResponse.success, "add user to project succeeded").toBe(true);
      // Receive and ignore the acceptance email
      await waitForEmail(secondAdminUser.testId, "project added notification");
    });

    await test.step("Second admin makes themselves a non-admin", async () => {
      const updateResponse = await TestApiImpl.withAuth(
        secondAdminUser.testId,
      ).Projects.addOrUpdateProjectUser(project.testId, false, false, secondAdminUser.id);
      expect(updateResponse.success, "update own permissions succeeded").toBe(true);
    });

    await test.step("Because the user changes their own permissions, we don't expect a permissions change email", async () => {
      const email = await waitForEmail(
        secondAdminUser.testId,
        "project permissions change confirmation",
        500,
        false,
        "has changed",
      );
      expect(email.error, "permissions change email not sent").toBeDefined();
    });
  });

  test("When a user is added to or removed from a project, they should receive a notification email", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const AdminApi = TestApiImpl.withAuth(adminUser.testId);
    const normalUser = await createUser("user");
    // Make sure user can receive email notifications
    await confirmEmailAddressViaApi(normalUser);

    await test.step("Admin adds user to project, user receives a notification email", async () => {
      const addResponse = await AdminApi.Projects.addOrUpdateProjectUser(
        project.testId,
        false,
        false,
        normalUser.id,
      );
      expect(addResponse.success, "add user to project succeeded").toBe(true);
      const email = await waitForEmail(normalUser.testId, "added to project");
      expect(email.headers.subject).toEqual(`👌 You've been accepted to '${project.testId}'`);
    });

    await test.step("Admin removes user from project, user receives a notification email", async () => {
      const removeResponse = await AdminApi.Projects.removeProjectUser(
        project.id,
        undefined,
        normalUser.id,
      );
      expect(removeResponse.success, "remove user from project succeeded").toBe(true);
      const email = await waitForEmail(normalUser.testId, "project remove confirmation");
      expect(email.headers.subject).toContain("❗️You've been removed from");
    });
  });

  test("If a user hasn't confirmed their email, and they are invited to a project, they still get an invitation email", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const normalUser = await createUser("user");

    await receiveAndIgnoreConfirmationEmail(normalUser.testId);

    await test.step("Admin invites user with unconfirmed email to project", async () => {
      const inviteResponse = await TestApiImpl.withAuth(
        adminUser.testId,
      ).Projects.inviteSomeoneToProject(project.testId, getEmail(normalUser.testId));
      expect(inviteResponse.success, "invite user succeeded").toBe(true);
    });

    await test.step("User receives the invitation for non-members", async () => {
      const email = await waitForEmail(normalUser.testId, "non-member project invite");
      expect(email.headers.subject).toEqual(
        "You've been invited to join a project on Cacophony Monitoring",
      );
      const { payload } = await extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
      expect(payload, "token payload is for an existing user").toMatchObject({
        _type: "invite-existing-user",
      });
    });
  });

  test("Non-activated users should be denied when requesting project membership", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    await confirmEmailAddressViaApi(adminUser);
    // Add a new user but don't confirm their email
    const normalUser = await createUser("user");

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestToJoinProject(getEmail(adminUser.testId), project.id);
    expect(requestResponse.success, "non-activated user's request fails").toBe(false);
    expect(requestResponse.status).toEqual(HttpStatusCode.BadRequest);
  });

  test("Non-activated admin should prevent project membership requests", async () => {
    // Create a project but don't confirm admin email
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    // Add a new user and confirm their email
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestToJoinProject(getEmail(adminUser.testId), project.id);
    expect(requestResponse.success, "request to non-activated admin fails").toBe(false);
    expect(requestResponse.status).toEqual(HttpStatusCode.BadRequest);
  });

  test("A user can make a request to a project admin to join their project. The project admin should receive an email", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    await confirmEmailAddressViaApi(adminUser);
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    await test.step("User requests to join the project", async () => {
      const requestResponse = await TestApiImpl.withAuth(
        normalUser.testId,
      ).Users.requestToJoinProject(getEmail(adminUser.testId), project.id);
      expect(requestResponse.success, "request to join project succeeded").toBe(true);
    });

    const { token } = await test.step("Admin receives the join request email", async () => {
      const email = await waitForEmail(adminUser.testId, "project join request");
      expect(email.headers.subject).toEqual(
        `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
      );
      expect(email.headers.to).toEqual(getEmail(adminUser.testId));
      return await extractTokenStartingWith(email, JOIN_GROUP_REQUEST_PREFIX);
    });

    await test.step("Admin user accepts request", async () => {
      const acceptResponse = await TestApiImpl.withAuth(
        adminUser.testId,
      ).Users.confirmAddToProjectRequest(token.replaceAll(":", "."));
      expect(acceptResponse.success, "accepting join request succeeded").toBe(true);
    });

    await test.step("User receives an email saying their request was approved", async () => {
      const email = await waitForEmail(normalUser.testId, "join request approved");
      expect(email.headers.subject).toEqual(`👌 You've been accepted to '${project.testId}'`);
      expect(email.headers.to).toEqual(getEmail(normalUser.testId));
    });
  });

  test("A user can make a request to join a project without specifying an admin, and the request goes to the project owner", async () => {
    const ownerUser = await createUser("owner");
    const project = await createProject("project", ownerUser);
    await confirmEmailAddressViaApi(ownerUser);
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    await test.step("User requests to join the project without specifying an admin email", async () => {
      const requestResponse = await TestApiImpl.withAuth(
        normalUser.testId,
      ).Users.requestToJoinProject(undefined, project.id);
      expect(requestResponse.success, "request to join project succeeded").toBe(true);
    });

    const { token } = await test.step("Owner receives the join request email", async () => {
      const email = await waitForEmail(ownerUser.testId, "project join request to owner");
      expect(email.headers.subject).toEqual(
        `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
      );
      expect(email.headers.to).toEqual(getEmail(ownerUser.testId));
      return await extractTokenStartingWith(email, JOIN_GROUP_REQUEST_PREFIX);
    });

    await test.step("Owner accepts request", async () => {
      const acceptResponse = await TestApiImpl.withAuth(
        ownerUser.testId,
      ).Users.confirmAddToProjectRequest(token.replaceAll(":", "."));
      expect(acceptResponse.success, "accepting join request succeeded").toBe(true);
    });

    await test.step("User receives an email saying their request was approved", async () => {
      const email = await waitForEmail(normalUser.testId, "join request approved for normal user");
      expect(email.headers.subject).toEqual(`👌 You've been accepted to '${project.testId}'`);
      expect(email.headers.to).toEqual(getEmail(normalUser.testId));
    });

    await test.step("Check the user is now part of the project", async () => {
      const users = await TestApiImpl.withAuth(ownerUser.testId).Projects.getUsersForProject(
        project.id,
      );
      expect(users).toHaveLength(2);
      expect(users).toEqual(
        expect.arrayContaining([
          // Owners are implicitly admins
          expect.objectContaining({ id: ownerUser.id, owner: true, admin: true }),
          expect.objectContaining({ id: normalUser.id, owner: false, admin: false }),
        ]),
      );
    });
  });

  test("When a project has multiple owners, a join request without a specified admin goes to all of the owners", async () => {
    const ownerUser = await createUser("owner");
    const project = await createProject("project", ownerUser);
    await confirmEmailAddressViaApi(ownerUser);
    const secondOwnerUser = await createUser("owner");
    await confirmEmailAddressViaApi(secondOwnerUser);
    const addOwnerResponse = await TestApiImpl.withAuth(
      ownerUser.testId,
    ).Projects.addOrUpdateProjectUser(project.testId, true, true, secondOwnerUser.id);
    expect(addOwnerResponse.success, "add second owner succeeded").toBe(true);
    // Receive and ignore the acceptance email
    await waitForEmail(secondOwnerUser.testId, "project added notification");
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestToJoinProject(undefined, project.id);
    expect(requestResponse.success, "request to join project succeeded").toBe(true);

    for (const owner of [ownerUser, secondOwnerUser]) {
      await test.step(`Owner ${owner.testId} receives the join request email`, async () => {
        const email = await waitForEmail(owner.testId, "project join request to owner");
        expect(email.headers.subject).toEqual(
          `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
        );
        expect(email.headers.to).toEqual(getEmail(owner.testId));
      });
    }
  });

  test("When a project has multiple owners, a join request without a specified admin still succeeds if only some of the owners have confirmed their email", async () => {
    // The first owner never confirms their email address
    const unconfirmedOwnerUser = await createUser("owner");
    const project = await createProject("project", unconfirmedOwnerUser);
    await receiveAndIgnoreConfirmationEmail(unconfirmedOwnerUser.testId);
    const confirmedOwnerUser = await createUser("owner");
    await confirmEmailAddressViaApi(confirmedOwnerUser);
    const addOwnerResponse = await TestApiImpl.withAuth(
      unconfirmedOwnerUser.testId,
    ).Projects.addOrUpdateProjectUser(project.testId, true, true, confirmedOwnerUser.id);
    expect(addOwnerResponse.success, "add second owner succeeded").toBe(true);
    // Receive and ignore the acceptance email
    await waitForEmail(confirmedOwnerUser.testId, "project added notification");
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestToJoinProject(undefined, project.id);
    expect(requestResponse.success, "request to join project succeeded").toBe(true);

    await test.step("The confirmed owner receives the join request email", async () => {
      const email = await waitForEmail(confirmedOwnerUser.testId, "project join request to owner");
      expect(email.headers.subject).toEqual(
        `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
      );
    });

    await test.step("The unconfirmed owner does not receive the join request email", async () => {
      const email = await waitForEmail(
        unconfirmedOwnerUser.testId,
        "project join request to unconfirmed owner",
        500,
        false,
        "wants to join your",
      );
      expect(email.error, "join request email not sent").toBeDefined();
    });
  });

  test("Non-activated users should be denied when requesting device access", async () => {
    // Create a project with an owner and device, and confirm the owner's email
    const ownerUser = await createUser("owner");
    const project = await createProject("project", ownerUser);
    const device = await addDeviceToProject("device", project);
    await confirmEmailAddressViaApi(ownerUser);
    // Add a new user but don't confirm their email
    const normalUser = await createUser("user");

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestAccessToProjectWithDevice({
      deviceName: device.testId,
      groupName: project.testId,
    });
    expect(requestResponse.success, "non-activated user's request fails").toBe(false);
    expect(requestResponse.status).toEqual(HttpStatusCode.BadRequest);
  });

  test("Non-activated admin should prevent device access requests", async () => {
    // Create a project and device but don't confirm the admin's email
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const device = await addDeviceToProject("device", project);
    // Add a new user and confirm their email
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestAccessToProjectWithDevice(
      { deviceName: device.testId, groupName: project.testId },
      getEmail(adminUser.testId),
    );
    expect(requestResponse.success, "request to non-activated admin fails").toBe(false);
    expect(requestResponse.status).toEqual(HttpStatusCode.BadRequest);
  });

  test("A user can request access to a project via a device without specifying an admin, and the request goes to the project owner", async () => {
    const ownerUser = await createUser("owner");
    const project = await createProject("project", ownerUser);
    const device = await addDeviceToProject("device", project);
    await confirmEmailAddressViaApi(ownerUser);
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    await test.step("User requests access to the project via the device name (should go to owner)", async () => {
      const requestResponse = await TestApiImpl.withAuth(
        normalUser.testId,
      ).Users.requestAccessToProjectWithDevice({
        deviceName: device.testId,
        groupName: project.testId,
      });
      expect(requestResponse.success, "device access request succeeded").toBe(true);
    });

    const { token } =
      await test.step("Owner receives the device access request email", async () => {
        const email = await waitForEmail(ownerUser.testId, "device access request to owner");
        expect(email.headers.subject).toEqual(
          `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
        );
        expect(email.headers.to).toEqual(getEmail(ownerUser.testId));
        return await extractTokenStartingWith(email, JOIN_GROUP_REQUEST_PREFIX);
      });

    await test.step("Owner accepts request", async () => {
      const acceptResponse = await TestApiImpl.withAuth(
        ownerUser.testId,
      ).Users.confirmAddToProjectRequest(token.replaceAll(":", "."));
      expect(acceptResponse.success, "accepting device access request succeeded").toBe(true);
    });

    await test.step("User receives an email saying their request was approved", async () => {
      const email = await waitForEmail(normalUser.testId, "device access request approved");
      expect(email.headers.subject).toEqual(`👌 You've been accepted to '${project.testId}'`);
      expect(email.headers.to).toEqual(getEmail(normalUser.testId));
    });

    await test.step("Check the user is now part of the project", async () => {
      const users = await TestApiImpl.withAuth(ownerUser.testId).Projects.getUsersForProject(
        project.id,
      );
      expect(users).toHaveLength(2);
      expect(users).toEqual(
        expect.arrayContaining([
          // Owners are implicitly admins
          expect.objectContaining({ id: ownerUser.id, owner: true, admin: true }),
          expect.objectContaining({ id: normalUser.id, owner: false, admin: false }),
        ]),
      );
    });
  });

  test("A user can request access to a project via a device with a specified admin email", async () => {
    const adminUser = await createUser("admin");
    const project = await createProject("project", adminUser);
    const device = await addDeviceToProject("device", project);
    await confirmEmailAddressViaApi(adminUser);
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    await test.step("User requests access to the project via the device name, with the admin's email", async () => {
      const requestResponse = await TestApiImpl.withAuth(
        normalUser.testId,
      ).Users.requestAccessToProjectWithDevice(
        { deviceName: device.testId, groupName: project.testId },
        getEmail(adminUser.testId),
      );
      expect(requestResponse.success, "device access request succeeded").toBe(true);
    });

    const { token } =
      await test.step("Admin receives the device access request email", async () => {
        const email = await waitForEmail(adminUser.testId, "device access request to admin");
        expect(email.headers.subject).toEqual(
          `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
        );
        expect(email.headers.to).toEqual(getEmail(adminUser.testId));
        return await extractTokenStartingWith(email, JOIN_GROUP_REQUEST_PREFIX);
      });

    await test.step("Admin accepts request", async () => {
      const acceptResponse = await TestApiImpl.withAuth(
        adminUser.testId,
      ).Users.confirmAddToProjectRequest(token.replaceAll(":", "."));
      expect(acceptResponse.success, "accepting device access request succeeded").toBe(true);
    });

    await test.step("User receives an email saying their request was approved", async () => {
      const email = await waitForEmail(
        normalUser.testId,
        "device access request approved by admin",
      );
      expect(email.headers.subject).toEqual(`👌 You've been accepted to '${project.testId}'`);
      expect(email.headers.to).toEqual(getEmail(normalUser.testId));
    });
  });

  test("Non-activated users should be denied when requesting device access by ID", async () => {
    // Create a project with an owner and device, and confirm the owner's email
    const ownerUser = await createUser("owner");
    const project = await createProject("project", ownerUser);
    const device = await addDeviceToProject("device", project);
    await confirmEmailAddressViaApi(ownerUser);
    // Add a new user but don't confirm their email
    const normalUser = await createUser("user");

    const requestResponse = await TestApiImpl.withAuth(
      normalUser.testId,
    ).Users.requestAccessToProjectWithDevice({ deviceId: device.id });
    expect(requestResponse.success, "non-activated user's request fails").toBe(false);
    expect(requestResponse.status).toEqual(HttpStatusCode.BadRequest);
  });

  test("A user can request access to a project via a device ID without specifying an admin, and the request goes to the project owner", async () => {
    const ownerUser = await createUser("owner");
    const project = await createProject("project", ownerUser);
    const device = await addDeviceToProject("device", project);
    await confirmEmailAddressViaApi(ownerUser);
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);

    await test.step("User requests access to the project via the device ID (should go to owner)", async () => {
      const requestResponse = await TestApiImpl.withAuth(
        normalUser.testId,
      ).Users.requestAccessToProjectWithDevice({ deviceId: device.id });
      expect(requestResponse.success, "device access request succeeded").toBe(true);
    });

    const { token } =
      await test.step("Owner receives the device access request email", async () => {
        const email = await waitForEmail(ownerUser.testId, "device access request by ID to owner");
        expect(email.headers.subject).toEqual(
          `A Cacophony Monitoring user wants to join your '${project.testId}' project`,
        );
        expect(email.headers.to).toEqual(getEmail(ownerUser.testId));
        return await extractTokenStartingWith(email, JOIN_GROUP_REQUEST_PREFIX);
      });

    await test.step("Owner accepts request", async () => {
      const acceptResponse = await TestApiImpl.withAuth(
        ownerUser.testId,
      ).Users.confirmAddToProjectRequest(token.replaceAll(":", "."));
      expect(acceptResponse.success, "accepting device access request succeeded").toBe(true);
    });

    await test.step("User receives an email saying their request was approved", async () => {
      const email = await waitForEmail(normalUser.testId, "device access request by ID approved");
      expect(email.headers.subject).toEqual(`👌 You've been accepted to '${project.testId}'`);
      expect(email.headers.to).toEqual(getEmail(normalUser.testId));
    });
  });

  test("When a user changes their email address, they should get another email confirmation email", async () => {
    const normalUser = await createUser("user");
    await confirmEmailAddressViaApi(normalUser);
    await test.step("Make sure user has emailConfirmed set to true", async () => {
      expect(await getUserEmailConfirmed(normalUser), "email is confirmed").toBe(true);
    });

    const newEmailHandle = uniqueName("new-email-address");
    const newEmail = getEmail(newEmailHandle);
    await test.step("Change user email address", async () => {
      const changeResponse = await TestApiImpl.withAuth(normalUser.testId).Users.changeAccountEmail(
        newEmail,
      );
      expect(changeResponse.success, "change email succeeded").toBe(true);
    });

    // TODO: Maybe the email we have on file for the user shouldn't change until they confirm it?
    await test.step("The new email address is on file for the user, but isn't confirmed", async () => {
      expect(await getUserEmailConfirmed(normalUser, newEmail), "new email is not confirmed").toBe(
        false,
      );
    });

    await test.step("User receives an email at the new address and confirms it", async () => {
      const email = await waitForEmail(newEmailHandle, "confirm-new-email");
      expect(email.headers.subject).toEqual(
        "🔧 Confirm your email change for Cacophony Monitoring",
      );
      expect(email.headers.to).toEqual(newEmail);
      const { payload, token } = await extractTokenStartingWith(email, CONFIRM_EMAIL_PREFIX);
      expect(payload._type).toEqual("confirm-email");
      const confirmResponse = await TestApiImpl.Users.validateEmailConfirmationToken(
        token.replaceAll(":", "."),
      );
      expect(confirmResponse.success, "confirming new email succeeded").toBe(true);
    });

    await test.step("The new email address is now confirmed", async () => {
      expect(await getUserEmailConfirmed(normalUser, newEmail), "new email is confirmed").toBe(
        true,
      );
    });
  });
});
