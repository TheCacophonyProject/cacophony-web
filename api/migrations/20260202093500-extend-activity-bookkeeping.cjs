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
              AND r."recordingDateTime" is not null    
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
              AND r."recordingDateTime" is not null
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
              AND r."recordingDateTime" is not null              
              AND r."StationId" IS NOT NULL
            GROUP BY r."StationId"
          ) agg
          WHERE s."id" = agg."StationId";
        `);

        /*
        // In the past, duplicate stations have been created by a bug, that is stations that share a GroupId, and the same lat/long location field.
        // I want to have a migration script to de-dupe those stations.
        // When deduping, this script should prefer stations that have the 'needsRename' flag unset.
        // Maybe if there's only 1 device in the station throughout all time, and the device has the exact same location
        // as the station, and the device history for the station has no referenceImage, but the station does,
        // we can transplant the reference image from the station to the appropriate deviceHistory entries.


        // Implementation notes:
        // - We consider stations duplicates if (GroupId, ST_X(location), ST_Y(location)) match exactly.
        // - We pick a "keeper" per duplicate set, ordered by:
        //     needsRename ASC (false first), updatedAt DESC, id ASC
        // - We repoint foreign keys in common referencing tables (Recordings, DeviceHistory, Alerts),
        //   then delete the redundant stations.
        await queryInterface.sequelize.transaction(async (transaction) => {
            // Temporary mapping table: from_station_id -> to_station_id
            await queryInterface.sequelize.query(
                `
                CREATE TEMP TABLE station_dedupe_map (
                  from_station_id INTEGER PRIMARY KEY,
                  to_station_id   INTEGER NOT NULL
                ) ON COMMIT DROP;
                `,
                { transaction },
            );

            await queryInterface.sequelize.query(
                `
                WITH ranked AS (
                  SELECT
                    s."id" AS station_id,
                    s."GroupId" AS group_id,
                    ST_X(s."location") AS lng,
                    ST_Y(s."location") AS lat,
                    s."needsRename" AS needs_rename,
                    s."updatedAt" AS updated_at,
                    ROW_NUMBER() OVER (
                      PARTITION BY s."GroupId", ST_X(s."location"), ST_Y(s."location")
                      ORDER BY s."needsRename" ASC, s."updatedAt" DESC, s."id" ASC
                    ) AS rn,
                    FIRST_VALUE(s."id") OVER (
                      PARTITION BY s."GroupId", ST_X(s."location"), ST_Y(s."location")
                      ORDER BY s."needsRename" ASC, s."updatedAt" DESC, s."id" ASC
                    ) AS keep_id
                  FROM "Stations" s
                )
                INSERT INTO station_dedupe_map (from_station_id, to_station_id)
                SELECT station_id, keep_id
                FROM ranked
                WHERE rn > 1 AND station_id <> keep_id;
                `,
                { transaction },
            );

            const [mapCountRows] = await queryInterface.sequelize.query(
                `SELECT COUNT(*)::int AS count FROM station_dedupe_map;`,
                { transaction },
            );
            const mapCount = Array.isArray(mapCountRows) ? mapCountRows[0]?.count : 0;
            if (mapCount > 0) {
                console.log(`[migration] Station de-dupe: remapping ${mapCount} duplicate station ids`);

                // Repoint Recordings
                await queryInterface.sequelize.query(
                    `
                    UPDATE "Recordings" r
                    SET "StationId" = m.to_station_id
                    FROM station_dedupe_map m
                    WHERE r."StationId" = m.from_station_id;
                    `,
                    { transaction },
                );

                // Repoint DeviceHistory (column is "stationId")
                await queryInterface.sequelize.query(
                    `
                    UPDATE "DeviceHistory" dh
                    SET "stationId" = m.to_station_id
                    FROM station_dedupe_map m
                    WHERE dh."stationId" = m.from_station_id;
                    `,
                    { transaction },
                );

                // Repoint Alerts (if present)
                await queryInterface.sequelize.query(
                    `
                    UPDATE "Alerts" a
                    SET "StationId" = m.to_station_id
                    FROM station_dedupe_map m
                    WHERE a."StationId" = m.from_station_id;
                    `,
                    { transaction },
                );

                // Finally delete the redundant stations
                await queryInterface.sequelize.query(
                    `
                    DELETE FROM "Stations" s
                    USING station_dedupe_map m
                    WHERE s."id" = m.from_station_id;
                    `,
                    { transaction },
                );
            } else {
                console.log("[migration] Station de-dupe: no duplicates found");
            }
        });
         */
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
