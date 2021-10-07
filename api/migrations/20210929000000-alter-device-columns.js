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
      queryInterface.addColumn("Devices", "kind", {
        type: Sequelize.ENUM,
        values: ["audio", "thermal", "unknown"],
        defaultValue: "unknown",
      }),
    ]);
  },

  down: async function (queryInterface, Sequelize) {
    await Promise.all([
      queryInterface.removeColumn("Devices", "kind"),
      queryInterface.removeColumn("Devices", "location"),
      queryInterface.removeColumn("Devices", "lastConnectionTime"),
    ]);
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
