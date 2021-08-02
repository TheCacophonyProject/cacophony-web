import { openS3 } from "../models/util/util";
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

const totalDiskSpaceBlocks = async (): Promise<number> => {
  const { stdout } = await exec("df /");
  const lines = stdout.split("\n");
  const headings = lines[0].split(" ").filter((i) => i !== "");
  const blockIndex = headings.findIndex((i) => i.endsWith("-blocks"));
  const values = lines[1].split(" ").filter((i) => i !== "");
  return Number(values[blockIndex]);
};

const usedBlocks = async (
  bucketToArchive: string,
  isDev: boolean,
  isTest: boolean
): Promise<number> => {
  const pathPrefix = isTest
    ? "/.data/"
    : isDev
    ? "/mnt/volume-sfo2-01/minio_data/"
    : "/data/minio_storage/";
  const { stdout: stdout2 } = await exec(
    `du -s ${pathPrefix}${bucketToArchive}`
  );
  return stdout2.split("\t").map(Number)[0];
};

const PERCENT_THRESHOLD = 0.7; // Bring our disk usage down below 70%
(async function main() {
  program
    .option("--config <path>", "Configuration file", "./config/app.js")
    .option("--delete", "Actually delete objects (dry run by default)")
    .parse(process.argv);
  const options = program.opts();

  Config = {
    ...config.default,
    ...config.default.loadConfig(options.config),
  };

  const isDev =
    Config.server.recording_url_base !==
    "https://browse.cacophony.org.nz/recording";
  const isTest = !Config.server.recording_url_base.includes("cacophony.org.nz");

  // If we're on dev/test, we can't rely on our total disk usage growing smaller as we archive recordings.
  const bucketToArchive = Config.s3Local.bucket;
  const totalBytes = (await totalDiskSpaceBlocks()) * 1024;
  let usedBytes = (await usedBlocks(bucketToArchive, isDev, isTest)) * 1024;
  const percentUsed = usedBytes / totalBytes;
  // Let's see if we need to do any work
  if (percentUsed > PERCENT_THRESHOLD) {
    log.info(
      "==== Archiving old recordings to external s3 object store provider ===="
    );
  } else {
    log.info("==== Recording archive threshold not reached, exiting ====");
    process.exit(0);
  }

  const client = await pgConnect();
  const s3 = openS3();
  let lastId = 0;

  while (usedBytes / totalBytes > PERCENT_THRESHOLD) {
    log.info(
      `${((usedBytes / totalBytes) * 100).toFixed(
        3
      )}% used of available disk space, archiving until ${(
        PERCENT_THRESHOLD * 100
      ).toFixed(2)}% reached`
    );
    log.info(`select *
             from "Recordings"
             where "rawFileKey" not like 'a_%' or "fileKey" is not null and "fileKey" not like 'a_%' and id > ${lastId} 
             order by id limit 1`);
    const result = await client.query(
      `select *
             from "Recordings"
             where "rawFileKey" not like 'a_%' or "fileKey" is not null and "fileKey" not like 'a_%' and id > ${lastId} 
             order by id limit 1`
    );
    if (result.rows.length) {
      const { id, rawFileKey, fileKey } = result.rows[0];
      // Store last id so that if we error, we move on to the next recording.
      lastId = id;
      for (const [column, Key] of Object.entries({
        rawFileKey,
        fileKey,
      }).filter(([_, Key]) => Key !== null && !Key.startsWith("a_"))) {
        log.info("Archiving %s:%s for recording #%d", column, Key, id);
        let data;
        try {
          data = await s3.getObject({ Key }).promise();
        } catch (error) {
          log.error(
            "%s for %s:%s recording #%d",
            error.toString(),
            column,
            Key,
            id
          );
          continue;
        }
        try {
          await s3
            .upload({
              Body: data.Body,
              Metadata: data.Metadata,
              Key: `a_${Key}`,
            })
            .promise();
        } catch (error) {
          log.error(
            "Upload to archive bucket failed: %s:%s for #%d",
            column,
            Key,
            id
          );
          continue;
        }
        try {
          await client.query(`update "Recordings"
                                                   set "${column}" = 'a_${Key}'
                                                   where id = ${id}`);
        } catch (error) {
          log.error(
            "Updating recording entry #%d with new Key failed: %s:%s",
            id,
            column,
            Key
          );
          continue;
        }
        try {
          await s3.deleteObject({ Key }).promise();
        } catch (error) {
          log.error(
            "Deleting archived object from localS3 failed: %s:%s for #%d",
            column,
            Key,
            id
          );
        }
        usedBytes -= data.ContentLength;
      }
    } else {
      log.info("No more archivable recordings");
      break;
    }
  }
  process.exit(0);
})();
