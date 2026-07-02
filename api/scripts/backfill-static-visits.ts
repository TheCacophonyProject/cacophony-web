import { initSequelize } from "@models/index.js";
import log from "@log";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";
import { Op } from "sequelize";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import { Station } from "@models/Station.js";
import { Visit } from "@models/Visit.js";

const updateLocation = async (location: Station) => {
  let earliestTime = new Date("2010-01-01T00:00:00.000Z");
  while (true) {
    const recording = await Recording.findOne({
      where: {
        StationId: location.id,
        type: RecordingType.ThermalRaw,
        deletedAt: null,
        duration: { [Op.gte]: 3 },
        processingState: RecordingProcessingState.Finished,
        recordingDateTime: { [Op.gt]: earliestTime },
      },
      order: [["recordingDateTime", "ASC"]],
    });
    if (!recording) {
      break;
    }
    const visits = await Visit.rebuildForRecording(recording);
    visits.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
    if (visits.length > 0) {
      if (
        Math.abs(visits[0].endTime.getTime() - earliestTime.getTime()) >
        1000 * 60 * 60 * 24
      ) {
        log.info(
          `#${recording.id}(${recording.GroupId}/${recording.StationId}): ${recording.recordingDateTime.toISOString()}`,
        );
      }
      earliestTime = visits[0].endTime;
    } else {
      throw new Error(`No visits calculated for recording ${recording.id}`);
    }
  }
};

const updateAll = async (groups: Group[] = []): Promise<void> => {
  const startTime = Date.now();
  if (groups.length === 0) {
    groups = await Group.findAll({ order: [["id", "asc"]], where: {} });
  }
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
      log.info(
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
  const endTime = Date.now();
  log.info(
    `Backfill took ${((endTime - startTime) / 1000 / 60).toFixed(2)}mins`,
  );
};

(async () => {
  await initSequelize(true);

  // const group = await Group.findOne({
  //   where: {
  //     groupName: "orton bradley park",
  //   },
  // });
  //await updateAll([group]);

  await updateAll();
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
