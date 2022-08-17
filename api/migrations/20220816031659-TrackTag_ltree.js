'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    const transaction = await queryInterface.sequelize.transaction();
    const paths = require('../label_paths.json');
    
    try {
      // add new column to TrackTag for ltree
      queryInterface.sequelize.query(`ALTER TABLE "TrackTags" ADD "path" ltree`, {transaction});
      queryInterface.sequelize.query(`UPDATE "TrackTags" SET "path" = :paths->what`, { transaction, replacements: {paths: JSON.parse(paths)} });
    } catch (e) {
      await transaction.rollback();
      throw e; 
    }
  },
  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // add new column to TrackTag for ltree
      queryInterface.sequelize.query(`alter table "TrackTags" drop IF EXISTS "path"`, {transaction});
    } catch (e) {
      await transaction.rollback();
      throw e; 
    }
  }
};
