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
    const paths = require('../classifications/label_paths.json');
    
    try {
      await queryInterface.sequelize.query(`ALTER TABLE "TrackTags" ADD "path" ltree`, {transaction});
      await queryInterface.sequelize.query(`
      UPDATE "TrackTags" SET
      "path" = text2ltree(:paths::jsonb ->> what)
      WHERE :paths::jsonb ? what
      `, { transaction, replacements: {paths: JSON.stringify(paths)} });
      await queryInterface.sequelize.query(`CREATE INDEX "label_idx" ON "TrackTags" USING BTREE (path)`, {transaction});
      await transaction.commit();
    } catch (e) {
      console.log(e);
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
      await queryInterface.sequelize.query(`ALTER TABLE "TrackTags" DROP IF EXISTS "path"`, {transaction});
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "label_idx" `, {transaction});
      await transaction.commit();
    } catch (e) {
      console.log(e);
      await transaction.rollback();
      throw e; 
    }
  }
};
