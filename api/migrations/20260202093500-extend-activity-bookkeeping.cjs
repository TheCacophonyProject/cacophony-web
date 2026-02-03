"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Devices: split lastRecordingTime into per-media-type earliest/last timestamps.
        await Promise.all([
            queryInterface.addColumn("Devices", "earliestThermalRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Earliest time that a thermal recording was made by this device",
            }),
            queryInterface.addColumn("Devices", "earliestAudioRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Earliest time that an audio recording was made by this device",
            }),
            queryInterface.addColumn("Devices", "lastThermalRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Latest time that a thermal recording was made by this device",
            }),
            queryInterface.addColumn("Devices", "lastAudioRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Latest time that an audio recording was made by this device",
            }),
        ]);

        // Remove old aggregate column.
        await queryInterface.removeColumn("Devices", "lastRecordingTime");

        // For each device, find the earliest and latest recording of each time from the `Recordings` table,
        // and update the newly created fields on `Devices`.
        await queryInterface.sequelize.query(`
          UPDATE "Devices" d
          SET
            "earliestAudioRecordingTime" = agg."earliestAudioRecordingTime",
            "lastAudioRecordingTime"     = agg."lastAudioRecordingTime",
            "earliestThermalRecordingTime" = agg."earliestThermalRecordingTime",
            "lastThermalRecordingTime"     = agg."lastThermalRecordingTime"
          FROM (
            SELECT
              r."DeviceId" AS "DeviceId",
              MIN(r."recordingDateTime") FILTER (
                WHERE r."type" = 'audio'
              ) AS "earliestAudioRecordingTime",
              MAX(r."recordingDateTime") FILTER (
                WHERE r."type" = 'audio'
              ) AS "lastAudioRecordingTime",
              MIN(r."recordingDateTime") FILTER (
                WHERE r."type" = 'thermalRaw'
              ) AS "earliestThermalRecordingTime",
              MAX(r."recordingDateTime") FILTER (
                WHERE r."type" = 'thermalRaw'
              ) AS "lastThermalRecordingTime"
            FROM "Recordings" r
            WHERE
              r."deletedAt" IS NULL
              AND r."DeviceId" IS NOT NULL
            GROUP BY r."DeviceId"
          ) agg
          WHERE d."id" = agg."DeviceId";
        `);

        // Add earliest* columns to Groups and Stations, and backfill from Recordings.
        await Promise.all([
            queryInterface.addColumn("Groups", "earliestThermalRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Earliest time that a thermal recording was received by this project",
            }),
            queryInterface.addColumn("Groups", "earliestAudioRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Earliest time that an audio recording was received by this project",
            }),
            queryInterface.addColumn("Stations", "earliestThermalRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Earliest time that a thermal recording was received in this station",
            }),
            queryInterface.addColumn("Stations", "earliestAudioRecordingTime", {
                type: Sequelize.DATE,
                allowNull: true,
                comment: "Earliest time that an audio recording was received in this station",
            }),
        ]);

        // Backfill Groups (also refresh last* while we're here to keep bookkeeping consistent).
        await queryInterface.sequelize.query(`
          UPDATE "Groups" g
          SET
            "earliestAudioRecordingTime"    = agg."earliestAudioRecordingTime",
            "lastAudioRecordingTime"        = agg."lastAudioRecordingTime",
            "earliestThermalRecordingTime"  = agg."earliestThermalRecordingTime",
            "lastThermalRecordingTime"      = agg."lastThermalRecordingTime"
          FROM (
            SELECT
              r."GroupId" AS "GroupId",
              MIN(r."recordingDateTime") FILTER (
                WHERE r."type" = 'audio'
              ) AS "earliestAudioRecordingTime",
              MAX(r."recordingDateTime") FILTER (
                WHERE r."type" = 'audio'
              ) AS "lastAudioRecordingTime",
              MIN(r."recordingDateTime") FILTER (
                WHERE r."type" = 'thermalRaw'
              ) AS "earliestThermalRecordingTime",
              MAX(r."recordingDateTime") FILTER (
                WHERE r."type" = 'thermalRaw'
              ) AS "lastThermalRecordingTime"
            FROM "Recordings" r
            WHERE
              r."deletedAt" IS NULL
              AND r."GroupId" IS NOT NULL
            GROUP BY r."GroupId"
          ) agg
          WHERE g."id" = agg."GroupId";
        `);

        // Backfill Stations (also refresh last*).
        await queryInterface.sequelize.query(`
          UPDATE "Stations" s
          SET
            "earliestAudioRecordingTime"    = agg."earliestAudioRecordingTime",
            "lastAudioRecordingTime"        = agg."lastAudioRecordingTime",
            "earliestThermalRecordingTime"  = agg."earliestThermalRecordingTime",
            "lastThermalRecordingTime"      = agg."lastThermalRecordingTime"
          FROM (
            SELECT
              r."StationId" AS "StationId",
              MIN(r."recordingDateTime") FILTER (
                WHERE r."type" = 'audio'
              ) AS "earliestAudioRecordingTime",
              MAX(r."recordingDateTime") FILTER (
                WHERE r."type" = 'audio'
              ) AS "lastAudioRecordingTime",
              MIN(r."recordingDateTime") FILTER (
                WHERE r."type" = 'thermalRaw'
              ) AS "earliestThermalRecordingTime",
              MAX(r."recordingDateTime") FILTER (
                WHERE r."type" = 'thermalRaw'
              ) AS "lastThermalRecordingTime"
            FROM "Recordings" r
            WHERE
              r."deletedAt" IS NULL
              AND r."StationId" IS NOT NULL
            GROUP BY r."StationId"
          ) agg
          WHERE s."id" = agg."StationId";
        `);
    },

    async down(queryInterface, Sequelize) {
        // Restore old aggregate column on Devices and backfill it from the per-type "last*" fields.
        // (We do this before dropping the per-type columns so we can preserve as much data as possible.)
        await queryInterface.addColumn("Devices", "lastRecordingTime", {
            type: Sequelize.DATE,
            allowNull: true,
            comment: "Latest time that any recording was made by this device",
        });

        // Backfill lastRecordingTime as the max of lastAudioRecordingTime and lastThermalRecordingTime.
        await queryInterface.sequelize.query(`
          UPDATE "Devices" d
          SET "lastRecordingTime" = CASE
            WHEN d."lastAudioRecordingTime" IS NULL AND d."lastThermalRecordingTime" IS NULL THEN NULL
            ELSE GREATEST(
              d."lastAudioRecordingTime",
              d."lastThermalRecordingTime"
            )
          END;
        `);

        // Drop the newly added per-type bookkeeping columns on Devices.
        await Promise.all([
            queryInterface.removeColumn("Devices", "earliestThermalRecordingTime"),
            queryInterface.removeColumn("Devices", "earliestAudioRecordingTime"),
            queryInterface.removeColumn("Devices", "lastThermalRecordingTime"),
            queryInterface.removeColumn("Devices", "lastAudioRecordingTime"),
        ]);

        // Remove earliest* columns from Groups and Stations (they didn't exist prior to this migration).
        await Promise.all([
            queryInterface.removeColumn("Groups", "earliestThermalRecordingTime"),
            queryInterface.removeColumn("Groups", "earliestAudioRecordingTime"),
            queryInterface.removeColumn("Stations", "earliestThermalRecordingTime"),
            queryInterface.removeColumn("Stations", "earliestAudioRecordingTime"),
        ]);
    },
};
