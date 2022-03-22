import registerAliases from "../module-aliases";
registerAliases();
import config from "@config";
import log from "@log";
import models from "@models";
import { Client } from "pg";
import process from "process";
import { maybeUpdateDeviceHistory } from "@api/V1/recordingUtil";
import { Station } from "@models/Station";

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

  for (const { saltId } of saltIds.rows) {
    // Find all versions of the device with this saltId
    const devices = await models.Device.findAll({ where: { saltId } });
    for (const device of devices) {
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
            select distinct on ("DeviceId", location)            
                (select pt[1] from (select point(location) as pt) as x) as lat,
                (select pt[0] from (select point(location) as pt) as x) as lng,
                "recordingDateTime"
            from
                "Recordings"
            where
                "DeviceId" = ${device.id}
                and location is not null
            order by
                "DeviceId",
                "location",
                "recordingDateTime" asc;
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
      // Now that we have "complete" device history, we should be able to create and assign stations automatically.

      // Get all the histories for the device:
      // const historyEntries = await models.DeviceHistory.findAll({ where: {
      //     DeviceId: device.id
      // }});
      // for (const history of historyEntries) {
      //     if (history.location !== null) {
      //         const newStation = (await models.Station.create({
      //             name: `New station for ${device.devicename}_${history.fromDateTime.toISOString()}`,
      //             location: history.location,
      //             activeAt: history.fromDateTime,
      //             automatic: true,
      //         })) as Station;
      //     }
      // }
      //break;
    }
    //break;
  }
}

main()
  .catch(log.error)
  .then(() => {
    process.exit(0);
  });
