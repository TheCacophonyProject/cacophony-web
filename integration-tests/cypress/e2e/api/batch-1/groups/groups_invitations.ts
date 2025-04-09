import { HttpStatusCode } from "@typedefs/api/consts";
import { getTestEmail, getTestName } from "@commands/names";
import { ApiGroupUserResponse } from "@typedefs/api/group";
import {
  ACCEPT_INVITE_PREFIX,
  extractTokenStartingWith,
  startMailServerStub,
  waitForEmail,
} from "@commands/emailUtils";

const ADMIN = true;
const OWNER = true;
const NOT_ADMIN = false;
const NOT_OWNER = false;
describe("Groups - user invitations", () => {
  //Do not run against a live server as we don't have a stubbed email server
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(startMailServerStub);
    it("An admin user can invite a non-browse-member to sign up for an account and join a group", () => {
      const groupName = "inviteGroup1";
      const adminName = "inviteGroupAdmin1";
      const invitee = "non-member1";
      let group;
      let expectedAdminUser: ApiGroupUserResponse;
      const expectedTestUser: ApiGroupUserResponse = {
        userName: getTestEmail(invitee),
        pending: "invited",
        admin: false,
        owner: false,
      };

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: true,
            owner: true,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(adminName, invitee, groupName);
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );
        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using same email address they were invited with",
        );
        cy.apiUserAdd(invitee, "_foobar1", getTestEmail(invitee)).then(
          (userId) => {
            cy.log("Accept invite by signing up with the invite token");
            cy.apiGroupUserAcceptInvite(invitee, groupName, token);

            cy.log(
              "Check that the user is now listed as a non pending group member with normal permissions",
            );
            cy.apiGroupUsersCheck(adminName, groupName, [
              expectedAdminUser,
              {
                id: userId,
                userName: getTestName(invitee),
                admin: NOT_ADMIN,
                owner: NOT_OWNER,
              },
            ]);
          },
        );
      });
    });

    it("A non-browse-member can sign up with a different email address to that they were invited with, and still use the token", () => {
      const groupName = "inviteGroup2";
      const adminName = "inviteGroupAdmin2";
      const invitee = "non-member2";
      const existingMember = "existing-member2";
      let expectedAdminUser: ApiGroupUserResponse;
      let group;
      const expectedTestUser: ApiGroupUserResponse = {
        userName: getTestEmail(invitee),
        pending: "invited",
        admin: false,
        owner: false,
      };

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: true,
            owner: true,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(adminName, invitee, groupName);
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );

        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using a different email address than they were invited with",
        );
        cy.apiUserAdd(
          existingMember,
          "_foobar1",
          getTestEmail(existingMember),
        ).then((userId) => {
          cy.log("Accept invite by signing up with the invite token");
          const useExistingUser = true;
          cy.apiGroupUserAcceptInvite(
            existingMember,
            groupName,
            token,
            useExistingUser,
          );

          cy.log(
            "Check that the user is now listed as a non pending group member with normal permissions",
          );
          cy.apiGroupUsersCheck(adminName, groupName, [
            expectedAdminUser,
            {
              id: userId,
              userName: getTestName(existingMember),
              admin: false,
              owner: false,
            },
          ]);
        });
      });
    });

    it("An admin user can invite a non-browse-member to sign up and join a group as an admin", () => {
      const groupName = "inviteGroup3";
      const adminName = "inviteGroupAdmin3";
      const invitee = "non-member3";
      let group;
      let expectedAdminUser: ApiGroupUserResponse;
      const expectedTestUser: ApiGroupUserResponse = {
        userName: getTestEmail(invitee),
        pending: "invited",
        admin: ADMIN,
        owner: NOT_OWNER,
      };

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: ADMIN,
            owner: OWNER,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(adminName, invitee, groupName, ADMIN);
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );
        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users with admin permissions",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using same email address they were invited with",
        );
        cy.apiUserAdd(invitee, "_foobar1", getTestEmail(invitee)).then(
          (userId) => {
            cy.log("Accept invite by signing up with the invite token");
            cy.apiGroupUserAcceptInvite(invitee, groupName, token);

            cy.log(
              "Check that the user is now listed as a non pending group member with admin permissions",
            );
            cy.apiGroupUsersCheck(adminName, groupName, [
              expectedAdminUser,
              {
                id: userId,
                userName: getTestName(invitee),
                admin: ADMIN,
                owner: NOT_OWNER,
              },
            ]);
          },
        );
      });
    });

    it("An admin user can invite a non-browse-member to sign up and join a group as an owner", () => {
      const groupName = "inviteGroup4";
      const adminName = "inviteGroupAdmin4";
      const invitee = "non-member4";
      let group;
      let expectedAdminUser: ApiGroupUserResponse;
      const expectedTestUser: ApiGroupUserResponse = {
        userName: getTestEmail(invitee),
        pending: "invited",
        admin: NOT_ADMIN,
        owner: OWNER,
      };

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: ADMIN,
            owner: OWNER,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(
            adminName,
            invitee,
            groupName,
            NOT_ADMIN,
            OWNER,
          );
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );
        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users with owner permissions",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using same email address they were invited with",
        );
        cy.apiUserAdd(invitee, "_foobar1", getTestEmail(invitee)).then(
          (userId) => {
            cy.log("Accept invite by signing up with the invite token");
            cy.apiGroupUserAcceptInvite(invitee, groupName, token);

            cy.log(
              "Check that the user is now listed as a non pending group member with owner permissions",
            );
            cy.apiGroupUsersCheck(adminName, groupName, [
              expectedAdminUser,
              {
                id: userId,
                userName: getTestName(invitee),
                admin: NOT_ADMIN,
                owner: OWNER,
              },
            ]);
          },
        );
      });
    });

    it("An admin user can invite another browse-member to join a group", () => {
      const groupName = "inviteGroup5";
      const adminName = "inviteGroupAdmin5";
      const existingMember = "existing-member5";
      let group;
      let expectedAdminUser: ApiGroupUserResponse;
      let expectedTestUser: ApiGroupUserResponse;
      cy.apiUserAdd(
        existingMember,
        "_foobar1",
        getTestEmail(existingMember),
      ).then((userId) => {
        expectedTestUser = {
          userName: getTestName(existingMember),
          id: userId,
          pending: "invited",
          admin: NOT_ADMIN,
          owner: NOT_OWNER,
        };
      });

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: ADMIN,
            owner: OWNER,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(
            adminName,
            existingMember,
            groupName,
            NOT_ADMIN,
            NOT_OWNER,
          );
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );
        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users with default permissions",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using same email address they were invited with",
        );
        cy.log("Accept invite by signing up with the invite token");
        cy.apiGroupUserAcceptInvite(existingMember, groupName, token);
        cy.log(
          "Check that the user is now listed as a non pending group member with default permissions",
        );
        const expectedUser = { ...expectedTestUser };
        delete expectedUser.pending;
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedUser,
        ]);
      });
    });

    it("An admin user can invite another browse-member to join a group as an admin", () => {
      const groupName = "inviteGroup6";
      const adminName = "inviteGroupAdmin6";
      const existingMember = "existing-member6";
      let group;
      let expectedAdminUser: ApiGroupUserResponse;
      let expectedTestUser: ApiGroupUserResponse;
      cy.apiUserAdd(
        existingMember,
        "_foobar1",
        getTestEmail(existingMember),
      ).then((userId) => {
        expectedTestUser = {
          userName: getTestName(existingMember),
          id: userId,
          pending: "invited",
          admin: ADMIN,
          owner: NOT_OWNER,
        };
      });

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: ADMIN,
            owner: OWNER,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(
            adminName,
            existingMember,
            groupName,
            ADMIN,
            NOT_OWNER,
          );
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );
        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users with admin permissions",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using same email address they were invited with",
        );
        cy.log("Accept invite by signing up with the invite token");
        cy.apiGroupUserAcceptInvite(existingMember, groupName, token);
        cy.log(
          "Check that the user is now listed as a non pending group member with admin permissions",
        );
        const expectedUser = { ...expectedTestUser };
        delete expectedUser.pending;
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedUser,
        ]);
      });
    });

    it("An admin user can invite another browse-member to join a group as an owner", () => {
      const groupName = "inviteGroup7";
      const adminName = "inviteGroupAdmin7";
      const existingMember = "existing-member7";
      let group;
      let expectedAdminUser: ApiGroupUserResponse;
      let expectedTestUser: ApiGroupUserResponse;
      cy.apiUserAdd(
        existingMember,
        "_foobar1",
        getTestEmail(existingMember),
      ).then((userId) => {
        expectedTestUser = {
          userName: getTestName(existingMember),
          id: userId,
          pending: "invited",
          admin: NOT_ADMIN,
          owner: OWNER,
        };
      });

      cy.testCreateUserAndGroup(adminName, groupName).then(
        ({ userId, groupId }) => {
          group = groupId;
          expectedAdminUser = {
            userName: getTestName(adminName),
            id: userId,
            admin: ADMIN,
            owner: OWNER,
          };
          cy.log("Invite a user");
          cy.apiGroupUserInvite(
            adminName,
            existingMember,
            groupName,
            NOT_ADMIN,
            OWNER,
          );
        },
      );

      waitForEmail("invite").then((email) => {
        const { payload, token } = extractTokenStartingWith(
          email,
          ACCEPT_INVITE_PREFIX,
        );
        expect(payload.group).to.equal(group);
        cy.log(
          "Check that we can see the user email listed as pending when we list group users with owner permissions",
        );
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedTestUser,
        ]);
        cy.log(
          "User signs up to browse using same email address they were invited with",
        );
        cy.log("Accept invite by signing up with the invite token");
        cy.apiGroupUserAcceptInvite(existingMember, groupName, token);
        cy.log(
          "Check that the user is now listed as a non pending group member with owner permissions",
        );
        const expectedUser = { ...expectedTestUser };
        delete expectedUser.pending;
        cy.apiGroupUsersCheck(adminName, groupName, [
          expectedAdminUser,
          expectedUser,
        ]);
      });
    });

    it("Re-inviting an existing member of the group should fail", () => {
      const groupName = "inviteGroup8";
      const adminName = "inviteGroupAdmin8";
      const existingUser = "existing-member8";
      cy.testCreateUserAndGroup(adminName, groupName).then(() => {
        cy.apiUserAdd(
          existingUser,
          "_foobar1",
          getTestEmail(existingUser),
        ).then(() => {
          cy.apiGroupUserAdd(adminName, existingUser, groupName);
          cy.log("Invite an existing user of the group");
          cy.apiGroupUserInvite(
            adminName,
            existingUser,
            groupName,
            false,
            false,
            false,
            HttpStatusCode.Unprocessable,
          );
        });
      });
    });

    it("An non-admin group-member user cannot invite anyone join the group", () => {
      const groupName = "inviteGroup9";
      const adminName = "inviteGroupAdmin9";
      const user = "existing-member9";
      const otherUser = "other-user";
      let expectedAdminUser: ApiGroupUserResponse;
      let expectedTestUser: ApiGroupUserResponse;
      cy.testCreateUserAndGroup(adminName, groupName).then(({ userId }) => {
        expectedAdminUser = {
          userName: getTestName(adminName),
          id: userId,
          admin: ADMIN,
          owner: OWNER,
        };
        cy.apiUserAdd(user, "_foobar1", getTestEmail(user)).then((userId) => {
          expectedTestUser = {
            userName: getTestName(user),
            id: userId,
            admin: NOT_ADMIN,
            owner: NOT_OWNER,
          };
          cy.log("Add regular user to group");
          cy.apiGroupUserAdd(adminName, user, groupName);
          cy.apiGroupUsersCheck(adminName, groupName, [
            expectedAdminUser,
            expectedTestUser,
          ]);

          cy.log("Try to invite someone to the group");
          cy.apiGroupUserInvite(
            user,
            otherUser,
            groupName,
            false,
            false,
            false,
            HttpStatusCode.Forbidden,
          );
        });
      });
    });

    it.skip("Admin users can revoke invitations before they have been accepted", () => {
      // TODO, or is this getting too fancy?
      // Should pending invitations that expire just be removed somehow?
    });
  }
});
