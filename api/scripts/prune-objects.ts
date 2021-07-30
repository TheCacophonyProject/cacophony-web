import process from "process";
import { program } from "commander";
import { Client } from "pg";
import * as config from "../config";
import * as modelsUtil from "../models/util/util";

let Config;
// Define the types of object keys that will be considered for pruning.
const keyTypes = Object.freeze([
  { prefix: "f", table: "Files", column: "fileKey" },
  { prefix: "raw", table: "Recordings", column: "rawFileKey" },
  { prefix: "rec", table: "Recordings", column: "fileKey" }
]);

async function main() {
  program
    .option("--config <path>", "Configuration file", "./config/app.js")
    .option("--delete", "Actually delete objects (dry run by default)")
    .parse(process.argv);
  const options = program.opts();

  Config = {
    ...config.default,
    ...config.default.loadConfig(options.config)
  };

  if (!options.delete) {
    console.log("NOTE: no objects will be removed without --delete");
  }

  const pgClient = await pgConnect();
  const s3 = modelsUtil.openS3();

  const bucketKeys = await loadAllBucketKeys(
    s3,
    keyTypes.map((x) => x.prefix)
  );

  console.log(`loaded ${bucketKeys.size} keys from the object store`);

  console.log(
    "waiting 20 minutes before getting keys from database to give uploading recordings time to finish"
  );
  await new Promise((r) => setTimeout(r, 1000 * 60 * 20)); // Sleep 20 minutes
  console.log("getting keys from the database");
  const dbKeys = await loadAllDBKeys(pgClient, keyTypes);
  console.log(`${dbKeys.size} keys loaded from the database`);

  const toDelete = new Set([...bucketKeys].filter((x) => !dbKeys.has(x)));
  console.log(`${toDelete.size} keys to delete`);

  if (toDelete.size > 0 && options.delete) {
    await deleteObjects(s3, toDelete);
    console.log(`objects deleted`);
  }
}

async function loadAllBucketKeys(s3, prefixes) {
  const p = [];
  for (const prefix of prefixes) {
    p.push(loadBucketKeys(s3, prefix));
  }
  return collectKeys(p);
}

async function loadBucketKeys(s3, prefix) {
  const params: any = {
    Prefix: prefix
  };

  const keys = new Set();
  for (;;) {
    const data = await s3.listObjects(params).promise();

    data.Contents.forEach((elem) => {
      keys.add(elem.Key);
    });

    if (!data.IsTruncated) {
      break;
    }
    params.Marker = data.NextMarker;
  }

  return keys;
}

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

async function loadAllDBKeys(client, keyTypes) {
  const p = [];
  for (const keyType of keyTypes) {
    p.push(loadDBKeys(client, keyType.table, keyType.column));
  }
  return collectKeys(p);
}

async function loadDBKeys(client, table, column) {
  const keys = new Set();
  const res = await client.query(
    `select "${column}" as k from "${table}" where 1 is not NULL`
  );
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
