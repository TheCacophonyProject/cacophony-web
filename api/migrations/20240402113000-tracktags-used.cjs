"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "TrackTags" ADD "used" boolean not null default false`,
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS tracktags_used_idx ON "TrackTags" USING btree (used);`
    );
    await queryInterface.sequelize.query(`
      update "TrackTags" set used = true 
      where (
        automatic = true
        AND data #>> '{name}' = 'Master'
      )
      OR automatic = false`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "TrackTags" DROP IF EXISTS "used"`
    );
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS tracktags_used_idx
    `);
  }
};
