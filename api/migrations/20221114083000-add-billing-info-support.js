"use strict";

const util = require("./util/util");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Files", "fileSize", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment:
        "Size of file in bytes.",
    });
    await queryInterface.addColumn("GroupUsers", "owner", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment:
        "Set if this user owns the group, and will be responsible for any billing.",
    });
    await queryInterface.addColumn("GroupUsers", "removedAt", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      comment:
        "If this user is removed from the group, set this.  Actually remove users at the end of a billing cycle.",
    });
    await queryInterface.addColumn("GroupUsers", "transferredBytes", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment:
        "Increment this field every time a user streams a recording with the size in bytes transferred.",
    });
    await queryInterface.addColumn("GroupUsers", "transferredItems", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment:
        "Increment this field every time a user requests a recording.",
    });
    await queryInterface.addColumn("Users", "transferredBytes", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment:
        "Increment this field every time a super-user streams a recording from a group they don't belong to, with the size in bytes streamed.",
    });
    await queryInterface.addColumn("Users", "transferredItems", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment:
        "Increment this field every time a super-user requests a recording from a group they don't belong to.",
    });

    // Set all group admins as owners initially, since we don't actually know who owns each group in a billing sense.
    await queryInterface.sequelize.query(`update "GroupUsers" set "owner" = true where "admin" = true`);
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Files", "fileSize");
    await queryInterface.removeColumn("GroupUsers", "owner");
    await queryInterface.removeColumn("GroupUsers", "removedAt");
    await queryInterface.removeColumn("GroupUsers", "transferredBytes");
    await queryInterface.removeColumn("GroupUsers", "transferredItems");
    await queryInterface.removeColumn("Users", "transferredBytes");
    await queryInterface.removeColumn("Users", "transferredItems");
  },
};
