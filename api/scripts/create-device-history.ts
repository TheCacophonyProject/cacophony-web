import registerAliases from "../module-aliases";
registerAliases();
import config from "@config";
import log from "@log";
import models from "@models";
import { Client } from "pg";
import process from "process";
import { maybeUpdateDeviceHistory } from "@api/V1/recordingUtil";
import { Op } from "sequelize";
import { RecordingType } from "@typedefs/api/consts";

const dbOptions = (config) => ({
  host: config.host,
  user: config.username,
  password: config.password,
  database: config.database,
});

async function main() {
  // For each device.
  // Find all versions of the device with its saltId
  const pgClient = new Client(dbOptions(config.database));
  await pgClient.connect();
  const saltIds = await pgClient.query(
    `select distinct "saltId" from "Devices";`
  );

  const allConfigUpdatesToLocation = await pgClient.query(`
    select distinct
        (details->'device'->>'id')::int as device_id,
        details->'device'->'updated' as updated_at,
        details->'location'->'latitude' as lat,
        details->'location'->'longitude' as lng
    from
        "DetailSnapshots"
    where
        type = 'config'
        and details->'location' != 'null'
        and details->'location'->'latitude' != 'null'
        and details->'location'->'longitude' != 'null'
        and details->'device'->'id' != 'null'
    `);

  // FIXME: Already created stations should have their activeAt dates extended back to the first recordingTime for the device.

  const allDevices = [];
  for (const { saltId } of saltIds.rows) {
    // Find all versions of the device with this saltId
    const devices = await models.Device.findAll({ where: { saltId } });
    allDevices.push(...devices);
  }

  const devicesAndTimes = allDevices.map((device) => ({ device, time: null }));
  for (const deviceAndTime of devicesAndTimes) {
    const firstLocationRecordingTimeForDevice = await pgClient.query(`
      select
        "recordingDateTime"
      from
        "Recordings"
      where
        "DeviceId" = ${deviceAndTime.device.id}
        and location is not null
      order by
        "recordingDateTime" asc
        limit 1;
    `);
    if (firstLocationRecordingTimeForDevice.rows.length) {
      deviceAndTime.time = new Date(
        firstLocationRecordingTimeForDevice.rows[0].recordingDateTime
      ).getTime();
    }
  }

  devicesAndTimes.sort((a, b) => {
    return a.time - b.time;
  });

  for (const device of devicesAndTimes.map(({ device }) => device)) {
    // For each device, find any "config" events.  Apply locations from those events.
    const configChangesForDevice = allConfigUpdatesToLocation.rows.filter(
      ({ device_id }) => device_id === device.id
    );
    for (const configChangeForDevice of configChangesForDevice) {
      if (
        Number(configChangeForDevice.lat) !== 0 &&
        Number(configChangeForDevice.lng) !== 0
      ) {
        await maybeUpdateDeviceHistory(
          device,
          {
            lat: configChangeForDevice.lat,
            lng: configChangeForDevice.lng,
          },
          new Date(configChangeForDevice.updated_at),
          "config"
        );
      }
    }
    const automaticLocationChangesForDevice = await pgClient.query(`
      select * from (
          select distinct
           on ("DeviceId", location)
             ST_Y(location) as lat,
             ST_X(location) as lng,
             "recordingDateTime"
           from
             "Recordings"
           where
             "DeviceId" = ${device.id}
             and location is not null
           order by
             "DeviceId",
             "location",
             "recordingDateTime" asc
          ) 
          as a order by "recordingDateTime" asc;
        `);

    // For each device, get all recording location changes for the device, and update the device history table
    for (const automaticLocationChangeForDevice of automaticLocationChangesForDevice.rows) {
      if (
        Number(automaticLocationChangeForDevice.lat) !== 0 &&
        Number(automaticLocationChangeForDevice.lng) !== 0
      ) {
        await maybeUpdateDeviceHistory(
          device,
          {
            lat: automaticLocationChangeForDevice.lat,
            lng: automaticLocationChangeForDevice.lng,
          },
          new Date(automaticLocationChangeForDevice.recordingDateTime),
          "automatic"
        );
      }
    }
    // Now that we have "complete" device history, we should be able to stations to recordings.
    // Get all the histories for the device:
    const historyEntries = await models.DeviceHistory.findAll({
      where: {
        DeviceId: device.id,
        location: { [Op.ne]: null },
      },
      order: [["fromDateTime", "ASC"]],
    });

    for (let i = 0; i < historyEntries.length; i++) {
      // Update all the recordings in this time period for this device with the stationId.
      const history = historyEntries[i];
      let nextEntry;
      if (i + 1 < historyEntries.length) {
        nextEntry = historyEntries[i + 1];
      }
      const recordingTimeWindow = nextEntry
        ? {
            [Op.and]: [
              { [Op.gte]: history.fromDateTime },
              { [Op.lt]: nextEntry.fromDateTime },
            ],
          }
        : { [Op.gte]: history.fromDateTime };
      await models.Recording.update(
        { StationId: history.stationId },
        {
          where: {
            DeviceId: history.DeviceId,
            location: { [Op.ne]: null },
            recordingDateTime: recordingTimeWindow,
          },
        }
      );
    }
    // Update device lastRecordingTime and kind
    const latestRecordingForDevice = await models.Recording.findOne({
      where: {
        DeviceId: device.id,
      },
      order: [["recordingDateTime", "DESC"]],
    });
    if (latestRecordingForDevice) {
      await device.update({
        lastRecordingTime: latestRecordingForDevice.recordingDateTime,
        kind:
          latestRecordingForDevice.type === "thermalRaw" ? "thermal" : "audio",
      });
    }
  }
  // Update device last(Thermal|Audio)RecordingTime for stations
  const allStationsPerDeviceType = await pgClient.query(`
      select distinct
        on ("StationId", type)
        "StationId",
            type,
            "recordingDateTime"                
        from
            "Recordings"
        where           
          location is not null               
        order by                 
            "StationId", type, "recordingDateTime" desc;
  `);
  for (const recording of allStationsPerDeviceType.rows) {
    if (recording.type === RecordingType.ThermalRaw) {
      await pgClient.query(
        `update "Stations" set "lastThermalRecordingTime" = '${recording.recordingDateTime.toISOString()}' where "id" = ${
          recording.StationId
        }`
      );
    } else if (recording.type === RecordingType.Audio) {
      await pgClient.query(
        `update "Stations" set "lastAudioRecordingTime" = '${recording.recordingDateTime.toISOString()}' where "id" = ${
          recording.StationId
        }`
      );
    }
  }
  // Update device last(Thermal|Audio)RecordingTime for groups
  const allGroupsPerDeviceType = await pgClient.query(`
      select distinct
        on ("GroupId", type)
        "GroupId",
            type,
            "recordingDateTime"                
        from
            "Recordings"
        where           
          location is not null               
        order by                 
            "GroupId", type, "recordingDateTime" desc;
  `);
  for (const recording of allGroupsPerDeviceType.rows) {
    if (recording.type === RecordingType.ThermalRaw) {
      await pgClient.query(
        `update "Groups" set "lastThermalRecordingTime" = '${recording.recordingDateTime.toISOString()}' where "id" = ${
          recording.GroupId
        }`
      );
    } else if (recording.type === RecordingType.Audio) {
      await pgClient.query(
        `update "Groups" set "lastAudioRecordingTime" = '${recording.recordingDateTime.toISOString()}' where "id" = ${
          recording.GroupId
        }`
      );
    }
  }
}

main()
  .catch(log.error)
  .then(() => {
    process.exit(0);
  });
