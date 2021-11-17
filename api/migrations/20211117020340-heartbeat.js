"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "nextHeartbeat", Sequelize.DATE);
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Devices", "nextHeartbeat");
  },
};
