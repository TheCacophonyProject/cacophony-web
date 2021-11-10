"use strict";
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "deletedAt", Sequelize.DATE);
    await queryInterface.addColumn("Recordings", "deletedBy", Sequelize.INTEGER);
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Recordings", "deletedAt");
    await queryInterface.removeColumn("Recordings", "deletedBy");
  },
};
