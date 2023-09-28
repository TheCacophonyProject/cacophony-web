import process from "process";
import { program } from "commander";
import pkg from "pg";
const { Client } = pkg;
import * as config from "../config.js";
let Config;
const MAX_FRQUENCY = 48000 / 2

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

  let completed = 0;
  for (const r of audioRecs) {
    const tracks = await geTracks(pgClient, r);
    for (const t of tracks.rows) {
        const trackTags = await geTrackTags(pgClient, t["id"]);
        let foundMore = false
        for(const tag of trackTags.rows){
          if (typeof tag["data"] !== 'object'){
               continue
           }

          if (!("name" in tag["data"])){
            continue
          }

          if (tag["data"]["name"]=='morepork'){
            foundMore = true;
            break
          }
        }
        if (!foundMore){
          continue
        }
        const data = t["data"];
        const pos = data["positions"][0]
        if (data["positions"][0]["height"] != 1){
        // already updated
          continue
        }
        console.log("Updating ai more pork for", r,t["id"])
        let y = 600 / MAX_FRQUENCY
        let height = (1200-600  ) / MAX_FRQUENCY
        data["positions"][0]["y"]=y
        data["positions"][0]["height"]=height
        data["minFreq"] = 600;
        data["maxFreq"] = 1200;
        await updateTrack(pgClient, t["id"], data);
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
    [data, t_id]
  );
  return res;
}
async function geTrackTags(client, t_id) {
  const res = await client.query(
    `select id,data from "TrackTags" t where "TrackId" = '${t_id}'`
  );
  return res;
}

async function geTracks(client, r_id) {
  const res = await client.query(
    `select id,data from "Tracks" t where "RecordingId" = '${r_id}'`
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
    `select "id" from "Recordings" where type='audio' order by id desc`
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
