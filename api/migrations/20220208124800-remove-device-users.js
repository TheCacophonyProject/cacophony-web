"use strict";

const util = require("./util/util");
module.exports = {
  up: async function (queryInterface) {
    const { sequelize } = queryInterface;
    // Get a list of all devices that have device users.
    const devicesWithDeviceUsers = await sequelize.query(
      `select *
         from "DeviceUsers"
         inner join "Devices" on "DeviceId" = "Devices".id
         `
    );
    const transaction = await sequelize.transaction();
    try {
      for (const {UserId, GroupId} of devicesWithDeviceUsers[0]) {
        // Add each user as a group member of the devices' group.
        await sequelize.query(`insert into "GroupUsers" ("GroupId", "UserId", "createdAt", "updatedAt")
                               values (${GroupId}, ${UserId}, NOW(), NOW())`, {transaction});
      }
      await queryInterface.dropTable("DeviceUsers", {transaction});
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async function (queryInterface, Sequelize) {
    await queryInterface.createTable("DeviceUsers", {
      admin: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await util.addSerial(queryInterface, "DeviceUsers");
    await util.belongsToMany(
      queryInterface,
      "DeviceUsers",
      "Devices",
      "Users"
    );
  },
};
