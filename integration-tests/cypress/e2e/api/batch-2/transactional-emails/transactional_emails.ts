import {
  ACCEPT_INVITE_PREFIX,
  clearMailServerLog,
  CONFIRM_EMAIL_PREFIX,
  confirmEmailAddress,
  extractTokenStartingWith,
  getEmailSubject,
  getEmailToAddress,
  JOIN_GROUP_REQUEST_PREFIX,
  pumpSmtp,
  startMailServerStub,
  waitForEmail,
} from "@commands/emailUtils";
import { getTestEmail, getTestName } from "@commands/names";
import { HttpStatusCode, UserGlobalPermission } from "@typedefs/api/consts";
import { LATEST_END_USER_AGREEMENT } from "@commands/constants";
import { getCreds } from "@commands/server";
import { uniqueName } from "@commands/testUtils";

describe("Transactional emails for different user lifecycle actions", () => {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(startMailServerStub);

    it("When a user signs up, they should receive a welcome email with an email confirmation link.", () => {
      const normalUser = uniqueName("user");
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);

      const expectedUser = {
        userName: getTestName(normalUser),
        email: getTestEmail(normalUser),
        globalPermission: UserGlobalPermission.Off,
        endUserAgreement: 3,
        emailConfirmed: false,
      };
      cy.log("Add a new user");
      cy.apiUserAdd(normalUser).then((userId) => {
        cy.log("Check that user email address is not confirmed");
        cy.apiUserCheck(normalUser, userId.toString(), {
          ...expectedUser,
          id: userId,
        });
        cy.log("Confirm email address using token from email");
        confirmEmailAddress(normalUser);
        cy.log("Check that user email address is confirmed");
        cy.apiUserCheck(normalUser, userId.toString(), {
          ...expectedUser,
          id: userId,
          emailConfirmed: true,
        });
        cy.log(
          "Add the user to the group, then remove them and check that they get a notification email"
        );
        clearMailServerLog();
        cy.apiGroupUserAdd(adminUser, normalUser, group, true);
        cy.apiGroupUserRemove(adminUser, normalUser, group);
        waitForEmail("group remove notification").then((email) => {
          expect(getEmailSubject(email)).to.equal(
            `❗️You've been removed from '${getTestName(group)}'`
          );
          expect(getEmailToAddress(email)).to.equal(getTestEmail(normalUser));
        });
      });
    });

    it("When a user signs up, they need to confirm their email before they can receive further transactional emails", () => {
      const normalUser = uniqueName("user");
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      const expectedUser = {
        userName: getTestName(normalUser),
        email: getTestEmail(normalUser),
        globalPermission: UserGlobalPermission.Off,
        endUserAgreement: 3,
        emailConfirmed: false,
      };

      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add a new user");
      cy.apiUserAdd(normalUser).then((userId) => {
        cy.log("Check that user email address is not confirmed");
        cy.apiUserCheck(normalUser, userId.toString(), {
          ...expectedUser,
          id: userId,
        });
        clearMailServerLog();
        // Do something that would trigger a transactional email.
        cy.log("Admin adds user to group, user should not receive an email");
        cy.apiGroupUserAdd(adminUser, normalUser, group, true);
        cy.apiGroupUserRemove(adminUser, normalUser, group);
        pumpSmtp();
        waitForEmail("group remove confirmation").then((email) => {
          expect(email).to.not.contain("❗️You've been removed from");
        });
      });
    });

    it("When a new user joins a from a group invite link they should receive a special welcome email, and their email should be automatically confirmed", () => {
      const adminUser = uniqueName("admin");
      const normalUser = uniqueName("user");
      const group = uniqueName("group");
      cy.log("Create a group to invite new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      clearMailServerLog();
      cy.apiGroupUserInvite(adminUser, normalUser, group);
      waitForEmail("invite").then((email) => {
        const { token } = extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
        cy.log("User signs up to browse via invite link");
        cy.apiUserAdd(
          normalUser,
          "_foobar1",
          getTestEmail(normalUser),
          LATEST_END_USER_AGREEMENT,
          HttpStatusCode.Ok,
          {},
          token
        ).then((userId) => {
          cy.log("Group invite is automatically accepted upon sign-up");
          waitForEmail("welcome").then((email) => {
            expect(getEmailSubject(email)).to.equal(
              "🎉 Welcome to your new Cacophony Monitoring account!"
            );
          });
          cy.apiGroupUsersCheck(adminUser, group, [
            {
              userName: getTestName(adminUser),
              id: getCreds(adminUser).id,
              owner: true,
              admin: true,
            },
            {
              userName: getTestName(normalUser),
              admin: false,
              owner: false,
              id: userId,
            },
          ]);
          cy.log("Ensure that user email is confirmed");
          cy.apiUserCheck(normalUser, userId.toString(), {
            userName: getTestName(normalUser),
            email: getTestEmail(normalUser),
            globalPermission: UserGlobalPermission.Off,
            endUserAgreement: LATEST_END_USER_AGREEMENT,
            id: userId,
            emailConfirmed: true,
          });
          // Still try to accept the invite, since the user may have signed up with a different email,
          // but it may be already used.
          cy.apiGroupUserAcceptInvite(
            normalUser,
            group,
            token,
            false,
            false,
            HttpStatusCode.Forbidden
          );
        });
      });
    });

    it("When a user removes themself from a group, they shouldn't receive email confirmation", () => {
      const adminUser = uniqueName("admin");
      const secondAdminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create first admin user and group");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Create second user");
      cy.apiUserAdd(secondAdminUser);
      cy.log("Make sure user can receive email notifications");
      confirmEmailAddress(secondAdminUser);
      cy.log("Add second user as admin user of group");
      cy.apiGroupUserAdd(adminUser, secondAdminUser, group, true).then(() => {
        clearMailServerLog();
        cy.log("Second admin removes themselves from group");
        cy.apiGroupUserRemove(secondAdminUser, secondAdminUser, group);
        pumpSmtp();
        cy.log(
          "Because the user removes themselves, we don't expect a removal confirmation"
        );
        waitForEmail("group remove confirmation").then((email) => {
          expect(email).to.not.contain("❗️You've been removed from");
        });
      });
    });

    it("When an admin user changes another user's group permissions, that user should receive an email notification", () => {
      const adminUser = uniqueName("admin");
      const secondUser = uniqueName("user");
      const group = uniqueName("group");
      cy.log("Create first admin user and group");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Create second user");
      cy.apiUserAdd(secondUser);
      cy.log("Make sure user can receive email notifications");
      confirmEmailAddress(secondUser);
      cy.log("Add second user to group");
      cy.apiGroupUserAdd(adminUser, secondUser, group).then(() => {
        clearMailServerLog();
        cy.log("Admin makes other user an admin");
        cy.apiGroupUserAdd(adminUser, secondUser, group, true, false);
        cy.log("user receives an email saying they've been made an admin");
        waitForEmail("group permissions change confirmation").then((email) => {
          expect(getEmailSubject(email)).to.contain(
            `Your status in the group '${getTestName(group)}' has changed`
          );
          expect(
            email.includes("You've been made a group administrator")
          ).to.equal(true);
          expect(email.includes("You've been made a group owner")).to.equal(
            false
          );
          expect(
            email.includes("You are no longer an administrator of this group")
          ).to.equal(false);
          expect(
            email.includes("You are no longer an owner of this group")
          ).to.equal(false);
        });
      });
    });

    it("When a user changes their own group permissions, they shouldn't receive email confirmation", () => {
      const adminUser = uniqueName("admin");
      const secondAdminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create first admin user and group");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Create second user");
      cy.apiUserAdd(secondAdminUser);
      cy.log("Make sure user can receive email notifications");
      confirmEmailAddress(secondAdminUser);
      cy.log("Add second user as admin user of group");
      cy.apiGroupUserAdd(adminUser, secondAdminUser, group, true).then(() => {
        clearMailServerLog();
        cy.log("Second admin makes themselves a non-admin");
        cy.apiGroupUserAdd(
          secondAdminUser,
          secondAdminUser,
          group,
          false,
          false
        );
        pumpSmtp();
        cy.log(
          "Because the user changes their own permissions, we don't expect a removal confirmation"
        );
        waitForEmail("group status change").then((email) => {
          expect(getEmailSubject(email)).to.not.equal(
            `Your status in the group '${getTestName(group)}' has changed`
          );
        });
      });
    });

    it("When a user is added to or removed from a group, they should receive a notification email", () => {
      const normalUser = uniqueName("user");
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add a new user");
      cy.apiUserAdd(normalUser).then(() => {
        confirmEmailAddress(normalUser);
        // Do something that would trigger a transactional email.
        cy.log("Admin adds user to group, user should not receive an email");
        cy.apiGroupUserAdd(adminUser, normalUser, group);
        waitForEmail("added to group").then((email) => {
          expect(getEmailSubject(email)).to.equal(
            `👌 You've been accepted to '${getTestName(group)}'`
          );
        });
        cy.apiGroupUserRemove(adminUser, normalUser, group);
        waitForEmail("group remove confirmation").then((email) => {
          expect(getEmailSubject(email)).to.contain(
            "❗️You've been removed from"
          );
        });
      });
    });

    it("If a user hasn't confirmed their email, and they are invited to a group, they get an invitation for non-members", () => {
      const normalUser = uniqueName("user");
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add a new user");
      cy.apiUserAdd(normalUser).then(() => {
        cy.apiGroupUserInvite(adminUser, getTestEmail(normalUser), group);
        waitForEmail("non-member group invite").then((email) => {
          expect(getEmailSubject(email)).to.equal(
            "You've been invited to join a group on Cacophony Monitoring"
          );
        });
      });
    });

    it("A user can make a request to a group admin to join their group.  The group admin should receive an email", () => {
      const normalUser = uniqueName("user");
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      confirmEmailAddress(adminUser);
      cy.log("Add a new user");
      cy.apiUserAdd(normalUser).then(() => {
        confirmEmailAddress(normalUser);
        clearMailServerLog();
        cy.apiGroupUserRequestInvite(
          getTestEmail(adminUser),
          normalUser,
          group
        );
        waitForEmail("group join request").then((email) => {
          expect(getEmailSubject(email)).to.equal(
            `A Cacophony Monitoring user wants to join your '${getTestName(
              group
            )}' group`
          );
          expect(getEmailToAddress(email)).to.equal(getTestEmail(adminUser));
          const { token } = extractTokenStartingWith(
            email,
            JOIN_GROUP_REQUEST_PREFIX
          );
          cy.log("Admin user accepts request");
          cy.apiGroupUserAcceptInviteRequest(adminUser, token);
          waitForEmail("join request approved").then((email) => {
            expect(getEmailSubject(email)).to.equal(
              `👌 You've been accepted to '${getTestName(group)}'`
            );
            expect(getEmailToAddress(email)).to.equal(getTestEmail(normalUser));
          });
        });
      });
    });

    it("When a user changes their email address, they should get another email confirmation email", () => {
      const normalUser = uniqueName("user");
      cy.log("Add a new user");
      cy.apiUserAdd(normalUser).then((userId) => {
        confirmEmailAddress(normalUser);
        clearMailServerLog();
        cy.log("Make sure user has emailConfirmed set to true");
        cy.apiUserCheck(normalUser, userId.toString(), {
          email: getTestEmail(normalUser),
          id: userId,
          emailConfirmed: true,
          endUserAgreement: LATEST_END_USER_AGREEMENT,
          globalPermission: UserGlobalPermission.Off,
          userName: getTestName(normalUser),
        });
        cy.log("Change user email address");
        cy.apiUserUpdate(normalUser, {
          email: getTestEmail("new-email-address"),
        });

        // TODO: Maybe the email we have on file for the user shouldn't change until they confirm it?
        cy.apiUserCheck(normalUser, userId.toString(), {
          email: getTestEmail("new-email-address"),
          id: userId,
          emailConfirmed: false,
          endUserAgreement: LATEST_END_USER_AGREEMENT,
          globalPermission: UserGlobalPermission.Off,
          userName: getTestName(normalUser),
        });
        waitForEmail("confirm-new-email").then((email) => {
          expect(getEmailSubject(email)).to.equal(
            "🔧 Confirm your email change for Cacophony Monitoring"
          );
          expect(getEmailToAddress(email)).to.equal(
            getTestEmail("new-email-address")
          );
          const { payload, token } = extractTokenStartingWith(
            email,
            CONFIRM_EMAIL_PREFIX
          );
          expect(payload._type).to.equal("confirm-email");
          return cy.apiConfirmEmailAddress(token);
        });
      });
    });

    it.skip("When a device is moved, send a notification email to prompt to add an image.", () => {
      // TODO
    });
  }
});
