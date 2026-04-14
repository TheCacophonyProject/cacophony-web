"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(`create index concurrently if not exists recordings_station_type_not_deleted_datetime_idx
            on "Recordings" ("StationId", "type", "recordingDateTime")
            where "deletedAt" is null;`)
        await queryInterface.sequelize.query(`create index concurrently if not exists recordings_device_type_not_deleted_datetime_idx
            on "Recordings" ("DeviceId", "type", "recordingDateTime")
            where "deletedAt" is null;`);
        await queryInterface.sequelize.query(`create index concurrently if not exists recordings_group_type_not_deleted_datetime_idx
            on "Recordings" ("GroupId", "type", "recordingDateTime")
            where "deletedAt" is null;`);

        await queryInterface.sequelize.query(`create index concurrently if not exists alerts_station_id_idx
            on "Alerts" ("StationId")
            where "StationId" is not null;`);

        await queryInterface.sequelize.query(`create index concurrently if not exists alerts_device_id_idx
            on "Alerts" ("DeviceId")
            where "DeviceId" is not null;`);

        await queryInterface.sequelize.query(`create index concurrently if not exists recordings_file_hash_device_not_deleted_idx
            on "Recordings" ("DeviceId", "rawFileHash")
            where "deletedAt" is null;`);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS recordings_station_type_not_deleted_datetime_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS recordings_device_type_not_deleted_datetime_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS recordings_group_type_not_deleted_datetime_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS recordings_file_hash_device_not_deleted_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS alerts_station_id_idx`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS alerts_device_id_idx`);
    },
};