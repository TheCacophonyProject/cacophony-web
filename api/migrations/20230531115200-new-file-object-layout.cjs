// Create File object table, migrate recordings to use it
const util =  require("./util/util.cjs");

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.createTable("Objects", {
      key: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
        comment: "The unique object storage key."
      },
      owner: {
        type: Sequelize.ENUM('group', 'device', 'user', 'track', 'recording'),
        allowedNull: false,
        comment: "What kind of entity owns this file.  The `ownerId` field will correspond to the id of this entity."
      },
      ownerId: {
        type: Sequelize.INTEGER,
        allowedNull: true,
        defaultValue: Sequelize.NULL,
        comment: "Id of the entity that owns this file, which can be found using the `owner` field."
      },
      type: {
        type: Sequelize.ENUM('canonical', 'derived', 'preview'),
        allowNull: false,
        comment: "Whether this file is an original archival file, or a derived (compressed) version for display on web, or a preview (thumbnail)."
      },
      location: {
        type: Sequelize.ENUM('digital-ocean', 'backblaze', 'aws-s3', 'aws-s3-glacier', 'local-minio'),
        allowedNull: false,
        comment: "Which object storage provider currently hosts this file."
      },
      lastAccess: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Last time this file was requested for download."
      },
      createdAt: {
        type: Sequelize.DATE,
        allowedNull: false,
        defaultValue: Sequelize.NOW,
      },
      size: {
        type: Sequelize.INTEGER,
        allowedNull: false,
        comment: "Size of file in bytes."
      },
      sha1Hash: {
        type: Sequelize.INTEGER,
        allowedNull: true,
        defaultValue: Sequelize.NULL,
        comment: "The first 64 bits of the 160bit sha1 hash for this file."
      },
      mimeType: {
        type: Sequelize.STRING,
        allowedNull: false,
        comment: "Guessed mime type for this file."
      },
    });
  },

  down: async function (queryInterface) {
    await queryInterface.dropTable("Objects");
  },
};
