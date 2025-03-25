module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `create type "enum_TrackTags_gender" as ENUM('male', 'female');`
    );
    await queryInterface.addColumn("TrackTags", "gender", {
      type: Sequelize.ENUM("male", "female"),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.sequelize.query(
      `create type "enum_TrackTags_maturity" as ENUM('juvenile', 'adult');`
    );
    await queryInterface.addColumn("TrackTags", "maturity", {
      type: Sequelize.ENUM("juvenile", "adult"),
      allowNull: true,
      defaultValue: null,
    });
    // DROP JSONB columns entirely.
    await queryInterface.sequelize.query(
      `alter table "TrackTags" drop column if exists "data";`
    );
    //await queryInterface.removeColumn("Tracks", "data");
    //await queryInterface.removeColumn("TrackTags", "data");
    await queryInterface.sequelize.query(
      `alter table "Tracks" drop column if exists "data";`
    );
  },
  down: async function (queryInterface, Sequelize) {
    await queryInterface.removeColumn("TrackTags", "gender");

    try {
      await queryInterface.sequelize.query(
        'drop type "enum_TrackTags_gender";'
      );
    } catch (e) {
      // ...
    }
    await queryInterface.removeColumn("TrackTags", "maturity");
    try {
      await queryInterface.sequelize.query(
        'drop type "enum_TrackTags_maturity";'
      );
    } catch (e) {
      // ...
    }

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
