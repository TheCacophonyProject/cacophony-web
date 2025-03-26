import process from "process";
import type { DeviceId, GroupId } from "@typedefs/api/common.js";
import modelsInit from "@models/index.js";
import { QueryTypes } from "sequelize";
import type { DeviceHistorySetBy } from "@models/DeviceHistory.js";
import { getTrackData } from "@models/Track.js";
const models = await modelsInit();
const HEIGHT = 120;
const WIDTH = 160;
const BOX_DIM = 10;

const rows = Math.ceil(HEIGHT / BOX_DIM);
const columns = Math.ceil(WIDTH / BOX_DIM);

async function main() {
  const devices = await getDeviceLocation();
  for (const devHistory of devices) {
    const { DeviceId: deviceId, GroupId: groupId, location } = devHistory;
    const earliestDateTimeAtLocation =
      await models.DeviceHistory.getEarliestFromDateTimeForDeviceAtCurrentLocation(
        deviceId,
        groupId
      );
    if (earliestDateTimeAtLocation) {
      const rodentQ = await getRodentData(
        deviceId,
        location,
        earliestDateTimeAtLocation
      );
      let currentDevice = null;
      if (rodentQ.length === 0) {
        continue;
      }
      let latestHumanTaggedRodentDateTime = 0;
      for (const rodentTaggedRecording of rodentQ) {
        const tagTime = new Date(rodentTaggedRecording["updatedAt"]).getTime();
        if (tagTime > latestHumanTaggedRodentDateTime) {
          latestHumanTaggedRodentDateTime = tagTime;
        }
      }
      const latestDeviceHistoryEntry = await models.DeviceHistory.latest(
        deviceId,
        groupId
      );
      const latestRatThreshTime =
        (latestDeviceHistoryEntry.settings &&
          latestDeviceHistoryEntry.settings.ratThresh?.version) ||
        0;
      if (latestHumanTaggedRodentDateTime > latestRatThreshTime) {
        // Update the ratThresh
        const gridData = [...Array(rows)].map((_e) =>
          [...Array(columns)].map((_e) => Array())
        );
        // get x, y values for each track
        for (const rodentRec of rodentQ) {
          rodentRec["data"] = await getTrackData(rodentRec["id"]);
          const positions = rodentRec["data"]["positions"].filter(
            (x) => x["mass"] > 0 && !x["blank"]
          );
          if (!currentDevice) {
            currentDevice = {
              uuid: rodentRec["uuid"],
              location: rodentRec["location"],
              trackData: getGridData(
                rodentRec["id"],
                rodentRec["what"],
                positions,
                gridData
              ),
            };
          } else {
            // merge data
            getGridData(
              rodentRec["id"],
              rodentRec["what"],
              positions,
              currentDevice.trackData
            );
          }
        }

        const thresholds = getThresholds(currentDevice.trackData);
        let setBy: DeviceHistorySetBy = "user";
        if (latestDeviceHistoryEntry.settings?.synced) {
          setBy = "automatic";
        }
        await models.DeviceHistory.updateDeviceSettings(
          deviceId,
          groupId,
          {
            ratThresh: {
              gridSize: BOX_DIM,
              version: latestHumanTaggedRodentDateTime, // This should be the date of the latest rodent data.
              thresholds,
            },
          },
          setBy
        );
      }
    }
  }
}
const MEDIAN_THRESH = 1.8;
const MINPOINTS = 2;
// calculate median of all data before hand if new point is above a certain percentage of previous median, this change indicates a mouse vs rat
// only bother using data we dont know about i.e. tagged as rodent
function getThresholds(gridData) {
  const thresholds = [...Array(rows)].map((_e) => [...Array(columns)]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      thresholds[y][x] = null;
      const sorted = gridData[y][x].sort(function (a, b) {
        return a.threshold - b.threshold;
      });
      let ratStart = null;
      let unknownStart = 0;
      // This doesn't take into account outliers but best to predict more rats
      // otherwise could look for 2 consecutive rat tags or a #of rat tags
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].tag == "rat") {
          ratStart = i;
          break;
        } else if (sorted[i].tag == "mouse") {
          unknownStart = i + 1;
        }
      }
      let ratIndex = null;

      for (let i = unknownStart; i < sorted.length; i++) {
        const prevMedian = quantile(
          sorted.slice(0, i).map((data) => data.threshold),
          0.5,
          true
        );
        if (
          i == ratStart ||
          (sorted[i].threshold / prevMedian >= MEDIAN_THRESH && i > MINPOINTS)
        ) {
          ratIndex = i;
          break;
        }
      }
      if (ratIndex == null) {
        thresholds[y][x] = null;
      } else {
        if (ratIndex == 0) {
          thresholds[y][x] = Math.max(1, sorted[ratIndex].threshold * 0.8);
        } else {
          thresholds[y][x] = sorted[ratIndex - 1].threshold;
        }
      }
    }
  }
  return thresholds;
}

const quantile = (arr, q, isSorted = false) => {
  let sorted;
  if (isSorted) {
    sorted = arr;
  } else {
    sorted = arr.sort(function (a, b) {
      return a - b;
    });
  }
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
};
function getGridData(u_id: number, tag: string, positions, existingGridData) {
  const gridData = [...Array(rows)].map((_e) =>
    [...Array(columns)].map((_e) => Array())
  );

  for (const p of positions) {
    const xStart = Math.floor(p["x"] / BOX_DIM);
    const xEnd = Math.floor((p["x"] + p["width"]) / BOX_DIM);
    const yStart = Math.floor(p["y"] / BOX_DIM);
    const yEnd = Math.floor((p["y"] + p["height"]) / BOX_DIM);
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        gridData[y][x].push(p["mass"]);
      }
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const masses = gridData[y][x];
      if (masses.length == 0) {
        continue;
      }
      existingGridData[y][x].push({
        tag: tag,
        id: u_id,
        threshold: quantile(masses, 0.8),
      });
    }
  }
  return existingGridData;
}

interface DeviceHistoryItem {
  GroupId: GroupId;
  DeviceId: DeviceId;
  location: { type: "Point"; coordinates: [number, number] };
}
async function getDeviceLocation(): Promise<DeviceHistoryItem[]> {
  return models.sequelize.query(
    `
    select distinct on
      (dh."uuid") dh."DeviceId",
      dh."GroupId",
      dh."uuid",
      dh."location",
      dh."fromDateTime"
    from
      "DeviceHistory" dh
    where dh."location" is not null
    order by
      dh."uuid" ,
      dh."fromDateTime" desc
  `,
    { type: QueryTypes.SELECT }
  ) as Promise<DeviceHistoryItem[]>;
}

async function getRodentData(
  deviceId: DeviceId,
  location: { type: "Point"; coordinates: [number, number] },
  fromDateTime: Date
) {
  const locQuery = `ST_Y(r."location") = ${location.coordinates[1]} and ST_X(r."location") = ${location.coordinates[0]}`;
  return await models.sequelize.query(
    `
    select
      r."recordingDateTime",
      r."DeviceId",
      t.id,
      r."location",     
      tt."what",
      tt."updatedAt"
    from
      "TrackTags" tt
      right join "Tracks" t on
      tt."TrackId" = t.id
      right join "Recordings" r on
      t."RecordingId" = r.id
    where
      r."DeviceId" = '${deviceId}'
      and ${locQuery}
      and r."recordingDateTime" > '${fromDateTime.toISOString()}'
      and tt.automatic = false
      and tt.path <@'all.mammal.rodent'
    order by
      r."DeviceId",
      r."recordingDateTime" desc
    `,
    { type: QueryTypes.SELECT }
  );
}

main()
  .catch((err) => {
    console.trace(err);
  })
  .then(() => {
    process.exit(0);
  });
