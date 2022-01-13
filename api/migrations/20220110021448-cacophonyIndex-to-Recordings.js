"use strict";
const AllModels = require("../models");
const { Recording, Track, DetailSnapshot, TrackTag } = AllModels.default;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const Op = Sequelize.Op;
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
      // converts cacophony_index in additionalMetadata to cacophonyIndex
      const recordings = await Recording.findAll({
        transaction,
        where: {
          fileMimeType: {
            [Op.eq]: "audio/mp3",
          },
          additionalMetadata: {
            // prettier-ignore
            [Op.contains]: {analysis: {}},
          },
        },
      });

      const algorithm = await DetailSnapshot.getOrCreateMatching(
        "algorithm",
        {
          algorithm: "sliding_window",
        },
        { transaction }
      );

      await Promise.all(
        recordings.map(async (recording) => {
          const { id, additionalMetadata } = recording;
          const { analysis, ...metaData } = additionalMetadata;
          const { species_identify, cacophony_index } = analysis;
          species_identify.forEach(
            async ({ end_s, begin_s, species, liklihood }) => {
              const newTrack = await Track.create(
                {
                  data: {
                    start_s: begin_s,
                    end_s: end_s,
                  },
                  RecordingId: id,
                  AlgorithmId: algorithm.id,
                },
                { transaction }
              );
              await newTrack.addTag(species, liklihood, true, {
                name: "Master",
              });
            }
          );

          return await Recording.update(
            {
              additionalMetadata: metaData,
              cacophonyIndex: cacophony_index,
            },
            {
              where: {
                id,
              },
              transaction,
            }
          );
        })
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
  down: async (queryInterface, Sequelize) => {
    const Op = Sequelize.Op;
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const hasColumn = await queryInterface.describeTable("Recordings");
      if (hasColumn.cacophonyIndex) {
        // Get All recordings with cacophonyIndex
        const recordings = await Recording.findAll({
          transaction,
          where: {
            fileMimeType: {
              [Op.eq]: "audio/mp3",
            },
            cacophonyIndex: {
              [Op.ne]: null,
            },
          },
        });
        await Promise.all(
          recordings.map(async (recording) => {
            const { id, cacophonyIndex, additionalMetadata } = recording;
            const tracks = await Track.findAll({
              transaction,
              where: {
                RecordingId: id,
              },
            });
            const species_identify = await Promise.all(
              tracks.map(async (track) => {
                const { id } = track;
                const tags = await TrackTag.findAll({
                  transaction,
                  where: {
                    TrackId: id,
                  },
                });
                await track.destroy({ transaction });
                return await Promise.all(
                  tags.map(async (tag) => {
                    tag.destroy({ transaction });
                    return {
                      liklihood: tag.confidence,
                      end_s: track.data.end_s,
                      begin_s: track.data.start_s,
                      species: tag.what,
                      who: tag.data.name,
                    };
                  })
                );
              })
            );
            const prevAdditionalMetadata = {
              ...additionalMetadata,
              analysis: {
                species_identify: species_identify.flat(2),
                cacophony_index: cacophonyIndex,
              },
            };
            return await recording.update({
              additionalMetadata: prevAdditionalMetadata,
            });
          })
        );
        await queryInterface.removeColumn("Recordings", "cacophonyIndex", {
          transaction,
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
