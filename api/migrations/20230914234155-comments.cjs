"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add a comment column to the Tag table
    await queryInterface.addColumn("Tags", "comment", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, _Sequelize) {
    // Remove the comment column from the Tag table
    await queryInterface.removeColumn("Tags", "comment");
  },
};
