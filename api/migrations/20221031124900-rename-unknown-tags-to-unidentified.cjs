

const util =  require("./util/util.cjs");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `update "TrackTags" set "what" = 'unidentified', "path" = 'all.other.unidentified' where "what" = 'unknown';`
    );
  },

  down: async function (queryInterface, Sequelize) {
    // No going back from this change.
  },
};
