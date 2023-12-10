import process from "process";
import { program } from "commander";
import pkg from "pg";
const { Client } = pkg;
import * as config from "../config.js";
let Config;

const HEIGHT = 120;
const WIDTH = 160;
const BOX_DIM = 10;

const rows = Math.ceil(HEIGHT / BOX_DIM);
const columns = Math.ceil(WIDTH / BOX_DIM);

async function main() {
  program
    .option("--config <path>", "Configuration file", "./config/app.js")
    .parse(process.argv);
  const options = program.opts();
  Config = {
    ...config.default,
    ...(await config.default.loadConfig(options.config)),
  };
  console.log("Connecting to db");
  const pgClient = await pgConnect();
  const devices = await getDeviceLocation(pgClient);
  for (const devHistory of devices.rows) {
    const rodentQ = await getRodentData(
      pgClient,
      devHistory["DeviceId"],
      devHistory["location"],
      devHistory["fromDateTime"]
    );
    // byDevice = {}
    let currentDevice = null;
    if (rodentQ.rows.length == 0) {
      continue;
    }

    const gridData = [...Array(rows)].map((e) =>
      [...Array(columns)].map((e) => Array())
    );
    // get x ,y values for each track
    for (const rodentRec of rodentQ.rows) {
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
    let settings = devHistory["settings"];
    if (!settings) {
      settings = {};
    }
    settings["ratThresh"] = {
      gridSize: BOX_DIM,
      version: Date.now(),
      thresholds: thresholds,
    };
    devHistory["settings"] = settings;
    console.log(
      "Updating device History",
      devHistory["uuid"],
      " with ",
      devHistory["settings"]
    );
    await updateDeviceHistory(
      pgClient,
      devHistory["uuid"],
      devHistory["fromDateTime"],
      devHistory["settings"]
    );
  }
}
const MEDIAN_THRESH = 1.8;
const MINPOINTS = 2;
// calculate median of all data before hand if new point is above a certain percentage of previous median, this change indicates a mouse vs rat
// only bother using data we dont know about i.e. tagged as rodent
function getThresholds(gridData) {
  const thresholds = [...Array(rows)].map((e) => [...Array(columns)]);
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
function getGridData(u_id, tag, positions, existingGridData) {
  const gridData = [...Array(rows)].map((e) =>
    [...Array(columns)].map((e) => Array())
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

function overlap_rect(region, grid) {
  const x_overlap = overlap(
    [region["x"], region["x"] + region["width"]],
    [grid[0], grid[0] + grid[2]]
  );
  const y_overlap = overlap(
    [region["y"], region["y"] + region["height"]],
    [grid[1], grid[1] + grid[3]]
  );
  return x_overlap > 0 && y_overlap > 0;
}

function overlap(first, second) {
  return (
    first[1] -
    first[0] +
    (second[1] - second[0]) -
    (Math.max(first[1], second[1]) - Math.min(first[0], second[0]))
  );
}

async function updateDeviceHistory(client, uuid, fromDateTime, settings) {
  const res = await client.query(
    `update "DeviceHistory" set "settings" = $1 where "uuid"= $2 and "fromDateTime"= $3`,
    [settings, uuid, fromDateTime]
  );
}

async function getDeviceLocation(client) {
  const res = await client.query(
    `select distinct on (dh."uuid") dh."DeviceId",dh."uuid", dh."location",dh."fromDateTime" from "DeviceHistory" dh  order by dh."uuid" ,dh."fromDateTime"  desc`
  );
  return res;
}
async function getRodentData(client, deviceId, location, fromDateTime) {
  let locQuery = "";
  if (location) {
    locQuery = `r."location"='${location}'`;
  } else {
    locQuery = `r."location" is null`;
  }
  const res = await client.query(
    `select r."recordingDateTime",
r."DeviceId" ,t.id,r."location" ,t.data,tt."what"
from
	"TrackTags" tt
right join "Tracks" t on
	tt."TrackId" = t.id
right join "Recordings" r on t."RecordingId"  = r.id
where
r."DeviceId"='${deviceId}' and ${locQuery} and r."recordingDateTime" > '${fromDateTime.toISOString()}' and
tt.automatic =false and
	tt.path <@'all.mammal.rodent' order by r."DeviceId",r."recordingDateTime" desc`
  );
  return res;
}

async function pgConnect() {
  const dbconf = Config.database;
  const client = new Client({
    host: dbconf.host,
    port: dbconf.port,
    user: dbconf.username,
    password: dbconf.password,
    database: dbconf.database,
  });
  await client.connect();
  return client;
}

main()
  .catch((err) => {
    console.log(err);
  })
  .then(() => {
    process.exit(0);
  });
