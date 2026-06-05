"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(`ALTER TABLE "DeviceHistory" ADD COLUMN id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY;`)
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`ALTER TABLE "DeviceHistory" DROP COLUMN id`);
    },
};