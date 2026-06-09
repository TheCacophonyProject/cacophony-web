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
    },

    async down(queryInterface) {

    },
};