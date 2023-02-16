"use strict";

const util = require("./util/util");
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
      `create type "enum_Recordings_type" as ENUM('thermalRaw', 'audio', 'irRaw', 'trailcam-video', 'trailcam-image')`
    );
    await queryInterface.sequelize.query(
      `alter table "Recordings" alter column "type" type "enum_Recordings_type" using ((type::text)::"enum_Recordings_type")`
    );
  },
  down: async function (queryInterface, Sequelize) {
    // No going back
  },
};
