import process from "process";
import { program } from "commander";
import pkg from "pg";
const { Client } = pkg;
import * as config from "../config.js";
let Config;
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

  const audioRecs = await loadAudioIds(pgClient);
  console.log("Loaded ", audioRecs.size, " audio recs");
  const sampleRate = 44100;
  const topFreq = sampleRate / 2;
  const scale = topFreq / 9;
  let completed = 0;
  for (const r of audioRecs) {
    const tracks = await geTracks(pgClient, r);
    for (const t of tracks.rows) {
      const data = t["data"];
      if (data["scale"] == "linear") {
        continue;
      } else {
        const positions = data["positions"];
        let index = 0;
        if (positions.length == 2) {
          index = 1;
        }
        const pos = positions[index];
        let y = pos["y"];
        const height = pos["height"];
        let linearY;
        let linearHeight;
        if (y == 0 && height == 1) {
          linearY = 0;
          linearHeight = 1;
        } else {
          y = 1 - y;
          // flip it so origin is 0,0 and y is minFreq
          let maxFreq = Math.pow(10, y) - 1;
          maxFreq = maxFreq * scale;
          let minFreq = y - height;
          minFreq = Math.pow(10, minFreq) - 1;
          minFreq = minFreq * scale;

          linearY = minFreq / topFreq;
          linearHeight = (maxFreq - minFreq) / topFreq;
        }
        pos["y"] = linearY;
        pos["height"] = linearHeight;
        data["scale"] = "linear";
        await updateTrack(pgClient, t["id"], data);
      }
    }
    completed += 1;
    if (completed % 50 == 0) {
      console.log(`Converted ${completed} / ${audioRecs.size}`);
    }
  }
}
async function updateTrack(client, t_id, data) {
  const res = await client.query(
    `update "Tracks" set "data" = $1 where "id"= $2`,
    [data, t_id],
  );
  return res;
}

async function geTracks(client, r_id) {
  const res = await client.query(
    `select id,data from "Tracks" t where "RecordingId" = '${r_id}'`,
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
async function loadAudioIds(client) {
  const keys = new Set();
  const res = await client.query(
    `select "id" from "Recordings" where type='audio' order by id desc`,
  );
  for (const row of res.rows) {
    keys.add(row["id"]);
  }
  return keys;
}
main()
  .catch((err) => {
    console.log(err);
  })
  .then(() => {
    process.exit(0);
  });
