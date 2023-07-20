import process from "process";
import { program } from "commander";
import { Client } from "pg";
import * as config from "../config.js";
import * as modelsUtil from "../models/util/util.js";

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

  const pgClient = await pgConnect();
  audioRecs = loadAudioIds(pgClient,"")
  const sampleRate = 44100
  const topFreq = sampleRate / 2;
  const scale = topFreq / 9;
  for( const r of audioRecs){

    const tracks = geTracks(client,r);
    for(const t of tracks.rows){
      console.log("Got track", t["id"], " for rec: ", r)
      const data = t["data"]

      // when in jsoin format
      if (data["scale"]== "linear"){
        continue
      }else{
        positions = data["positions"]
        index = 0
        if (positions.length ==2){
          index = 1
        }
        pos = positions[index]

        y = pos["y"]
        height = pos["height"]

        y = 1-y
        // flip it so origin is 0,0
        let maxFreq = Math.pow(10, y) - 1;
        const linearY = maxFreq / topFreq;
        let minFreq = y - height;
        minFreq = Math.pow(10, minFreq) - 1;
        minFreq = minFreq * scale;
        const linearHeight = (maxFreq - minFreq) / topFreq
        console.log("y, height " ,pos["y"],pos["height"], " becomes " , linearY, linearHeight)
        break
      }

    }
  }
}
async function getTracks(client,r_id) {
  const res = await client.query(`select id,data from "Tracks" t where "RecordingId" = '${r_id}'`);
  return res
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
  const res = await client.query(`select "id" from "Recordings" where type='audio' order by id desc`  );
  for (const row of res.rows) {
    keys.add(row.k);
  }
  return keys;
}

async function collectKeys(promises) {
  const results: Array<string[]> = await Promise.all(promises);

  const allKeys = new Set();
  for (const result of results) {
    for (const key of result) {
      allKeys.add(key);
    }
  }
  return allKeys;
}

async function deleteObjects(s3, keys) {
  for (const key of keys) {
    await s3.deleteObject({ Key: key }).promise();
  }
}

main()
  .catch((err) => {
    console.log(err);
  })
  .then(() => {
    process.exit(0);
  });
