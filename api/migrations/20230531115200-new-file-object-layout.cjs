// // Create Objects table, migrate recordings to use it
// const util =  require("./util/util.cjs");
//
// module.exports = {
//   up: async function (queryInterface, Sequelize) {
//     await queryInterface.createTable("Objects", {
//       key: {
//         type: Sequelize.STRING,
//         primaryKey: true,
//         allowNull: false,
//         unique: true,
//         comment: "The unique object storage key."
//       },
//       usage: {
//         type: Sequelize.ENUM('canonical', 'derived', 'preview'),
//         allowNull: false,
//         comment: "Whether this file is an original archival file, or a derived (compressed) version for display on web, or a preview (thumbnail)."
//       },
//       owner: {
//         type: Sequelize.ENUM('group', 'device', 'user', 'track', 'recording'),
//         allowNull: false,
//         comment: "What kind of entity owns this file.  The `ownerId` field will correspond to the id of this entity."
//       },
//       ownerId: {
//         type: Sequelize.INTEGER,
//         allowNull: true,
//         defaultValue: Sequelize.NULL,
//         comment: "Id of the entity that owns this file, which can be found using the `owner` field."
//       },
//       location: {
//         type: Sequelize.ENUM('digital-ocean', 'backblaze', 'aws-s3', 'aws-s3-glacier', 'local-minio'),
//         allowNull: false,
//         comment: "Which object storage provider currently hosts this file."
//       },
//       lastAccess: {
//         type: Sequelize.DATE,
//         allowNull: true,
//         defaultValue: Sequelize.NULL,
//         comment: "Last time this file was requested for download."
//       },
//       createdAt: {
//         type: Sequelize.DATE,
//         allowNull: false,
//         defaultValue: Sequelize.NOW,
//       },
//       size: {
//         type: Sequelize.INTEGER,
//         allowNull: false,
//         comment: "Size of file in bytes."
//       },
//       sha1Hash: {
//         type: Sequelize.INTEGER,
//         allowNull: true,
//         defaultValue: Sequelize.NULL,
//         comment: "The first 64 bits of the 160bit sha1 hash for this file."
//       },
//       mimeType: {
//         type: Sequelize.STRING,
//         allowNull: false,
//         comment: "Guessed mime type for this file."
//       },
//       role: {
//         type: Sequelize.ENUM("audio-bait", "recording", "reference-pov", "reference-in-situ"),
//         allowNull: false,
//         comment: "The role of this asset in the system."
//       }
//     }, {
//       indexes: [
//         {
//           unique: true,
//           fields: ["key"]
//         },
//         {
//           unique: true,
//           fields: ["sha1Hash", "ownerId", "owner"] // FIXME: Will this break tests?
//         }
//       ]
//     });
//
//     // Port files from recordings over to objects table.
//
//     // Also take the opportunity to rename objects in storage - no, this can be done at any time.
//
//     // When we're copying over files from CCL, we can rename them.  So every file on CCL is *already* on backblaze
//     // I think - so we can just point there for now, and then new files go onto digital ocean until they're old?
//
//     // Would be nice to be able to bypass the database for retrieving public items like thumbnails
//     // If their key could be derived from the recordingId for instance, that would be useful.
//     // /grp/groupId/rec/id/prv ?
//     // /grp/groupId/rec/id/trackId/prv?
//     // /grp/groupId/rec/id/raw
//     // /grp/groupId/rec/id/cpy
//
//     // /grp/groupId/bait/id/raw
//     // /grp/groupId/dev/deviceId/from-date/pov/raw
//     // /grp/groupId/dev/deviceId/from-date/sit/raw
//
//     // Modify Recording to not include file info.
//     // await queryInterface.
//   },
//
//   down: async function (queryInterface) {
//     await queryInterface.dropTable("Objects");
//   },
// };
module.exports = {
  up: async function (queryInterface, Sequelize) {

  },

  down: async function (queryInterface) {

  },
};
