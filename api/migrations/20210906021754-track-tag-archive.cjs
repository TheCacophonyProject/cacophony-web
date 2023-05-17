

module.exports = {
  up: async function (queryInterface, Sequelize) {
    return queryInterface.addColumn("TrackTags", "archivedAt", Sequelize.DATE, {
      allowNull: true,
    });
  },
  down: async function (queryInterface) {
    return queryInterface.removeColumn("TrackTags", "archivedAt");
  },
};
