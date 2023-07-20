

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "heartbeat", Sequelize.DATE);
    await queryInterface.addColumn("Devices", "nextHeartbeat", Sequelize.DATE);
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Devices", "heartbeat");
    await queryInterface.removeColumn("Devices", "nextHeartbeat");
  },
};
