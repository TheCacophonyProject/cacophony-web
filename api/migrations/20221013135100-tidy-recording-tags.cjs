

const util =  require("./util/util.cjs");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `update "Tags" set "detail" = "what" where "what" is not null;`
    );

    await queryInterface.removeColumn("Tags", "what");
  },

  down: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Tags", "what", {
      type: Sequelize.STRING,
      defaultValue: null,
    });
  },
};
