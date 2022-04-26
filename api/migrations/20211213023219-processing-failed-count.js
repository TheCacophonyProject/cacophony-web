"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "processingFailedCount", {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    });
    await queryInterface.addColumn(
      "Recordings",
      "currentStateStartTime",
      Sequelize.DATE
    );
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Recordings", "processingFailedCount");
    await queryInterface.removeColumn("Recordings", "currentStateStartTime");
  },
};
