import registerAliases from "../module-aliases";
registerAliases();
import { openS3 } from "@models/util/util";
import { exec as cp_exec } from "child_process";
import util from "util";
import * as config from "../config";
import { program } from "commander";
import { Client } from "pg";
import process from "process";
import log from "../logging";
const exec = util.promisify(cp_exec);
let Config;

const pgConnect = async (): Promise<Client> => {
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
};

const checkOnlyInstanceOfScriptRunning = async () => {
  const me = [process.pid, process.ppid];
  const { stdout } = await exec("pgrep -f get-file-sizes");
  const lines = stdout.split("\n");
  const processes = lines
    .filter((i) => i.trim() !== "")
    .map((i) => Number(i.trim()))
    .filter((i) => !me.includes(i));

  if (processes.length !== 0) {
    // Make sure the process in question is node
    const { stdout } = await exec("pgrep -f node");
    const lines = stdout
      .split("\n")
      .filter((i) => i.trim() !== "")
      .map((i) => Number(i.trim()));
    for (const processId of processes) {
      if (lines.includes(processId)) {
        // Already running
        process.exit(0);
      }
    }
  }
};

(async function main() {
  await checkOnlyInstanceOfScriptRunning();

  program
    .option("--config <path>", "Configuration file", "./config/app.js")
    .option("--delete", "Actually delete objects (dry run by default)")
    .parse(process.argv);
  const options = program.opts();

  Config = {
    ...config.default,
    ...config.default.loadConfig(options.config),
  };

  if (!Config.hasOwnProperty("s3Archive")) {
    log.warning(
      "An archive target and bucket needs to be configured in config/app.js in order to archive old recordings"
    );
    process.exit(0);
  }

  if (!Config.s3Local.hasOwnProperty("rootPath")) {
    log.warning(
      "No object storage 'rootPath' property found in s3Local config - this is a required field"
    );
    process.exit(0);
  }

  const client = await pgConnect();
  const s3 = openS3();
  let run = true;
  while (run) {
    const result = await client.query(
      `select id, "rawFileKey"      
         from "Recordings"
         where "rawFileSize" is null 
         order by id limit 10000`
    );
    if (result.rows.length) {
      for (const row of result.rows) {
        const stat = await s3
          .headObject({
            Key: row["rawFileKey"],
          })
          .promise();
        const length = stat.ContentLength;
        await client.query(`update "Recordings"
                                    set "rawFileKey" = length
                                    where id = ${row["id"]}`);
        log.info("Set rawFileSize %s for %s", length, row["id"]);
      }
    } else {
      log.notice("No more recordings with rawFileSize unset");
      run = false;
      break;
    }
  }
  process.exit(0);
})();
