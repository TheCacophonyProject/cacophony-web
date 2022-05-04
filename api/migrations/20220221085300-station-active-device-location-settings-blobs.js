"use strict";

const util = require("./util/util");

module.exports = {
  up: async function(queryInterface, Sequelize) {
    // Stations get a start date, allowing null for now
    const stations = await queryInterface.describeTable("Stations");
    if (!stations.activeAt) {
      await queryInterface.addColumn("Stations", "activeAt", {
        type: Sequelize.DATE,
        comment: "Earliest date that this station was active from",
      });
    }
    await queryInterface.sequelize.query(
      `update "Stations" set "activeAt" = "createdAt" where "activeAt" is null`
    );

    // Now we no longer allow null.
    await queryInterface.changeColumn("Stations", "activeAt", {
      type: Sequelize.DATE,
      allowNull: false,
      comment: "Earliest date that this station was active from",
    });
    if (!stations.automatic) {
      await queryInterface.addColumn("Stations", "automatic", {
        type: Sequelize.BOOLEAN,
        comment: "Set if station is automatically created by recording upload in a new location",
        defaultValue: false,
        allowNull: false,
      });
    }
    if (!stations.needsRename) {
      await queryInterface.addColumn("Stations", "needsRename", {
        type: Sequelize.BOOLEAN,
        comment: "Set if station has an automatically generated name - this is a flag to let the UI know it needs renaming",
        defaultValue: false,
        allowNull: false,
      });
    }
    if (!stations.settings) {
      await queryInterface.addColumn("Stations", "settings", {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Group specific settings set for a station for all group members by the group admin",
      });
    }
    if (!stations.lastThermalRecordingTime) {
      await queryInterface.addColumn("Stations", "lastThermalRecordingTime", {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Last time that a thermal recording was received by this station",
      });
    }
    if (!stations.lastAudioRecordingTime) {
      await queryInterface.addColumn("Stations", "lastAudioRecordingTime", {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Last time that an audio recording was received by this station",
      });
    }
    if (!stations.lastUpdatedById) {
      await queryInterface.changeColumn("Stations", "lastUpdatedById", {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "UserId of the last user to edit this station, if any",
      });
    }

    // Users get the ability to store preferences
    const users = await queryInterface.describeTable("Users");
    if (!users.settings) {
      await queryInterface.addColumn("Users", "settings", {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "User preferences for various UI things",
      });
    }
    const groupUsers = await queryInterface.describeTable("GroupUsers");
    // Users get the ability to store group-scoped preferences
    if (!groupUsers.settings) {
      await queryInterface.addColumn("GroupUsers", "settings", {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "User preferences for this group",
      });
    }
    // Group admins get the ability to store group specific preferences for the whole group
    const groups = await queryInterface.describeTable("Groups");

    if (!groups.settings) {
      await queryInterface.addColumn("Groups", "settings", {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Group specific settings set for all group members by the group admin",
      });
    }

    if (groups.lastRecordingTime) {
      await queryInterface.removeColumn("Groups", "lastRecordingTime");
    }
    if (!groups.lastThermalRecordingTime) {
      await queryInterface.addColumn("Groups", "lastThermalRecordingTime", {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Last time that a thermal recording was received in this group",
      });
    }

    if (!groups.lastAudioRecordingTime) {
      await queryInterface.addColumn("Groups", "lastAudioRecordingTime", {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Last time that an audio recording was received in this group",
      });
    }

    const devices = await queryInterface.describeTable("Devices");
    if (!devices.uuid) {
      await queryInterface.addColumn("Devices", "uuid", {
        type: Sequelize.INTEGER,
        comment: "Immutable ID for this device.  Even if a device is re-registered, this should stay the same",
      });
    }

    // Now assign uuids for all current (active) devices - which can be initially derived from their deviceId.
    await queryInterface.sequelize.query(
      `update "Devices" set uuid = "Devices"."saltId"`
    );

    await queryInterface.createTable("DeviceHistory", {
      location: {
        type: Sequelize.GEOMETRY,
        comment: "Location of device at `fromDateTime` (if known)",
      },
      fromDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: "Earliest time that the device was known to be at this `location`",
      },
      setBy: {
        type: Sequelize.ENUM(
          "automatic",
          "user",
          "re-register",
          "register",
          "config"
        ),
        allowNull: false,
        comment: "Where the location of this device was set from - a recording upload, manually by the user, or via sidekick",
      },
      deviceName: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Purely for auditing/debugging purposes, store the device name at the time the location was logged",
      },
      uuid: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Immutable ID for this device.  Even if a device is re-registered, this should stay the same",
      },
      saltId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Salt id of this device at this time",
      },
      stationId: {
        type: Sequelize.INTEGER,
        comment: "Station id of this device history entry.  Note that there are currently no foreign key constraints here, so if a station is deleted this should be updated",
      },
    });

    // NOTE: Create stations and device history from Recordings, migration happens online via /scripts/create-device-history

    await util.migrationAddBelongsTo(
      queryInterface,
      "DeviceHistory",
      "Devices",
      "strict"
    );
    await util.migrationAddBelongsTo(
      queryInterface,
      "DeviceHistory",
      "Groups",
      "strict"
    );
  },

  down: async function(queryInterface, Sequelize) {
    // Delete automatically generated stations.
    await queryInterface.sequelize.query(
      `delete from  "Stations" where automatic = true`
    );

    const stations = await queryInterface.describeTable("Stations");
    if (stations.activeAt) {
      await queryInterface.removeColumn("Stations", "activeAt");
    }
    if (stations.automatic) {
      await queryInterface.removeColumn("Stations", "automatic");
    }
    if (stations.needsRename) {
      await queryInterface.removeColumn("Stations", "needsRename");
    }
    if (stations.lastThermalRecordingTime) {
      await queryInterface.removeColumn("Stations", "lastThermalRecordingTime");
    }
    if (stations.settings) {
      await queryInterface.removeColumn("Stations", "settings");
    }
    if (stations.lastAudioRecordingTime) {
      await queryInterface.removeColumn("Stations", "lastAudioRecordingTime");
    }

    await queryInterface.changeColumn("Stations", "lastUpdatedById", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.addColumn("Groups", "lastRecordingTime", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.removeColumn("Devices", "uuid");

    await util.migrationRemoveBelongsTo(
      queryInterface,
      "DeviceHistory",
      "Devices"
    );
    await util.migrationRemoveBelongsTo(
      queryInterface,
      "DeviceHistory",
      "Groups"
    );
    await queryInterface.dropTable("DeviceHistory");
  },
};
