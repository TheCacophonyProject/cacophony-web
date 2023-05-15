"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `alter type "enum_Devices_kind" add value 'trailcam';`
    );
    await queryInterface.sequelize.query(
      `alter type "enum_Devices_kind" add value 'trapcam';`
    );
    await queryInterface.sequelize.query(
      `alter type "enum_Devices_kind" add value 'hybrid-thermal-audio';`
    );

    await queryInterface.sequelize.query(
      `create type "enum_Recordings_type" as ENUM('thermalRaw', 'audio', 'irRaw', 'trailcam-video', 'trailcam-image');`
    );
    await queryInterface.sequelize.query(`alter table "Recordings" alter column "type" drop default;`);
    await queryInterface.sequelize.query(
      `alter table "Recordings" alter column "type" type "enum_Recordings_type" using ((type::text)::"enum_Recordings_type");`
    );
    await queryInterface.sequelize.query(`alter table "Recordings" alter column "type" set default null;`);

    await queryInterface.sequelize.query(`ALTER TABLE "DeviceHistory" ADD CONSTRAINT "DeviceHistory_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Stations" (id) ON DELETE SET NULL;`);
    await queryInterface.sequelize.query(`ALTER TABLE "GroupInvites" ADD CONSTRAINT "GroupInvites_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Users" (id) ON DELETE SET NULL;`);
    await queryInterface.sequelize.query(`ALTER TABLE "UserSessions" ADD CONSTRAINT "UserSessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" (id) ON delete cascade;`);
  },
  down: async function (queryInterface, Sequelize) {
    // Device kinds
    await queryInterface.sequelize.query(
      'alter type "enum_Devices_kind" rename to "enum_Devices_kind_old";'
    );
    await queryInterface.sequelize.query(
      `create type "enum_Devices_kind" as ENUM('thermal', 'audio', 'unknown');`
    );
    await queryInterface.sequelize.query(`alter table "Devices" alter column "kind" drop default;`);
    await queryInterface.sequelize.query(`alter table "Devices" alter column "kind" type "enum_Devices_kind" using ((kind::text)::"enum_Devices_kind")`);
    await queryInterface.sequelize.query(`alter table "Devices" alter column "kind" set default 'unknown'::"enum_Devices_kind";`);
    try {
      await queryInterface.sequelize.query(
        'drop type "enum_Devices_kind_old";'
      );
    } catch (e) {
      // console.log(e);
    }
    // Recordings types
    await queryInterface.sequelize.query(
      'alter type "enum_Recordings_type" rename to "enum_Recordings_type_old";'
    );
    await queryInterface.sequelize.query(
      `alter table "Recordings" alter column "type" type varchar(255)`
    );
    await queryInterface.sequelize.query(`alter table "Recordings" alter column "type" set default null;`);
    try {
      await queryInterface.sequelize.query(
        'drop type "enum_Recordings_type_old";'
      );
    } catch (e) {
      // console.log(e);
    }

    await queryInterface.sequelize.query(`DROP CONSTRAINT "DeviceHistory_stationId_fkey"`);
    await queryInterface.sequelize.query(`DROP CONSTRAINT "GroupInvites_invitedBy_fkey"`);
    await queryInterface.sequelize.query(`DROP CONSTRAINT "UserSessions_userId_fkey"`);
  },
};
