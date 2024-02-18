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
  waitForEmails,
} from "@commands/emailUtils";

import { getTestEmail, getTestName } from "@commands/names";
import { HttpStatusCode, UserGlobalPermission } from "@typedefs/api/consts";
import { LATEST_END_USER_AGREEMENT } from "@commands/constants";
import { getCreds, makeAuthorizedRequestWithStatus, v1ApiPath} from "@commands/server";
import { uniqueName } from "@commands/testUtils";
import { apiAddUserSettings } from "@commands/api/user";


describe("Digest emails for different user preferences", () => {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(() => {
      startMailServerStub();
    });

    beforeEach(() => {
      clearMailServerLog();
    });

    it("A  daily digest email should be sent to a user with emailNotifications.dailyDigest set to true", () => {
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add user settings");

      const settings = {
        "settings": {
          "emailNotifications": {
              "dailyDigest": true,
          }
        }
      };

      cy.apiAddUserSettings(
        adminUser,
        settings,
        200
      ).then((response: any) => {
        clearMailServerLog();
        cy.log("User settings have been added, with dailyDigest set to true");
        const command = 'cd api && node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/digest-emails.js  > /dev/null &';
        cy.exec(
          `cd ../api && docker exec cacophony-api bash -lic "${command}"`
        ).then(() => {
          waitForEmail("daily-digest").then((email) => {
            expect(getEmailSubject(email)).to.equal(`Daily digest`);
          });
        });
      });

      const dailyDigestFalse = { 
        "settings": {
          "emailNotifications": {
              "dailyDigest": false,
          }
        }
      };

      cy.apiAddUserSettings(
        adminUser,
        dailyDigestFalse,
        200
      ).then(() => {
        cy.log("dailyDigest has been set to false");
      });
    });

    it("A daily digest email should not be sent to a user with emailNotifications.dailyDigest set to false", () => {
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add user settings");

      const settings = {
        "settings": {
          "emailNotifications": {
              "dailyDigest": false,
          }
        }
      };

      cy.apiAddUserSettings(
        adminUser,
        settings,
        200
      ).then((response: any) => {
        clearMailServerLog();
        cy.log("User settings have been added, with dailyDigest set to true");
        const command = 'cd api && node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/digest-emails.js  > /dev/null &';
        cy.exec(
          `cd ../api && docker exec cacophony-api bash -lic "${command}"`
        ).then(() => {
          pumpSmtp();
          waitForEmail("daily-digest").then((email) => {
            expect(email).to.not.contain("Daily digest");
          });
        });
      });
    });

    it("A  weekly digest email should be sent to a user with emailNotifications.weeklyDigest set to true", () => {
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add user settings");

      const settings = {
        "settings": {
          "emailNotifications": {
              "weeklyDigest": true,
          }
        }
      };

      cy.apiAddUserSettings(
        adminUser,
        settings,
        200
      ).then((response: any) => {
        clearMailServerLog();
        cy.log("User settings have been added, with weeklyDigest set to true");
        const command = 'cd api && node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/digest-emails.js  > /dev/null &';
        cy.exec(
          `cd ../api && docker exec cacophony-api bash -lic "${command}"`
        ).then(() => {
          waitForEmail("weekly-digest").then((email) => {
            expect(getEmailSubject(email)).to.equal(`Weekly digest`);
          });
        });
      });

      const dailyDigestFalse = { 
        "settings": {
          "emailNotifications": {
              "weeklyDigest": false,
          }
        }
      };

      cy.apiAddUserSettings(
        adminUser,
        dailyDigestFalse,
        200
      ).then(() => {
        cy.log("weeklyDigest has been set to false");
      });
    });

    it("A weekly digest email should not be sent to a user with emailNotifications.weeklyDigest set to false", () => {
      const adminUser = uniqueName("admin");
      const group = uniqueName("group");
      cy.log("Create a group to add new user to");
      cy.testCreateUserAndGroup(adminUser, group);
      cy.log("Add user settings");

      const settings = {
        "settings": {
          "emailNotifications": {
              "weeklyDigest": false,
          }
        }
      };

      cy.apiAddUserSettings(
        adminUser,
        settings,
        200
      ).then((response: any) => {
        clearMailServerLog();
        cy.log("User settings have been added, with weeklyDigest set to true");
        const command = 'cd api && node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/digest-emails.js  > /dev/null &';
        cy.exec(
          `cd ../api && docker exec cacophony-api bash -lic "${command}"`
        ).then(() => {
          pumpSmtp();
          waitForEmail("weekly-digest").then((email) => {
            expect(email).to.not.contain("Weekly digest");
          });
        });
      });
    });

    // it.only("A  daily digest email should be sent to two users with emailNotifications.dailyDigest is set to true for two users", () => {
    //   const adminUser1 = uniqueName("admin");
    //   const adminUser2 = uniqueName("admin");
    //   const group1 = uniqueName("group");
    //   const group2 = uniqueName("group");
    //   cy.log("Create a group to add new user to");
    //   cy.testCreateUserAndGroup(adminUser1, group1);
    //   cy.testCreateUserAndGroup(adminUser2, group2);
    //   cy.log("Add user settings");

    //   const settings = {
    //     "settings": {
    //       "emailNotifications": {
    //           "dailyDigest": true,
    //       }
    //     }
    //   };

    //   cy.apiAddUserSettings(
    //     adminUser1,
    //     settings,
    //     200
    //   );
      
    //   cy.apiAddUserSettings(
    //     adminUser2,
    //     settings,
    //     200
    //   ).then((response: any) => {
    //     clearMailServerLog();
    //     cy.log("User settings have been added, with dailyDigest set to true");
    //     const command = 'cd api && node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/digest-emails.js  > /dev/null &';
    //     cy.exec(
    //       `cd ../api && docker exec cacophony-api bash -lic "${command}"`
    //     ).then(() => {
    //       waitForEmails("daily-digest").then((emails) => {
    //         emails.forEach((email) => {
    //           cy.log(email);
    //         });           
    //     });
    //   });

    //   const dailyDigestFalse = { 
    //     "settings": {
    //       "emailNotifications": {
    //           "dailyDigest": false,
    //       }
    //     }
    //   };

    //   cy.apiAddUserSettings(
    //     adminUser1,
    //     dailyDigestFalse,
    //     200
    //   ).then(() => {
    //     cy.log("dailyDigest has been set to false");
    //   });

    //   cy.apiAddUserSettings(
    //     adminUser2,
    //     dailyDigestFalse,
    //     200
    //   ).then(() => {
    //     cy.log("dailyDigest has been set to false");
    //   });
    // });
  };
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