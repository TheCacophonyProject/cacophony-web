import {
  clearMailServerLog,
  extractTokenStartingWith,
  getEmailSubject,
  getEmailToAddress,
  startMailServerStub,
  waitForEmail,
} from "@commands/emailUtils";
import { getTestEmail, getTestName } from "@commands/names";
import { UserGlobalPermission } from "@typedefs/api/consts";
import { generateUUID } from "listr2/dist/utils/uuid";

// cy.log(
//     "Make sure the removed user gets an email telling them they've been removed"
// );
// startMailServerStub().then(() => {
//     waitForEmail("user group removal confirmation").then((email) => {
//         // Check that the email is addressed to the user, and that the subject is correct.
//         cy.log("Check that email has the correct subject");
//         expect(getEmailSubject(email)).to.equal(`You've been removed from the group '${getTestName("guGroup")}'`);
//         cy.log("Check that email is addressed to the removed user");
//         expect(getEmailToAddress(email)).to.equal(getTestEmail("guTestUser"));
//     });
// });
const CONFIRM_EMAIL_PREFIX = "/confirm-account-email/";

const confirmEmailAddress = (userName: string) => {
  return waitForEmail("welcome").then((email) => {
    expect(getEmailSubject(email)).to.equal(
      "🔧 Finish setting up your new Cacophony Monitoring account"
    );
    expect(getEmailToAddress(email)).to.equal(getTestEmail(userName));
    const { payload, token } = extractTokenStartingWith(
      email,
      CONFIRM_EMAIL_PREFIX
    );
    return cy.apiConfirmEmailAddress(token);
  });
};

const pumpSmtp = () => {
  cy.log("Pump smtp server stub");
  const user = "pump-smtp";
  return cy.apiUserAdd(user, "_foobar1", getTestEmail(user));
};

describe("Transactional emails for different user lifecycle actions", () => {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(startMailServerStub);
    it("When a user signs up, they should receive a welcome email with an email confirmation link.", () => {
      const userName = "user1";

      const adminUser = "admin0";
      const group = "group0";
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);

      const expectedUser = {
        userName: getTestName(userName),
        email: getTestEmail(userName),
        globalPermission: UserGlobalPermission.Off,
        endUserAgreement: 3,
        emailConfirmed: false,
      };
      cy.log("Add a new user");
      cy.apiUserAdd(userName, "_foobar1", getTestEmail(userName)).then(
        (userId) => {
          cy.log("Check that user email address is not confirmed");
          cy.apiUserCheck(userName, userId.toString(), {
            ...expectedUser,
            id: userId,
          });
          cy.log("Confirm email address using token from email");
          confirmEmailAddress(userName);
          cy.log("Check that user email address is confirmed");
          cy.apiUserCheck(userName, userId.toString(), {
            ...expectedUser,
            id: userId,
            emailConfirmed: true,
          });
          cy.log(
            "Add the user to the group, then remove them and check that they get a notification email"
          );
          clearMailServerLog();
          cy.apiGroupUserAdd(adminUser, userName, group, true);
          cy.apiGroupUserRemove(adminUser, userName, group);
          waitForEmail("group remove notification").then((email) => {
            expect(getEmailSubject(email)).to.equal(
              `❗️You've been removed from '${getTestName(group)}'`
            );
            expect(getEmailToAddress(email)).to.equal(getTestEmail(userName));
          });
        }
      );
    });

    it("When a user signs up, they need to confirm their email before they can receive further transactional emails", () => {
      const userName = "user2";
      const expectedUser = {
        userName: getTestName(userName),
        email: getTestEmail(userName),
        globalPermission: UserGlobalPermission.Off,
        endUserAgreement: 3,
        emailConfirmed: false,
      };
      const adminUser = "admin1";
      const group = "group1";
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add a new user");
      cy.apiUserAdd(userName, "_foobar1", getTestEmail(userName)).then(
        (userId) => {
          cy.log("Check that user email address is not confirmed");
          cy.apiUserCheck(userName, userId.toString(), {
            ...expectedUser,
            id: userId,
          });
          clearMailServerLog();
          // Do something that would trigger a transactional email.
          cy.log("Admin adds user to group, user should not receive an email");
          cy.apiGroupUserAdd(adminUser, userName, group, true);
          cy.apiGroupUserRemove(adminUser, userName, group);
          pumpSmtp();
          waitForEmail("group remove confirmation").then((email) => {
            expect(email).to.not.contain("❗️You've been removed from");
          });
        }
      );
    });

    it("When a user successfully joins a group, they should receive a notification email", () => {});

    it("When a user is removed from a group, they should receive a notification email", () => {});

    it("A user cannot be invited to a group if they have not confirmed their email", () => {});

    it("A user can make a request to a group admin to join their group.  The group admin should receive an email", () => {});

    it("When a user changes their email address, they should get another email confirmation email", () => {});
  }
});
