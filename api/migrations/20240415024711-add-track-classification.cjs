'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Tracks", "classify", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Tracks", "classify");
  },
};
