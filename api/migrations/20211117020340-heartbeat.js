"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "heartBeat", Sequelize.DATE);
    await queryInterface.addColumn("Devices", "nextHeartBeat", Sequelize.DATE);
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Devices", "heartBeat");
    await queryInterface.removeColumn("Devices", "nextHeartBeat");
  },
};
