import { initSequelize } from "@models/index.js";
import log from "@log";
import { updateRecordingTimeBookkeeping } from "@api/V1/recordingUtil.js";
import { Visit } from "@models/Visit.js";
import { Recording } from "@models/Recording.js";
(async () => {
  await initSequelize(true);
  const args = process.argv.slice(2); // Remove the first two default paths
  if (!args.includes("--recordingId") || args.length !== 2) {
    throw new Error("No recording id specified");
  }
  const recordingId = Number(args[1]);
  if (recordingId) {
    const recording = await Recording.findByPk(recordingId);
    await recording.update({
      deletedAt: null,
      deletedBy: null,
    });
    await Promise.all([
      updateRecordingTimeBookkeeping(recording),
      Visit.rebuildForRecording(recording),
    ]);
  }
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
