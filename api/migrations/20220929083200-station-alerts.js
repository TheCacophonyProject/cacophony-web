"use strict";

const util = require("./util/util");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "Recordings",
      "uploader",
      {
        type: Sequelize.ENUM("user", "device"),
        defaultValue: null,
        allowNull: true,
      }
    );
    await queryInterface.addColumn(
      "Recordings",
      "uploaderId",
      {
        type: Sequelize.INTEGER,
        defaultValue: null,
        allowNull: true,
      }
    );
    await util.migrationAddBelongsTo(queryInterface, "Alerts", "Stations");
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn(
      "Recordings",
      "uploader"
    )
    await queryInterface.sequelize.query('drop type "enum_Recordings_uploader"');
    await queryInterface.removeColumn(
      "Recordings",
      "uploaderId"
    );
    await util.migrationRemoveBelongsTo(queryInterface, "Alerts", "Stations");
  },
};
