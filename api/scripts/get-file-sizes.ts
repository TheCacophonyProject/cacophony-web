import { openS3 } from "@models/util/util.js";
import { exec as cp_exec } from "child_process";
import util from "util";
import * as config from "../config.js";
import { program } from "commander";
import { Client } from "pg";
import process from "process";
import log from "../logging.js";
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
    const result = await client.query(`select id, "rawFileKey"
         from "Recordings"
         where "rawFileSize" is null
        and "rawFileKey" is not null
         order by id limit 50`);
    if (result.rows.length) {
      const p = [];
      for (const row of result.rows) {
        p.push(
          s3
            .headObject({
              Key: row["rawFileKey"],
            })
            .promise()
        );
      }
      const stats = await Promise.all(p);
      const j = [];
      for (let i = 0; i < stats.length; i++) {
        const length = stats[i].ContentLength;
        j.push(
          client.query(
            `update "Recordings" set "rawFileSize" = ${length} where id = ${result.rows[i]["id"]}`
          )
        );
        log.info(
          "Set rawFileSize %s for %s, %s",
          length,
          result.rows[i]["id"],
          result.rows[i]["rawFileKey"]
        );
      }
      await Promise.all(j);
    } else {
      log.notice("No more recordings with rawFileSize unset");
      run = false;
      break;
    }
  }
  process.exit(0);
})();
