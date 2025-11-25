import log from "@log";
import { initSequelize } from "@models/index.js";
import { Op } from "sequelize";
import { RecordingType } from "@typedefs/api/consts.js";
import { Station } from "@models/Station.js";
import { Group } from "@models/Group.js";
import { Device } from "@models/Device.js";
import { Recording } from "@models/Recording.js";
await initSequelize();
(async () => {
  const stations = (await Station.findAll()) as Station[];
  for (const station of stations) {
    // Get the latest recording of each type.
    const cameraRecording = await Recording.findOne({
      where: {
        StationId: station.id,
        deletedAt: { [Op.eq]: null },
        duration: { [Op.gte]: 3 },
        type: {
          [Op.in]: [
            RecordingType.InfraredVideo,
            RecordingType.TrailCamVideo,
            RecordingType.TrailCamImage,
            RecordingType.ThermalRaw,
          ],
        },
      },
      attributes: ["recordingDateTime"],
      limit: 1,
      order: [["recordingDateTime", "desc"]],
    });

    const audioRecording = await Recording.findOne({
      where: {
        StationId: station.id,
        deletedAt: { [Op.eq]: null },
        type: RecordingType.Audio,
        duration: { [Op.gte]: 3 },
      },
      attributes: ["recordingDateTime"],
      limit: 1,
      order: [["recordingDateTime", "desc"]],
    });

    if (!cameraRecording) {
      await station.update({
        lastThermalRecordingTime: null,
        lastActiveThermalTime: null,
      });
    } else {
      if (
        !station.lastThermalRecordingTime ||
        station.lastThermalRecordingTime < cameraRecording.recordingDateTime
      ) {
        await station.update({
          lastThermalRecordingTime: cameraRecording.recordingDateTime,
        });
      }
      if (
        !station.lastActiveThermalTime ||
        station.lastActiveThermalTime < cameraRecording.recordingDateTime
      ) {
        await station.update({
          lastActiveThermalTime: cameraRecording.recordingDateTime,
        });
      }
    }

    if (!audioRecording) {
      await station.update({
        lastAudioRecordingTime: null,
        lastActiveAudioTime: null,
      });
    } else {
      if (
        !station.lastAudioRecordingTime ||
        station.lastAudioRecordingTime < audioRecording.recordingDateTime
      ) {
        await station.update({
          lastAudioRecordingTime: audioRecording.recordingDateTime,
        });
      }
      if (
        !station.lastActiveAudioTime ||
        station.lastActiveAudioTime < audioRecording.recordingDateTime
      ) {
        await station.update({
          lastActiveAudioTime: audioRecording.recordingDateTime,
        });
      }
    }
  }
  const groups = (await Group.findAll()) as Group[];
  for (const group of groups) {
    // Get the latest recording of each type.
    const cameraRecording = await Recording.findOne({
      where: {
        GroupId: group.id,
        deletedAt: { [Op.eq]: null },
        duration: { [Op.gte]: 3 },
        type: {
          [Op.in]: [
            RecordingType.InfraredVideo,
            RecordingType.TrailCamVideo,
            RecordingType.TrailCamImage,
            RecordingType.ThermalRaw,
          ],
        },
      },
      attributes: ["recordingDateTime"],
      limit: 1,
      order: [["recordingDateTime", "desc"]],
    });

    const audioRecording = await Recording.findOne({
      where: {
        GroupId: group.id,
        deletedAt: { [Op.eq]: null },
        duration: { [Op.gte]: 3 },
        type: RecordingType.Audio,
      },
      attributes: ["recordingDateTime"],
      limit: 1,
      order: [["recordingDateTime", "desc"]],
    });

    if (!cameraRecording) {
      await group.update({
        lastThermalRecordingTime: null,
      });
    } else {
      if (
        !group.lastThermalRecordingTime ||
        group.lastThermalRecordingTime < cameraRecording.recordingDateTime
      ) {
        await group.update({
          lastThermalRecordingTime: cameraRecording.recordingDateTime,
        });
      }
    }

    if (!audioRecording) {
      await group.update({
        lastAudioRecordingTime: null,
      });
    } else {
      if (
        !group.lastAudioRecordingTime ||
        group.lastAudioRecordingTime < audioRecording.recordingDateTime
      ) {
        await group.update({
          lastAudioRecordingTime: audioRecording.recordingDateTime,
        });
      }
    }
  }
  const devices = (await Device.findAll()) as Device[];
  for (const device of devices) {
    // Get the latest recording of each type.
    const cameraRecording = await Recording.findOne({
      where: {
        DeviceId: device.id,
        deletedAt: { [Op.eq]: null },
        duration: { [Op.gte]: 3 },
        type: {
          [Op.in]: [
            RecordingType.InfraredVideo,
            RecordingType.TrailCamVideo,
            RecordingType.TrailCamImage,
            RecordingType.ThermalRaw,
          ],
        },
      },
      attributes: ["recordingDateTime"],
      limit: 1,
      order: [["recordingDateTime", "desc"]],
    });

    const audioRecording = await Recording.findOne({
      where: {
        DeviceId: device.id,
        deletedAt: { [Op.eq]: null },
        type: RecordingType.Audio,
        duration: { [Op.gte]: 3 },
      },
      attributes: ["recordingDateTime"],
      limit: 1,
      order: [["recordingDateTime", "desc"]],
    });

    if (!cameraRecording && !audioRecording) {
      await device.update({
        lastRecordingTime: null,
      });
    } else {
      let latestTime: Date;
      if (cameraRecording && audioRecording) {
        if (
          cameraRecording.recordingDateTime < audioRecording.recordingDateTime
        ) {
          latestTime = audioRecording.recordingDateTime;
        } else {
          latestTime = cameraRecording.recordingDateTime;
        }
      } else if (cameraRecording) {
        latestTime = cameraRecording.recordingDateTime;
      } else if (audioRecording) {
        latestTime = audioRecording.recordingDateTime;
      }
      if (!device.lastRecordingTime || device.lastRecordingTime < latestTime) {
        await device.update({
          lastRecordingTime: latestTime,
        });
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
