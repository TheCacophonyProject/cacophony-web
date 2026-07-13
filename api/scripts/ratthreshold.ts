import process from "process";
import type {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  RecordingId,
  TrackId,
} from "@typedefs/api/common.js";
import { initSequelize } from "@models/index.js";
import { QueryTypes } from "sequelize";
import { DeviceHistory } from "@models/DeviceHistory.js";
import { Track } from "@models/Track.js";
import os from "os";
import config from "@config";
import { DeviceHistorySetBy } from "@typedefs/api/device.js";
import {
  MinimalTrackRequestData,
  TrackFramePosition,
} from "@typedefs/api/fileProcessing.js";
const sequelize = await initSequelize(true);
const HEIGHT = 120;
const WIDTH = 160;
const BOX_DIM = 10;

const NUM_ROWS = Math.ceil(HEIGHT / BOX_DIM);
const NUM_COLUMNS = Math.ceil(WIDTH / BOX_DIM);

async function main() {
  const args = process.argv.slice(2); // Remove the first two default paths
  const forceRun = args.length !== 0 && args[0] === "--force";
  if (config.cronScriptProcessingHostname !== os.hostname() && !forceRun) {
    return;
  }
  const devices = await getDeviceLocation();
  for (const devHistory of devices) {
    const { DeviceId: deviceId, GroupId: groupId, location } = devHistory;
    const earliestDateTimeAtLocation =
      await DeviceHistory.getEarliestFromDateTimeForDeviceAtCurrentLocation(
        deviceId,
        groupId,
      );
    if (earliestDateTimeAtLocation) {
      const rodentQ = await getRodentData(
        deviceId,
        location,
        earliestDateTimeAtLocation,
      );
      let currentDeviceTrackData = null;
      if (rodentQ.length === 0) {
        continue;
      }
      let latestHumanTaggedRodentDateTime = 0;
      for (const rodentTaggedRecording of rodentQ) {
        latestHumanTaggedRodentDateTime = Math.max(
          latestHumanTaggedRodentDateTime,
          new Date(rodentTaggedRecording.updatedAt).getTime(),
        );
      }
      // An assumption is made that the latest entry is still in the same location as the `earliestDateTimeAtLocation`
      const latestDeviceHistoryEntry =
        await DeviceHistory.latestWithAnyLocationAtTime(
          deviceId,
          groupId,
          new Date(),
        );
      const latestRatThreshTime =
        (latestDeviceHistoryEntry.settings &&
          latestDeviceHistoryEntry.settings.ratThresh?.version) ||
        0;
      if (latestHumanTaggedRodentDateTime > latestRatThreshTime) {
        // Update the ratThresh
        const gridData = [...Array(NUM_ROWS)].map((_e) =>
          [...Array(NUM_COLUMNS)].map((_e) => [] as GridDataCell[]),
        );
        // get x, y values for each track
        for (const rodentRec of rodentQ) {
          rodentRec.data = (await Track.getTrackData(
            rodentRec.id,
          )) as MinimalTrackRequestData;
          if ("positions" in rodentRec.data) {
            const positions = rodentRec.data.positions.filter(
              (x) => x.mass > 0 && !x.blank,
            );
            if (!currentDeviceTrackData) {
              currentDeviceTrackData = getGridData(
                rodentRec.id,
                rodentRec.what,
                positions,
                gridData,
              );
            } else {
              // merge data
              getGridData(
                rodentRec.id,
                rodentRec.what,
                positions,
                currentDeviceTrackData,
              );
            }
          }
        }
        if (currentDeviceTrackData) {
          const thresholds = getThresholds(currentDeviceTrackData);
          let allNull = true;
          outer: for (const threshold of thresholds) {
            for (const item of threshold) {
              if (item !== null) {
                allNull = false;
                break outer;
              }
            }
          }
          if (!allNull || forceRun) {
            let setBy: DeviceHistorySetBy = "user";
            if (latestDeviceHistoryEntry.settings?.synced) {
              setBy = "automatic";
            }
            await DeviceHistory.updateDeviceSettings(
              deviceId,
              groupId,
              {
                ratThresh: {
                  gridSize: BOX_DIM,
                  version: latestHumanTaggedRodentDateTime, // This should be the date of the latest rodent data.
                  thresholds,
                },
              },
              setBy,
              new Date(),
            );
          }
        }
      }
    }
  }
}
const MEDIAN_THRESH = 1.8;
const MINPOINTS = 2;
// calculate median of all data before hand if new point is above a certain percentage of
// previous median, this change indicates a mouse vs rat.
// Only bother using data we don't know about i.e. tagged as rodent
function getThresholds(gridData: GridDataCell[][][]) {
  const thresholds = [...Array(NUM_ROWS)].map((_e) => [...Array(NUM_COLUMNS)]);
  for (let y = 0; y < NUM_ROWS; y++) {
    for (let x = 0; x < NUM_COLUMNS; x++) {
      thresholds[y][x] = null;
      const sorted = [...gridData[y][x]].sort(function (a, b) {
        return a.threshold - b.threshold;
      });
      let ratStart = null;
      let unknownStart = 0;
      // This doesn't take into account outliers but best to predict more rats
      // otherwise could look for 2 consecutive rat tags or a #of rat tags
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].tag.includes("rat")) {
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
          true,
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

const quantile = (arr: number[], q: number, isSorted = false) => {
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
interface GridDataCell {
  tag: string;
  id: RecordingId;
  threshold: number;
}
function getGridData(
  recordingId: RecordingId,
  tag: string,
  positions: TrackFramePosition[],
  existingGridData: GridDataCell[][][],
) {
  const gridData = [...Array(NUM_ROWS)].map((_e) =>
    [...Array(NUM_COLUMNS)].map((_e) => [] as number[]),
  );

  for (const p of positions) {
    const { x, y, width, height, mass } = p;
    const xStart = Math.floor(x / BOX_DIM);
    const xEnd = Math.floor((x + width) / BOX_DIM);
    const yStart = Math.floor(y / BOX_DIM);
    const yEnd = Math.floor((y + height) / BOX_DIM);
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        gridData[y][x].push(mass);
      }
    }
  }
  for (let y = 0; y < NUM_ROWS; y++) {
    for (let x = 0; x < NUM_COLUMNS; x++) {
      const masses = gridData[y][x];
      if (masses.length == 0) {
        continue;
      }
      existingGridData[y][x].push({
        tag,
        id: recordingId,
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
  return sequelize.query(
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
      dh."uuid",
      dh."fromDateTime" desc,
      dh."id" desc
  `,
    { type: QueryTypes.SELECT },
  ) as Promise<DeviceHistoryItem[]>;
}

interface DbLocation {
  type: "Point";
  coordinates: [number, number];
}

async function getRodentData(
  deviceId: DeviceId,
  location: DbLocation,
  fromDateTime: Date,
) {
  const locQuery = `ST_Y(r."location") = ${location.coordinates[1]} and ST_X(r."location") = ${location.coordinates[0]}`;
  return (await sequelize.query(
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
      and r."recordingDateTime" >= '${fromDateTime.toISOString()}'
      and tt.automatic = false
      and tt.path <@'all.mammal.rodent'
    order by
      r."DeviceId",
      r."recordingDateTime" desc
    `,
    { type: QueryTypes.SELECT },
  )) as unknown as {
    recordingDateTime: IsoFormattedDateString;
    DeviceId: DeviceId;
    id: TrackId;
    location: DbLocation;
    what: string;
    updatedAt: IsoFormattedDateString;
    data?: MinimalTrackRequestData;
  }[];
}

main()
  .catch((err) => {
    console.trace(err);
  })
  .then(() => {
    process.exit(0);
  });
