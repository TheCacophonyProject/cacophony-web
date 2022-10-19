"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.addColumn("Stations", "lastActiveThermalTime", {
      type: Sequelize.DATE,
      allowNull: true,
      comment:
        "Last time that an thermal device in this station was online and active",
    });
    await queryInterface.addColumn("Stations", "lastActiveAudioTime", {
      type: Sequelize.DATE,
      allowNull: true,
      comment:
        "Last time that an audio device in this station was online and active",
    });
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Stations", "lastActiveThermalTime");
    await queryInterface.removeColumn("Stations", "lastActiveAudioTime");
  },
};
