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

    try {
      await queryInterface.sequelize.query(
        'drop type "enum_Recordings_type";'
      );
    } catch (e) {
      console.log(e);
    }

    await queryInterface.sequelize.query(
      `create type "enum_Recordings_type" as ENUM('thermalRaw', 'audio', 'irRaw', 'trailcam-video', 'trailcam-image');`
    );
    await queryInterface.sequelize.query(
      `alter table "Recordings" alter column "type" type "enum_Recordings_type" using ((type::text)::"enum_Recordings_type");`
    );

    await queryInterface.sequelize.query(`ALTER TABLE "DeviceHistory" ADD CONSTRAINT "DeviceHistory_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Stations" (id) ON DELETE SET NULL;`);
    await queryInterface.sequelize.query(`ALTER TABLE "GroupInvites" ADD CONSTRAINT "GroupInvites_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Users" (id) ON DELETE SET NULL;`);
    await queryInterface.sequelize.query(`ALTER TABLE "UserSessions" ADD CONSTRAINT "UserSessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" (id) ON delete cascade;`);
  },
  down: async function (queryInterface, Sequelize) {
    // No going back
  },
};
