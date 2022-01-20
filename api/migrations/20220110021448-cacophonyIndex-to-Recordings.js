"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // chcek recordings has column cacophonyIndex
      const hasColumn = await queryInterface.describeTable("Recordings");
      if (!hasColumn.cacophonyIndex) {
        await queryInterface.addColumn(
          "Recordings",
          "cacophonyIndex",
          Sequelize.JSONB
        );
      }

      // sql get or create new algorithm into DetailSnapshot if does not exist
      let algorithmId = await queryInterface.sequelize.query(`
        SELECT "id" from "DetailSnapshots" 
        WHERE "type"='algorithm' AND "details"->>'algorithm'='sliding_window';`);
      if (!algorithmId) {
        console.log("inserting new algorithm");
        algorithmId = await queryInterface.sequelize.query(
          `
          INSERT INTO "DetailSnapshots" ("type", "details", "createdAt", "updatedAt")
          VALUES ('algorithm', '{"algorithm":"sliding_window"}', NOW(), NOW())
          RETURNING "id";`,
          { transaction }
        );
      }
      algorithmId = algorithmId[0][0].id;

      const analysedRecordings = await queryInterface.sequelize.query(
        `
        SELECT "id", "additionalMetadata"->'analysis'->'species_identify' as speciesindentify FROM "Recordings"
        WHERE "fileMimeType"='audio/mp3' AND "additionalMetadata"->'analysis'->'species_identify' IS NOT NULL
        `,
        { transaction }
      );

      console.log(analysedRecordings);

      await Promise.all(
        analysedRecordings[0].map(async ({ id, speciesindentify }) => {
          if (!speciesindentify) {
            return;
          }
          return await Promise.all(
            speciesindentify.map(
              async ({ end_s, begin_s, species, liklihood }) => {
                // Create a new track in Track table
                const trackId = (
                  await queryInterface.sequelize.query(
                    `
              INSERT INTO "Tracks" ("RecordingId", "AlgorithmId", "data", "createdAt", "updatedAt")
              VALUES (${id}, ${algorithmId}, '{"start_s": ${begin_s}, "end_s": ${end_s}}', NOW(), NOW())
              RETURNING "id";`,
                    { transaction }
                  )
                )[0][0].id;
                console.log(trackId);
                return await queryInterface.sequelize.query(
                  `
              INSERT INTO "TrackTags" ("what", "confidence", "automatic", "data", "createdAt", "updatedAt", "TrackId")
              VALUES ('${species}', ${liklihood}, true, '{"name": "Master"}', NOW(), NOW(), ${trackId})
              `,
                  { transaction }
                );
              }
            )
          );
        })
      );

      await queryInterface.sequelize.query(
        `
        UPDATE "Recordings"
        SET "cacophonyIndex" = "additionalMetadata"->'analysis'->'cacophony_index'
        WHERE "fileMimeType" = 'audio/mp3'
        AND "additionalMetadata"->'analysis'->'cacophony_index' IS NOT NULL
        `,
        { transaction }
      );

      console.log("modifying additionalMetadata");
      // remove cacophony_index and species_identify from additionalMetadata
      await queryInterface.sequelize.query(
        `
        UPDATE "Recordings"
        SET "additionalMetadata" = ("additionalMetadata"||("additionalMetadata"->'analysis')-'cacophony_index'-'species_identify')-'analysis'
        WHERE "fileMimeType" = 'audio/mp3'
        AND "additionalMetadata"->'analysis'->'cacophony_index' IS NOT NULL
        `,
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
  down: async (queryInterface, Sequelize) => {
    // const Op = Sequelize.Op;
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const analysedRecordings = await queryInterface.sequelize.query(
        `
        SELECT "id", "cacophonyIndex" FROM "Recordings"
        WHERE "fileMimeType"='audio/mp3' AND "cacophonyIndex" IS NOT NULL
        `,
        { transaction }
      );
      console.log(analysedRecordings);

      await Promise.all(
        analysedRecordings[0].map(
          async ({ id: recordingId, cacophonyIndex }) => {
            const tracks = await queryInterface.sequelize.query(
              `
            SELECT "id", "data" FROM "Tracks"
            WHERE "RecordingId"=${recordingId}
            `,
              { transaction }
            );
            console.log(tracks);
            const speciesIdentify = await Promise.all(
              tracks[0].map(async ({ id: trackId, data }) => {
                const { start_s, end_s } = data;
                const tags = await queryInterface.sequelize.query(
                  `
                SELECT "what", "confidence" FROM "TrackTags"
                WHERE "TrackId"=${trackId}
                `,
                  { transaction }
                );
                console.log(tags);
                const speciesIndentify = tags[0].map(({ what, confidence }) => {
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
            const sql = `
                    UPDATE "Recordings"
                    SET "additionalMetadata" = ("additionalMetadata" ||
                      jsonb_build_object('analysis',
                        jsonb_build_object(
                          'cacophony_index_version', "additionalMetadata"->'cacophony_index_version',
                          'processing_time_seconds', "additionalMetadata"->'processing_time_seconds',
                          'species_identify_version', "additionalMetadata"->'species_identify_version'
                        ) || 
                        '{"cacophony_index": ${JSON.stringify(
                          cacophonyIndex
                        )}, "species_identify": ${JSON.stringify(
              speciesIdentify.flat(2)
            )}}'
                      ))-'cacophony_index_version'-'processing_time_seconds'-'species_identify_version'
                    WHERE "id"=${recordingId}
                  `;
            return await queryInterface.sequelize.query(sql, {
              transaction,
            });
          }
        )
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
