"use strict";

const util = require("./util/util");

module.exports = {
  up: async function (queryInterface, Sequelize) {
    // Stations get a start date
    await queryInterface.addColumn("Stations", "activeAt", {
      type: Sequelize.DATE,
      allowNull: false,
      comment: "Earliest date that this station was active from"
    });
    await queryInterface.addColumn("Stations", "automatic", {
      type: Sequelize.BOOLEAN,
      comment: "Set if station is automatically created by recording upload in a new location",
      defaultValue: false,
      allowNull: false,
    });
    await queryInterface.changeColumn("Stations", "lastUpdatedById", {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: "UserId of the last user to edit this station, if any"
    });

    // Users get the ability to store preferences
    await queryInterface.addColumn("Users", "settings", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "User preferences for various UI things"
    });
    // Users get the ability to store group-scoped preferences
    await queryInterface.addColumn("GroupUsers", "settings", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "User preferences for this group"
    });
    // Group admins get the ability to store group specific preferences for the whole group
    await queryInterface.addColumn("Groups", "settings", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "Group specific settings set for all group members by the group admin"
    });

    await queryInterface.createTable("DeviceLocations", {
      location: {
        type: Sequelize.GEOMETRY,
        allowNull: false,
        comment: "Location of device at `fromDateTime`"
      },
      fromDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: "Earliest time that the device was known to be at this `location`"
      },
      setBy: {
        type: Sequelize.ENUM('automatic', 'user', 'sidekick'),
        allowNull: false,
        comment: "Where the location of this device was set from - a recording upload, manually by the user, or via sidekick"
      }
    });
    await util.migrationAddBelongsTo(queryInterface, "DeviceLocations", "Devices", "strict");
  },

  down: async function (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Stations", "activeAt");
    await queryInterface.removeColumn("Stations", "automatic");

    await queryInterface.changeColumn("Stations", "lastUpdatedById", {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    await queryInterface.removeColumn("Users", "settings");
    await queryInterface.removeColumn("GroupUsers", "settings");
    await queryInterface.removeColumn("Groups", "settings");

    await util.migrationRemoveBelongsTo(queryInterface, "DeviceLocations", "Devices");
    await queryInterface.dropTable("DeviceLocations");
  },
};
