const util = require("./util/util.cjs");
module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `drop type if exists "enum_TrackTags_gender";`
    );
    await queryInterface.sequelize.query(
      `drop type if exists "enum_TrackTags_maturity";`
    );

    await queryInterface.createTable("TrackTagUserData", {
      gender: {
        type: Sequelize.ENUM("male", "female"),
        allowNull: true,
        defaultValue: null,
      },
      maturity: {
        type: Sequelize.ENUM("juvenile", "adult"),
        allowNull: true,
        defaultValue: null,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
    await util.migrationAddBelongsTo(
      queryInterface,
      "TrackTagUserData",
      "TrackTags",
      "strict"
    );

    // DROP JSONB columns entirely.
    await queryInterface.sequelize.query(
      `alter table "TrackTags" drop column if exists "data";`
    );
    await queryInterface.sequelize.query(
      `alter table "Tracks" drop column if exists "data";`
    );
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'drop type if exists "enum_TrackTags_gender";'
    );
    await queryInterface.sequelize.query(
      'drop type if exists "enum_TrackTags_maturity";'
    );

    await util.migrationRemoveBelongsTo(
      queryInterface,
      "TrackTagUserData",
      "TrackTags"
    );
    await queryInterface.dropTable("TrackTagUserData");

    await queryInterface.addColumn("Tracks", "data", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("TrackTags", "data", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
  },
};
