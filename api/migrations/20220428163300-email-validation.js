"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    // Stations get a start date, allowing null for now
    await queryInterface.addColumn("Users", "emailConfirmed", {
      type: Sequelize.BOOLEAN,
      comment: "Set if user has confirmed their email address via a sent link",
      defaultValue: false,
      allowNull: false,
    });
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Users", "emailConfirmed");
  },
};
