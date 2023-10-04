"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    await queryInterface.addIndex("Recordings", ["deletedAt", "duration"], {
      name: "idx_recordings_deletedat_duration",
    });

    await queryInterface.addIndex("TrackTags", ["archivedAt"], {
      name: "idx_tracktags_archivedat",
    });

    await queryInterface.addIndex("Tracks", ["archivedAt"], {
      name: "idx_tracks_archivedat",
    });
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */

    await queryInterface.removeIndex(
      "Recordings",
      "idx_recordings_deletedat_duration"
    );

    await queryInterface.removeIndex("TrackTags", "idx_tracktags_archivedat");

    await queryInterface.removeIndex("Tracks", "idx_tracks_archivedat");
  },
};
