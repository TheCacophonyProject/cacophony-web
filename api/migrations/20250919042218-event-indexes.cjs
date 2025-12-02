"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS events_devicedatetime_idx
    `);
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS detailsnapshots_details_idx
    `);
    await queryInterface.sequelize.query(
      `CREATE INDEX events_devicedatetime_idx ON public."Events" USING btree ("dateTime", "DeviceId")`,
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX detailsnapshots_details_idx ON public."DetailSnapshots" USING hash (details)`,
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DROP INDEX events_devicedatetime_idx`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX detailsnapshots_details_idx`,
    );
  },
};
