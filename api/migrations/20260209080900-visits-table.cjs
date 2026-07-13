"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("Visits", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            startTime: {
                type: Sequelize.DATE,
                allowNull: false,
                comment: "Start time of the rolling visit window",
            },
            endTime: {
                type: Sequelize.DATE,
                allowNull: false,
                comment: "End time of the rolling visit window",
            },
            classification: {
                type: Sequelize.JSONB,
                allowNull: true,
                comment: "Visit classification(s) derived from classifications on recordings in the window",
            },
            StationId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: "Station the visit belongs to",
            },
            GroupId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: "Project/group the visit belongs to"
            },
            recordingIds: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: [],
                comment: "JSONB array of recording IDs that are part of this visit",
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
        });
        await Promise.all([
            queryInterface.addConstraint("Visits", {
                fields: ["GroupId"],
                type: "foreign key",
                name: "fk_visits_project_id",
                references: {
                    table: "Groups",
                    field: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            }),
            queryInterface.addConstraint("Visits", {
                fields: ["StationId"],
                type: "foreign key",
                name: "fk_visits_station_id",
                references: {
                    table: "Stations",
                    field: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            }),
            queryInterface.addIndex("Visits", ["StationId", "startTime"], {
                name: "visits_station_start_idx",
            }),
            queryInterface.addIndex("Visits", ["StationId", "endTime"], {
                name: "visits_station_end_idx",
            }),
            // NOTE: Use for array inclusion queries 'recordingId' @> 'recordingIds'
            queryInterface.addIndex(
                "Visits",
                [{ attribute: "recordingIds", operator: "jsonb_path_ops" }],
                {
                    name: "visits_recording_ids_gin_idx",
                    using: "gin"
                },
            ),
        ]);
    },

    async down(queryInterface) {
        await queryInterface.dropTable("Visits");
    },
};