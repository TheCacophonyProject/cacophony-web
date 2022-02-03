"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Tracks", "filtered", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Tracks", "filtered");
  },
};
