"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(`create index concurrently if not exists idx_visits_groupid_starttime
            on "Visits" ("GroupId", "startTime" DESC);`
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_visits_groupid_starttime`);
    },
};