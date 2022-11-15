describe("Groups - user invitations", () => {

    it("An admin user can invite a non-browse-member to sign up for an account and join a group", () => {
        cy.log("Invite a user");

        cy.log("Check that we can see the user email listed as pending when we list group users");

        cy.log("Get invite token for already created invite");

        cy.log("Accept invite by redeeming invite token");

        cy.log("Check that the user is now listed as a non pending group member with normal permissions");
    });

    it("An admin user can invite a non-browse-member to sign up and join a group as an admin", () => {
        cy.log("Invite a user");

        cy.log("Check that we can see the user email listed as pending when we list group users");

        cy.log("Get invite token for already created invite");

        cy.log("Accept invite by redeeming invite token");

        cy.log("Check that the user is now listed as a non pending group member with admin permissions");
    });

    it("An admin user can invite a non-browse-member to sign up and join a group as an owner", () => {
        cy.log("Invite a user");

        cy.log("Check that we can see the user email listed as pending when we list group users");

        cy.log("Get invite token for already created invite");

        cy.log("Accept invite by redeeming invite token");

        cy.log("Check that the user is now listed as a non pending group member with owner permissions");
    });

    it("An admin user can invite another browse-member to join a group", () => {
        cy.log("Invite an existing user");

        cy.log("Check that we can see the user id listed as pending when we list group users");

        cy.log("Get invite token for already created invite");

        cy.log("Accept invite by redeeming invite token");

        cy.log("Check that the user is now listed as a non pending group member with normal permissions");
    });

    it("An admin user can invite another browse-member to join a group as an admin", () => {
        cy.log("Invite an existing user");

        cy.log("Check that we can see the user id listed as pending when we list group users");

        cy.log("Get invite token for already created invite");

        cy.log("Accept invite by redeeming invite token");

        cy.log("Check that the user is now listed as a non pending group member with admin permissions");
    });

    it("An admin user can invite another browse-member to join a group as an owner", () => {
        cy.log("Invite an existing user");

        cy.log("Check that we can see the user id listed as pending when we list group users");

        cy.log("Get invite token for already created invite");

        cy.log("Accept invite by redeeming invite token");

        cy.log("Check that the user is now listed as a non pending group member with owner permissions");
    });

    it("Admin users can revoke invitations before they have been accepted", () => {
        // TODO, or is this getting too fancy?

        // Should pending invitations that expire just be removed somehow?
    });

});
