"use strict";

const util = require("./util/util");
module.exports = {
  up: async function (queryInterface, Sequelize) {

    await util.migrationAddBelongsTo(queryInterface, "Alerts", "Stations");
  },

  down: async function (queryInterface) {
    await util.migrationRemoveBelongsTo(queryInterface, "Alerts", "Stations");
  },
};
