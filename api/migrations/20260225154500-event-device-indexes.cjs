"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
      await queryInterface.sequelize.query(`CREATE INDEX CONCURRENTLY events_device_datetime_desc_idx ON "Events" ("DeviceId", "dateTime" DESC);`)
      await queryInterface.sequelize.query(`CREATE INDEX CONCURRENTLY detailsnapshots_type_id_idx ON "DetailSnapshots" (type, id);`);
      await queryInterface.sequelize.query(`CREATE INDEX CONCURRENTLY events_detail_device_datetime_desc_idx ON "Events" ("EventDetailId", "DeviceId", "dateTime" DESC);`);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS events_device_datetime_desc_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS detailsnapshots_type_id_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS events_detail_device_datetime_desc_idx`);
    },
};