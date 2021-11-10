"use strict";
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await Promise.all([
      queryInterface.removeColumn("Devices", "location"),
      queryInterface.removeColumn("Devices", "lastConnectionTime"),
    ]);
    await Promise.all([
      queryInterface.removeColumn("Devices", "currentConfig"),
      queryInterface.removeColumn("Devices", "newConfig"),
      queryInterface.addColumn("Devices", "location", Sequelize.GEOMETRY),
      queryInterface.addColumn("Devices", "lastConnectionTime", Sequelize.DATE),
      queryInterface.addColumn("Devices", "lastRecordingTime", Sequelize.DATE),
      queryInterface.addColumn("Groups", "lastRecordingTime", Sequelize.DATE),
      queryInterface.addColumn("Devices", "kind", {
        type: Sequelize.ENUM,
        values: ["audio", "thermal", "unknown"],
        defaultValue: "unknown",
      }),
      queryInterface.addColumn("Recordings", "fileSize", Sequelize.INTEGER),
      queryInterface.addColumn("Recordings", "rawFileSize", Sequelize.INTEGER),
    ]);
  },

  down: async function (queryInterface, Sequelize) {
    await Promise.all([
      queryInterface.removeColumn("Devices", "kind"),
      queryInterface.removeColumn("Devices", "location"),
      queryInterface.removeColumn("Devices", "lastConnectionTime"),
      queryInterface.removeColumn("Devices", "lastRecordingTime"),
      queryInterface.removeColumn("Groups", "lastRecordingTime"),
      queryInterface.removeColumn("Recordings", "fileSize", Sequelize.INTEGER),
      queryInterface.removeColumn("Recordings", "rawFileSize", Sequelize.INTEGER),
    ]);
    await queryInterface.sequelize.query(
      'drop type "enum_Devices_kind"'
    );
    await Promise.all([
      queryInterface.addColumn("Devices", "currentConfig", Sequelize.JSONB),
      queryInterface.addColumn("Devices", "newConfig", Sequelize.JSONB),
      queryInterface.addColumn("Devices", "location", Sequelize.STRING),
      queryInterface.addColumn(
        "Devices",
        "lastConnectionTime",
        Sequelize.STRING
      ),
    ]);
  },
};
