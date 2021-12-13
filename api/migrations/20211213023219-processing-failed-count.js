"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "processingFailedCount", {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    });
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Recordings", "processingFailedCount");
  },
};
