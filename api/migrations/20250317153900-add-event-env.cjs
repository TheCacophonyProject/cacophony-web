module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `create type "enum_Events_env" as ENUM('tc2-dev', 'tc2-test', 'tc2-prod', 'unknown');`
    );
    await queryInterface.addColumn("Events", "env", {
      type: Sequelize.ENUM("tc2-dev", "tc2-test", "tc2-prod", "unknown"),
      defaultValue: "unknown",
    });
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Events", "env");

    try {
      await queryInterface.sequelize.query('drop type "enum_Events_env";');
    } catch (e) {
      // ...
    }
  },
};
