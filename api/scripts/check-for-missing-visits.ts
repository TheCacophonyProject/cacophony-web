import { initSequelize } from "@models/index.js";
import log from "@log";
import { Recording } from "@models/Recording.js";
import { Op } from "sequelize";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import { Visit } from "@models/Visit.js";
import logging from "@log";
import process from "process";
import config from "@config";
import os from "os";

(async () => {
  const args = process.argv.slice(2); // Remove the first two default paths
  const forceRun = args.length !== 0 && args[0] === "--force";
  if (config.cronScriptProcessingHostname !== os.hostname() && !forceRun) {
    return;
  }

  await initSequelize(true);
  const oneHourAgo = new Date();
  oneHourAgo.setMinutes(oneHourAgo.getMinutes() - 60);
  const fiveMinutesAgo = new Date();
  fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
  const recordings = await Recording.findAll({
    where: {
      createdAt: { [Op.gt]: oneHourAgo },
      deletedAt: null,
      duration: { [Op.gt]: 2.5 },
      type: RecordingType.ThermalRaw,
      processingState: RecordingProcessingState.Finished,
      processingEndTime: { [Op.lt]: fiveMinutesAgo },
    },
  });
  const missedVisitRecordings: Recording[] = [];
  for (const recording of recordings) {
    const hasVisit = await Visit.findOne({
      where: {
        StationId: recording.StationId,
        recordingIds: {
          [Op.contains]: [recording.id],
        },
      },
    });
    if (!hasVisit) {
      missedVisitRecordings.push(recording);
    }
  }
  if (missedVisitRecordings.length > 0) {
    for (const recording of missedVisitRecordings) {
      const addSeconds = (startDate: Date, secs: number) => {
        const result = new Date(startDate);
        result.setSeconds(result.getSeconds() + secs);
        return result;
      };
      // Check that this is the *last* of the thermal recordings to be processed for this location, for
      // the visit window
      const otherRecordingsQueued = await Recording.findOne({
        where: {
          id: { [Op.ne]: recording.id },
          StationId: recording.StationId,
          processingState: {
            [Op.ne]: RecordingProcessingState.Finished,
          },
          deletedAt: null,
          recordingDateTime: {
            [Op.and]: [
              {
                [Op.lt]: addSeconds(
                  recording.recordingDateTime,
                  recording.duration + 600,
                ),
              },
              {
                [Op.gte]: addSeconds(recording.recordingDateTime, -1200),
              },
            ],
          },
          type: RecordingType.ThermalRaw,
        },
        attributes: ["id"],
      });
      if (!otherRecordingsQueued) {
        logging.info(`Rebuild visits for recording #${recording.id}`);
        await Visit.rebuildForRecording(recording);
      }
    }
  }
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
