"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    try {
      const transaction = await queryInterface.sequelize.transaction();
      // add new column boolean "redacted" to Recording
      const recordings = await queryInterface.describeTable("Recordings");
      if (!recordings.redacted) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "Recordings" ADD COLUMN "redacted" boolean DEFAULT false`,
          { transaction }
        );
      }
      await transaction.commit();
    } catch (e) {
      console.log(e);
    }
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    try {
      const transaction = await queryInterface.sequelize.transaction();
      // remove new column boolean "redacted" from Recording
      await queryInterface.sequelize.query(
        `ALTER TABLE "Recordings" DROP COLUMN "redacted"`,
        { transaction }
      );
      await transaction.commit();
    } catch (e) {
      console.log(e);
    }
  },
};
