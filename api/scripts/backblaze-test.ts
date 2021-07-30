import { openS3 } from "../models/util/util";
import * as config from "../config";
import { program } from "commander";
import { Client } from "pg";
import process from "process";

console.log("Archive recordings to Backblaze");
let Config;
(async function main() {
  program
    .option("--config <path>", "Configuration file", "./config/app.js")
    .option("--delete", "Actually delete objects (dry run by default)")
    .parse(process.argv);
  const options = program.opts();
  // TODO
  // Get oldest recording from the DB, as a transaction (see getOneForProcessing)
  // download the recording from minio
  // upload the recording to backblaze with a bb_ prefix on the key.
  // update the db entry
  Config = {
    ...config.default,
    ...config.default.loadConfig(options.config)
  };

  const client = pgConnect();
  const s3 = openS3();
  const buffer = "This is a test payload";
  await s3.upload({ Key: "a_test_object", Body: buffer }).promise();
})();

async function pgConnect() {
  const dbconf = Config.database;
  const client = new Client({
    host: dbconf.host,
    port: dbconf.port,
    user: dbconf.username,
    password: dbconf.password,
    database: dbconf.database
  });
  await client.connect();
  return client;
}
