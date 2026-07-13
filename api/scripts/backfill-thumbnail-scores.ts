import { initSequelize } from "@models/index.js";
import log from "@log";
import { Group } from "@models/Group.js";
import { Device } from "@models/Device.js";
import { Recording } from "@models/Recording.js";
import { Op } from "sequelize";
import { RecordingType } from "@typedefs/api/consts.js";
import { Track } from "@models/Track.js";
import type { MinimalTrackRequestData } from "@typedefs/api/fileProcessing.js";

const updateThumbnailScoresForRecording = async (recording: Recording) => {
  const tracks = await Track.findAll({
    where: {
      RecordingId: recording.id,
    },
  });
  for (const track of tracks) {
    if (track.thumbnailScore === null) {
      const data = (await Track.getTrackData(
        track.id,
      )) as MinimalTrackRequestData;
      if (data.thumbnail?.score) {
        await track.update({ thumbnailScore: data.thumbnail.score });
      }
    }
  }
};

const updateDevice = async (device: Device) => {
  const oldestRecording = await Recording.findOne({
    where: {
      DeviceId: device.id,
      type: RecordingType.ThermalRaw,
    },
    order: [["createdAt", "ASC"]],
  });
  if (oldestRecording) {
    let hasRecordings = true;
    let oldestTime = new Date(oldestRecording.createdAt);
    oldestTime.setHours(oldestTime.getHours() - 1);
    while (hasRecordings) {
      const recordings = await Recording.findAll({
        where: {
          DeviceId: device.id,
          createdAt: { [Op.gt]: oldestTime },
          type: RecordingType.ThermalRaw,
        },
        order: [["createdAt", "ASC"]],
        limit: 100,
      });
      if (!recordings || recordings.length === 0) {
        hasRecordings = false;
        break;
      } else {
        const nextOldestTime = new Date(
          recordings[recordings.length - 1].createdAt,
        );
        console.log(`updating ${oldestTime} - ${nextOldestTime}`);
        oldestTime = nextOldestTime;
      }
      const updates = [];
      for (const recording of recordings) {
        updates.push(updateThumbnailScoresForRecording(recording));
      }
      await Promise.all(updates);
    }
  }
};

const updateAll = async (): Promise<void> => {
  const groups = await Group.findAll();
  for (const group of groups) {
    const devices = await Device.findAll({
      where: {
        GroupId: group.id,
      },
    });
    for (const device of devices) {
      console.log(
        `updating track data for device ${device.id} (${device.deviceName}) in ${group.groupName}`,
      );
      await updateDevice(device);
    }
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
  await updateAll();

  /*
  const group = await Group.findOne({
    where: {
      groupName: "orton bradley park",
    },
  });
  const devices = await Device.findAll({
    where: {
      GroupId: group.id,
    },
  });
  for (const device of devices) {
    console.log(
      `updating track data for device ${device.id} (${device.deviceName}) in ${group.groupName}`,
    );
    await updateDevice(device);
  }
   */
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
