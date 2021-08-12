import { openS3 } from "../models/util/util";
import { exec as cp_exec } from "child_process";
import util from "util";
import * as config from "../config";
import { program } from "commander";
import { Client } from "pg";
import process from "process";
import log from "../logging";
const exec = util.promisify(cp_exec);

let diskUsageRatioTarget = 0.7; // Bring our disk usage down to 70%, will be overwritten by config

/**
 * This script runs periodically to see if we need to bring our disk usage for our 'local' object store down
 * to the set ratio of total disk usage.  It takes the oldest recordings in the database that haven't already
 * been archived, downloads them from local object storage, uploads them to remote object storage, updates the object
 * keys in the database entry and then deletes the local copy.
 **/

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

const totalDiskSpaceBlocks = async (
  objectStorageRootPath: string
): Promise<number> => {
  const { stdout } = await exec(`df ${objectStorageRootPath}`);
  const lines = stdout.split("\n");
  const headings = lines[0].split(" ").filter((i) => i !== "");
  const blockIndex = headings.findIndex((i) => i.endsWith("-blocks"));
  const values = lines[1].split(" ").filter((i) => i !== "");
  return Number(values[blockIndex]);
};

const usedBlocks = async (
  bucketToArchive: string,
  objectStorageRootPath: string
): Promise<number> => {
  if (!objectStorageRootPath.endsWith("/")) {
    objectStorageRootPath += "/";
  }
  const { stdout: stdout2 } = await exec(
    `du -s ${objectStorageRootPath}${bucketToArchive}`
  );
  return stdout2.split("\t").map(Number)[0];
};

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

  diskUsageRatioTarget = Config.s3Archive.freeSpaceThresholdRatio || 0.7;

  // If we're on dev/test, we can't rely on our total disk usage growing smaller as we archive recordings.
  const bucketToArchive = Config.s3Local.bucket;
  const totalBytes =
    (await totalDiskSpaceBlocks(Config.s3Local.rootPath)) * 1024;
  let usedBytes =
    (await usedBlocks(bucketToArchive, Config.s3Local.rootPath)) * 1024;
  const percentUsed = usedBytes / totalBytes;

  log.notice(
    `==== ${((usedBytes / totalBytes) * 100).toFixed(
      3
    )}% used of available disk space, threshold to start archiving old recordings is ${(
      diskUsageRatioTarget * 100
    ).toFixed(2)}% ====`
  );

  // Let's see if we need to do any work
  if (percentUsed > diskUsageRatioTarget) {
    log.notice(
      "==== Archiving old recordings to external s3 object store provider ===="
    );
  } else {
    log.notice("==== Recording archive threshold not reached, exiting ====");
    process.exit(0);
  }

  const client = await pgConnect();
  const s3 = openS3();
  let lastId = 0;

  // Check if the target bucket exists, if not, create it
  const bucket = await s3.listBuckets({ Bucket: bucketToArchive }).promise();
  const targetBucketExists =
    bucket.Buckets.find((item) => item.Name === bucketToArchive) !== undefined;
  if (!targetBucketExists) {
    try {
      await s3.createBucket({ Bucket: bucketToArchive }).promise();
    } catch (error) {
      log.error("Failed to create target archive bucket");
      process.exit(0);
    }
  }

  while (usedBytes / totalBytes > diskUsageRatioTarget) {
    log.info(
      `${((usedBytes / totalBytes) * 100).toFixed(
        3
      )}% used of available disk space, archiving until ${(
        diskUsageRatioTarget * 100
      ).toFixed(2)}% reached`
    );
    log.debug(`select *
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      log.notice("No more archivable recordings");
      break;
    }
  }
  process.exit(0);
})();
