"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // check recordings has column cacophonyIndex
      const recordings = await queryInterface.describeTable("Recordings");
      if (!recordings.cacophonyIndex) {
        await queryInterface.addColumn(
          "Recordings",
          "cacophonyIndex",
          Sequelize.JSONB, {
            transaction
          }
        );
      }

      // sql get or create new algorithm into DetailSnapshot if does not exist
      let algorithmId = await queryInterface.sequelize.query(`
        SELECT "id" from "DetailSnapshots" 
        WHERE "type"='algorithm' AND "details"->>'algorithm'='sliding_window';`);
      if (algorithmId[0].length === 0) {
        algorithmId = await queryInterface.sequelize.query(
          `
          INSERT INTO "DetailSnapshots" ("type", "details", "createdAt", "updatedAt")
          VALUES ('algorithm', '{"algorithm":"sliding_window"}', NOW(), NOW())
          RETURNING "id";`, {
            transaction
          }
        );
      }
      algorithmId = algorithmId[0][0].id;

      console.log("Query all recordings");
      const analysedRecordings = await queryInterface.sequelize.query(
        `
        SELECT "id", "duration", "additionalMetadata"->'analysis'->'species_identify' as speciesindentify FROM "Recordings"
        WHERE jsonb_array_length("additionalMetadata"->'analysis'->'species_identify') != 0;
        `, {
          transaction
        }
      );


      console.log("Creating Tracks & Tags");
      for (const recording of analysedRecordings[0]) {
        const {
          id,
          duration,
          speciesindentify
        } = recording;

        if (!speciesindentify) {
          continue;
        }
        for (const speciesId of speciesindentify) {
          const {
            end_s,
            begin_s,
            species,
            liklihood: likelihood
          } = speciesId;
          // Create a new track in Track table
          // round to 2 decimals using round
          let x = begin_s / duration;
          let width = end_s / duration - x;
          x = x.toFixed(2);
          width = width.toFixed(2);
          const y = 0;
          const height = 1;
          const trackPosition = {
            x,
            y,
            width,
            height,
            order: 0,
          };
          const resId =
            await queryInterface.sequelize.query(
              `
                    INSERT INTO "Tracks" ("RecordingId", "AlgorithmId", "data", "createdAt", "updatedAt")
                    VALUES (:id, :algorithmId, :data, NOW(), NOW())
                    RETURNING "id";`, {
                transaction,
                replacements: {
                  id,
                  algorithmId,
                  data: JSON.stringify({
                    start_s: begin_s,
                    end_s: end_s,
                    positions: [trackPosition],
                    automatic: true,
                  }),
                },
              }
            );
          const trackId = resId[0][0].id;

          await queryInterface.sequelize.query(
            `
                  INSERT INTO "TrackTags" ("what", "confidence", "automatic", "data", "createdAt", "updatedAt", "TrackId")
                  VALUES (:species, :likelihood, true, '{"name": "Master"}', NOW(), NOW(), :trackId)
                  `, {
              transaction,
              replacements: {
                species: species,
                trackId,
                likelihood: likelihood ?? 0,
              },
              type: Sequelize.QueryTypes.INSERT,
            }
          );
        }
      }

      console.log("Moving cacophonyIndex");
      await queryInterface.sequelize.query(
        `
        UPDATE "Recordings"
        SET "cacophonyIndex" = "additionalMetadata"->'analysis'->'cacophony_index'
        WHERE "additionalMetadata"->'analysis'->'cacophony_index' IS NOT NULL
        `, {
          transaction
        }
      );

      console.log("modifying additionalMetadata");
      // remove cacophony_index and species_identify from additionalMetadata
      await queryInterface.sequelize.query(
        `
        UPDATE "Recordings"
        SET "additionalMetadata" = ("additionalMetadata"||("additionalMetadata"->'analysis')-'cacophony_index'-'species_identify')-'analysis'
        WHERE "additionalMetadata"->'analysis'->'cacophony_index' IS NOT NULL
        `, {
          transaction
        }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    const Op = Sequelize.Op;
    try {
      const recordings = await queryInterface.describeTable("Recordings");
      if (!recordings.cacophonyIndex) {
        return;
      }

      const analysedRecordings = await queryInterface.sequelize.query(
        `
        SELECT "id", "cacophonyIndex", "additionalMetadata" FROM "Recordings"
        WHERE "cacophonyIndex" IS NOT NULL
        `, {
          transaction
        }
      );

      await Promise.all(
        analysedRecordings[0].map(
          async ({
            id: recordingId,
            cacophonyIndex,
            additionalMetadata
          }) => {
            console.log("Querying for tracks", recordingId);
            const tracks = await queryInterface.sequelize.query(
              `
            SELECT "id", "data" FROM "Tracks"
            WHERE "RecordingId"= :recordingId
            `, {
                transaction,
                replacements: {
                  recordingId,
                },
              }
            );

            const speciesIdentify = await Promise.all(
              tracks[0].map(async ({
                id: trackId,
                data
              }) => {
                const {
                  start_s,
                  end_s
                } = data;
                console.log("Querying for trackTags", trackId);
                const tags = await queryInterface.sequelize.query(
                  `
                SELECT "id", "what", "confidence" FROM "TrackTags"
                WHERE "TrackId"=:trackId
                `, {
                    transaction,
                    replacements: {
                      trackId,
                    },
                  }
                );

                const tagIds = tags[0].map((tag) => tag.id);
                console.log("Delete trackTags", tagIds);
                await queryInterface.bulkDelete(
                  "TrackTags", {
                    id: {
                      [Op.in]: tagIds
                    }
                  }, {
                    transaction
                  }
                );

                console.log(tags);
                const speciesIndentify = tags[0].map(({
                  what,
                  confidence
                }) => {
                  const species_identify = {
                    begin_s: start_s,
                    end_s: end_s,
                    species: what,
                    liklihood: confidence,
                  };
                  return species_identify;
                });
                return speciesIndentify;
              })
            );

            // Delete all tracks
            const trackIds = tracks[0].map((track) => track.id);
            console.log("Delete tracks", trackIds);
            await queryInterface.bulkDelete(
              "Tracks", {
                id: {
                  [Op.in]: trackIds
                }
              }, {
                transaction
              }
            );
            const analysis = {
              species_identify: speciesIdentify.flat(2),
              cacophony_index: cacophonyIndex,
            };
            const keysToMove = [
              "cacophony_index_version",
              "processing_time_seconds",
              "species_identify_version",
            ];
            keysToMove.forEach((key) => {
              if (additionalMetadata[key]) {
                analysis[key] = additionalMetadata[key];
                delete additionalMetadata[key];
              }
            });

            const newAdditionalMetadata = JSON.stringify({
              ...additionalMetadata,
              analysis,
            }).replace(/"(\w+):(\w+)"/g, "\"$1\": '$2'");
            // replace json string double quotes of the objects value with single quotes
            console.log("Updating additionalMetadata", newAdditionalMetadata);

            await queryInterface.sequelize.query(
              `
            UPDATE "Recordings"
            SET "additionalMetadata" = :additionalMetadata
            WHERE "id" = :id
            `, {
                transaction,
                replacements: {
                  id: recordingId,
                  additionalMetadata: newAdditionalMetadata,
                },
              }
            );
          }
        )
      );

      console.log("Removing cacophonyIndex from Recording");
      await queryInterface.removeColumn("Recordings", "cacophonyIndex", {
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
