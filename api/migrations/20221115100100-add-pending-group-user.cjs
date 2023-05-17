

const util =  require("./util/util.cjs");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("GroupUsers", "pending", {
      type: Sequelize.ENUM("requested", "invited"),
      allowNull: true,
      defaultValue: null,
      comment:
        "If this user has been invited to the group, but hasn't accepted, set to invited.  If the user has requested membership, set to requested",
    });
    await queryInterface.createTable("GroupInvites", {
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Email address that the invitation was sent to.  User may sign up with a different email address though?"
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: "When this invitation was created.",
      },
      invitedBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "UserId of the inviting user.",
      },
      owner: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          "Set if this user will own the group, and will be responsible for any billing.",
      },
      admin: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          "Set if this user will become a group admin.",
      }
    });
    await util.addSerial(queryInterface, "GroupInvites");
    await util.migrationAddBelongsTo(
      queryInterface,
      "GroupInvites",
      "Groups",
      "strict"
    );

    await queryInterface.addColumn("DeviceHistory", "settings", {
      allowNull: true,
      defaultValue: null,
      type: Sequelize.JSONB,
      comment: "A place to put device settings that apply only while the device is in a particular location at a particular time."
    });
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.removeColumn("DeviceHistory", "settings");
    await queryInterface.removeColumn("GroupUsers", "pending");
    await queryInterface.sequelize.query(
      'drop type "enum_GroupUsers_pending"'
    );
    await util.migrationRemoveBelongsTo(
      queryInterface,
      "GroupInvites",
      "Groups"
    );
    await queryInterface.dropTable("GroupInvites");
  },
};
