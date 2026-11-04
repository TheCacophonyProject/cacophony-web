"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS public.events_datetime_idx`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS public.label_idx`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS public.idx_tracktags_archivedat`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS public."tracks_archivedat_idx"`)
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS public."recordings_recording_date_time_id"`)
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS public."recordings_public"`)
  },

  async down(queryInterface, Sequelize) {
    // Dropped indexes were unused, so they are intentionally not recreated.
  },
};
