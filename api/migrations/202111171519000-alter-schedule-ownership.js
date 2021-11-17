"use strict";
const util = require("./util/util");

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await util.migrationRemoveBelongsTo(queryInterface, "Schedules", "Users");
    await util.migrationAddBelongsTo(queryInterface, "Schedules", "Groups");
  },
  down: async function (queryInterface) {
    await util.migrationAddBelongsTo(queryInterface, "Schedules", "Users");
    await util.migrationRemoveBelongsTo(queryInterface, "Schedules", "Groups");
  },
};
