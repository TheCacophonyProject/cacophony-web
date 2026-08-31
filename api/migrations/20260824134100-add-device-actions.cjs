"use strict";
/** @type {import('sequelize-cli').Migration} */

const states = ['pending', 'requested', 'responded', 'acknowledged', 'completed', 'failed'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `create type "enum_Device_actions_status" as ENUM('${states.join(', ')}');`,
    );
    await queryInterface.createTable("DeviceActions", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      history: { type: Sequelize.JSONB, allowNull: false },
      status: {
        type: Sequelize.ENUM(...states),
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
      },
      RecordingId: {
        type: Sequelize.INTEGER,
        allowNull: true,
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
      queryInterface.addConstraint("DeviceActions", {
        fields: ["RecordingId"],
        type: "foreign key",
        name: "fk_device_actions_recording_id",
        references: {
          table: "Recordings",
          field: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      }),
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("DeviceActions");
  },
};
