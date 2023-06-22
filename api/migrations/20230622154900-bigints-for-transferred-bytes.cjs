

const util =  require("./util/util.cjs");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`alter table "GroupUsers" alter column "transferredBytes" type BIGINT`);
    await queryInterface.sequelize.query(`alter table "Users" alter column "transferredBytes" type BIGINT`);
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`alter table "GroupUsers" alter column "transferredBytes" type INT`);
    await queryInterface.sequelize.query(`alter table "Users" alter column "transferredBytes" type INT`);
  },
};
