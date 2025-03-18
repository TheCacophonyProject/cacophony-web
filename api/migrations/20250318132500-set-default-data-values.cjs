module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.changeColumn("Tracks", "data", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("TrackTags", "data", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.changeColumn("Tracks", "data", {
      type: Sequelize.JSONB,
      allowNull: false,
    });
    await queryInterface.changeColumn("TrackTags", "data", {
      type: Sequelize.JSONB,
      allowNull: false,
    });
  },
};
