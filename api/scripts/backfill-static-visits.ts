import { initSequelize } from "@models/index.js";
import log from "@log";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";
import { Op } from "sequelize";
import { RecordingType } from "@typedefs/api/consts.js";
import { Station } from "@models/Station.js";
import { Visit } from "@models/Visit.js";

const updateLocation = async (location: Station) => {
  const oldestRecordingInLocation = await Recording.findOne({
    where: {
      StationId: location.id,
      type: RecordingType.ThermalRaw,
    },
    order: [["recordingDateTime", "ASC"]],
  });
  if (oldestRecordingInLocation) {
    let hasRecordings = true;
    let visits = await Visit.rebuildForRecording(oldestRecordingInLocation);
    // Now get the next recording after the visit end time, and calculate visits on that?
    // How best to get concurrency out of this?  Over locations?  Over
    while (hasRecordings) {
      const nextRecording = await Recording.findOne({
        where: {
          StationId: location.id,
          type: RecordingType.ThermalRaw,
          recordingDateTime: { [Op.gt]: visits[visits.length - 1].endTime },
        },
        order: [["recordingDateTime", "ASC"]],
      });
      if (!nextRecording) {
        hasRecordings = false;
        break;
      }
      visits = await Visit.rebuildForRecording(nextRecording);
    }
  }
};

const updateAll = async (): Promise<void> => {
  const groups = await Group.findAll();
  for (const group of groups) {
    const locations = await Station.findAll({
      where: {
        GroupId: group.id,
        earliestThermalRecordingTime: { [Op.ne]: null },
      },
    });
    const CONCURRENCY_LIMIT = 10;
    const pool = new Set<Promise<void>>();
    for (const location of locations) {
      console.log(
        `updating visit data at location ${location.id} (${location.name}) in ${group.groupName}`,
      );
      const promise = updateLocation(location).then(() => {
        pool.delete(promise);
      });

      pool.add(promise);

      if (pool.size >= CONCURRENCY_LIMIT) {
        await Promise.race(pool);
      }
    }
    await Promise.all(pool);
  }
};

(async () => {
  await initSequelize();

  // For each group in the system, iterate over each device.
  // For each device, get thermal recordings from earliest to latest in batches of 100 recordings.
  // For each recording, get all tracks
  // For each track, fetch the track data from the s3 storage ( Track.getTrackData(trackId) )
  // If the track data has `thumbnail.score` update the `thumbnailScore` column in the `Tracks` table for that track
  // with the score.
  //await updateAll();

  const group = await Group.findOne({
    where: {
      groupName: "orton bradley park",
    },
  });
  const locations = await Station.findAll({
    where: {
      GroupId: group.id,
      earliestThermalRecordingTime: { [Op.ne]: null },
    },
  });
  for (const location of locations) {
    console.log(
      `updating visit data at location ${location.id} (${location.name}) in ${group.groupName}`,
    );
    await updateLocation(location);
  }
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
