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
import { getCreds, makeAuthorizedRequestWithStatus, v1ApiPath} from "@commands/server";
import { uniqueName } from "@commands/testUtils";
import { apiAddUserSettings } from "@commands/api/user";


describe("Transactional emails for different user lifecycle actions", () => {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(() => {
      startMailServerStub();
    });

    beforeEach(() => {
      clearMailServerLog();
    });

    it("Should send a daily digest email to users with emailNotifications.dailyDigest set to true", () => {
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add user settings");

      const settings = {
        "settings": {
          "onboardTracking": {
            "dashboard": false,
            "location": false,
            "activity": false,
            "devices": false,
            "manage-project": false,
            "recording_view": false
          },
          "emailNotifications": {
              "dailyDigest": true,
              "weeklyDigest": true
          }
        }
      };

      clearMailServerLog();
      cy.apiAddUserSettings(
        adminUser,
        settings,
        200
      ).then((response: any) => {
        clearMailServerLog();
        cy.log("User settings have been added");
        const command = 'cd api && node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/daily-digest.js  > /dev/null &';
        cy.exec(
          `cd ../api && docker exec cacophony-api bash -lic "${command}"`
        ).then((result) => {
          waitForEmail("daily digest").then((email) => {
          expect(getEmailSubject(email)).to.equal(`Daily digest`);
          // expect(getEmailToAddress(email)).to.equal(getTestEmail(adminUser));
        });
        });
      });
    });
  }
});
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