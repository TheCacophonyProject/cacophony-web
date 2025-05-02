module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("TrackTags", "model", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Tracks", "startSeconds", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("Tracks", "endSeconds", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("Tracks", "minFreqHz", {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Tracks", "maxFreqHz", {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("TrackTags", "model");
    await queryInterface.removeColumn("Tracks", "startSeconds");
    await queryInterface.removeColumn("Tracks", "endSeconds");
    await queryInterface.removeColumn("Tracks", "minFreqHz");
    await queryInterface.removeColumn("Tracks", "maxFreqHz");
  },
};
