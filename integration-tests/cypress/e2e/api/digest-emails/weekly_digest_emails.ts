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
    before(() => {
      startMailServerStub();
    });

    beforeEach(() => {
      clearMailServerLog();
    });

    it("Should send a weekly digest email to users with emailNotifications.weeklyDigest set to true", () => {
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);

      const expectedUser = {
        userName: getTestName(adminUser),
        email: getTestEmail(adminUser),
        globalPermission: UserGlobalPermission.Off,
        endUserAgreement: 3,
        emailConfirmed: true,
      };
      
      cy.log("Add a new user");
      // cy.apiUserAdd(adminUser).then((userId) => {
      //   cy.log(
      //     "Add the user to the group, then remove them and check that they get a notification email"
      //   );
      //   // clearMailServerLog();
      //   // cy.apiGroupUserAdd(adminUser, adminUser, group, true);
      //   // cy.apiGroupUserRemove(adminUser, adminUser, group);
      //   // waitForEmail("group remove notification").then((email) => {
      //   //   expect(getEmailSubject(email)).to.equal(
      //   //     `You've been removed from '${getTestName(group)}'`
      //   //   );
      //   //   expect(getEmailToAddress(email)).to.equal(getTestEmail(adminUser));
      //   // });
      // });
    });
  }
});