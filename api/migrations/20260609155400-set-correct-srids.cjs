"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        for (const table of ["Recordings", "DeviceHistory", "Devices", "Stations"]) {
            await queryInterface.sequelize.query(`
                ALTER TABLE "${table}"
                ALTER COLUMN location TYPE geometry(Geometry, 4326)
                USING ST_SetSRID(location, 4326);
            `);
        }
        await queryInterface.removeColumn("Devices", "kind");
        await queryInterface.removeColumn("Devices", "heartbeat");
        await queryInterface.removeColumn("Devices", "nextHeartbeat");
        await queryInterface.addColumn("Tracks", "thumbnailScore", {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null,
        });
    },

    async down(queryInterface   , Sequelize) {
        await queryInterface.addColumn("Devices", "heartbeat", Sequelize.DATE);
        await queryInterface.addColumn("Devices", "nextHeartbeat", Sequelize.DATE);
        await queryInterface.addColumn("Devices", "kind", {
            type: Sequelize.ENUM,
            values: ["audio", "thermal", "unknown"],
            defaultValue: "unknown",
        });
        await queryInterface.removeColumn("Tracks", "thumbnailScore");
    },
};