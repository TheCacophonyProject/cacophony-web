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
    await queryInterface.addColumn("Stations", "settings", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "Group specific settings set for a station for all group members by the group admin"
    });
    await queryInterface.addColumn("Stations", "lastThermalRecordingTime", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "Last time that a thermal recording was received by this station",
    });
    await queryInterface.addColumn("Stations", "lastAudioRecordingTime", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "Last time that an audio recording was received by this station",
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

    await queryInterface.removeColumn("Groups", "lastRecordingTime");
    await queryInterface.addColumn("Groups", "lastThermalRecordingTime", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "Last time that a thermal recording was received in this group",
    });

    await queryInterface.addColumn("Groups", "lastAudioRecordingTime", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "Last time that an audio recording was received in this group",
    });

    await queryInterface.addColumn("Devices", "uuid", {
      type: Sequelize.INTEGER,
      comment: "Immutable ID for this device.  Even if a device is re-registered, this should stay the same"
    });

    // FIXME(ManageStations): Now assign uuids for all current devices - which can be initially derived from their deviceId.

    await queryInterface.createTable("DeviceHistory", {
      location: {
        type: Sequelize.GEOMETRY,
        comment: "Location of device at `fromDateTime` (if known)"
      },
      fromDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: "Earliest time that the device was known to be at this `location`",
      },
      setBy: {
        type: Sequelize.ENUM('automatic', 'user', 'reregister', 'register', 'config'),
        allowNull: false,
        comment: "Where the location of this device was set from - a recording upload, manually by the user, or via sidekick"
      },
      deviceName: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Purely for auditing/debugging purposes, store the device name at the time the location was logged"
      },
      uuid: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Immutable ID for this device.  Even if a device is re-registered, this should stay the same"
      },
      saltId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Salt id of this device at this time"
      }
    });

    // TODO(ManageStations): Create stations and device history from Recordings, test against real DB dumps

    await util.migrationAddBelongsTo(queryInterface, "DeviceHistory", "Devices", "strict");
    await util.migrationAddBelongsTo(queryInterface, "DeviceHistory", "Groups", "strict");
  },

  down: async function (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Stations", "activeAt");
    await queryInterface.removeColumn("Stations", "automatic");
    await queryInterface.removeColumn("Stations", "settings");
    await queryInterface.removeColumn("Stations", "lastThermalRecordingTime");
    await queryInterface.removeColumn("Stations", "lastAudioRecordingTime");

    await queryInterface.changeColumn("Stations", "lastUpdatedById", {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    await queryInterface.removeColumn("Users", "settings");
    await queryInterface.removeColumn("GroupUsers", "settings");
    await queryInterface.removeColumn("Groups", "settings");
    await queryInterface.removeColumn("Groups", "lastThermalRecordingTime");
    await queryInterface.removeColumn("Groups", "lastAudioRecordingTime");
    await queryInterface.addColumn("Groups", "lastRecordingTime", {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.removeColumn("Devices", "uuid");

    await util.migrationRemoveBelongsTo(queryInterface, "DeviceHistory", "Devices");
    await util.migrationRemoveBelongsTo(queryInterface, "DeviceHistory", "Groups");
    await queryInterface.dropTable("DeviceHistory");
  },
};
