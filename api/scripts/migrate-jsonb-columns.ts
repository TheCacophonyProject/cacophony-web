// TODO

// Steps:
// 1. Create "model" column, and migrate { name } to it. (do the migration manually on both prod and test)
// 2. Create "start_s" and "end_s" columns on Tracks, and migrate data from jsonb into that.
// 3. Modify any queries that rely on querying into jsonb data to use the new column.
// 4. In batches, save the jsonb datas to gzipped object storage

import log from "../logging.js";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";
import {
  getTrackData,
  saveTrackData,
  saveTrackTagData,
} from "@models/Track.js";

const models = await modelsInit();

const migrateTracksStartingAtId = async (
  idCounter: { id: number },
  total: number
) => {
  const tracks = await models.Track.findAll({
    attributes: ["data", "id"],
    where: {
      id: { [Op.gt]: idCounter.id },
    },
    order: [["id", "asc"]],
    limit: 10000,
  });
  log.info(
    "Migrating %d tracks in range %d - %d –– total tracks: %d",
    tracks.length,
    tracks[0].id,
    tracks[tracks.length - 1].id,
    total
  );
  const chunkSize = 100;

  for (let i = 0; i < tracks.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, tracks.length - 1);
    const promises = tracks
      .slice(i, end)
      .map((track) => saveTrackData(track.id, track.data));
    await Promise.all(promises);
    log.info("Offloaded tracks %d - %d", tracks[i].id, tracks[end].id);
  }
  idCounter.id = tracks[tracks.length - 1].id;
  return tracks.length;
};

const migrateTrackTagsStartingAtId = async (
  idCounter: { id: number },
  total: number
) => {
  const trackTags = await models.TrackTag.findAll({
    attributes: ["data", "id"],
    where: {
      id: { [Op.gt]: idCounter.id },
    },
    order: [["id", "asc"]],
    limit: 10000,
  });
  log.info(
    "Migrating %d trackTags in range %d - %d –– total tracksTags: %d",
    trackTags.length,
    trackTags[0].id,
    trackTags[trackTags.length - 1].id,
    total
  );

  const chunkSize = 100;
  for (let i = 0; i < trackTags.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, trackTags.length - 1);
    const promises = trackTags
      .slice(i, end)
      .map((trackTag) => saveTrackTagData(trackTag.id, trackTag.data));
    await Promise.all(promises);
    log.info("Offloaded trackTags %d - %d", trackTags[i].id, trackTags[end].id);
  }
  idCounter.id = trackTags[trackTags.length - 1].id;
  return trackTags.length;
};

// const test = async () => {
//   const tracks = await models.Track.findAll({
//     attributes: ["data", "id"],
//     where: {
//       id: { [Op.gt]: 0 },
//     },
//     order: [["id", "asc"]],
//     limit: 10000,
//   });
//
//   for (const track of tracks) {
//     // Offload jsonb
//     console.log("Saving", JSON.stringify(track.data));
//     await saveTrackData(track.id, track.data);
//   }
//
//   for (const track of tracks) {
//     // Offload jsonb
//
//     const data = await getTrackData(track.id);
//     console.log("Retrieved", JSON.stringify(data));
//   }
// };

async function main() {
  log.info("Migrating JSONB columns");
  const totalTracks = await models.Track.count();
  const totalTrackTags = await models.TrackTag.count();

  const idCounter = { id: 0 };
  while ((await migrateTracksStartingAtId(idCounter, totalTracks)) > 0) {
    // Continue.
  }
  idCounter.id = 0;
  while ((await migrateTrackTagsStartingAtId(idCounter, totalTrackTags)) > 0) {
    // Continue
  }
  log.info("Finished migrating JSONB column 'Tracks'->'data'");
}

main()
  .catch((e) => {
    log.error(e);
    console.trace(e);
  })
  .then(() => {
    process.exit(0);
  });
