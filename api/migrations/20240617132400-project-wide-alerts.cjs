const util = require("./util/util.cjs");


module.exports = {
  async up (queryInterface) {
    await util.migrationAddBelongsTo(queryInterface, "Alerts", "Groups");
  },

  async down (queryInterface) {
    util.migrationRemoveBelongsTo(queryInterface, "Alerts", "Groups");
  },
};
