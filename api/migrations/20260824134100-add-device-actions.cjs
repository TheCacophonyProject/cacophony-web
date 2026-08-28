"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `create type "enum_Device_actions_status" as ENUM('pending', 'acknowledged', 'completed', 'failed');`,
    );
    await queryInterface.createTable("DeviceActions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      type: { type: Sequelize.STRING, allowNull: false },
      action: { type: Sequelize.JSONB, allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'acknowledged', 'completed', 'failed'),
        defaultValue: "pending",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      DeviceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      }
    });
    await Promise.all([
      queryInterface.addConstraint("DeviceActions", {
        fields: ["DeviceId"],
        type: "foreign key",
        name: "fk_device_actions_device_id",
        references: {
          table: "Devices",
          field: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      }),
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("DeviceActions");
  },
};
