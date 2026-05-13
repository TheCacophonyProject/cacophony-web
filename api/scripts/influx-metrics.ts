import * as Influx from "influx";
import process from "process";
import pg from "pg";
import type { Client as PgClient } from "pg";
import moment from "moment";
import os from "os";
import { RecordingProcessingState } from "@typedefs/api/consts.js";
import config from "../config.js";
import { InfluxDB } from "influx";

const timeout = 1000;

(async function main() {
  if (config.cronScriptProcessingHostname !== os.hostname()) {
    return;
  }
  try {
    const pgClient = await pgConnect();
    const influx = await influxConnect();

    await Promise.all([
      stateCount(influx, pgClient),
      measureProcessingWaitTime(influx, pgClient),
      inPast24(influx, pgClient),
    ]);
    console.log("finished logging metrics");
  } catch (e) {
    console.log("error with logging metrics:", e);
  }
  process.exit(0);
})();

async function pgQuery(client: PgClient, query: string) {
  const res = await client.query({
    text: `SET statement_timeout = ${timeout}; ${query}`,
  });
  // FIXME: Check this
  return res;
}

async function writePoints(
  influx: InfluxDB,
  measurement: string,
  fields: Record<string, unknown>,
) {
  return await influx.writePoints([
    {
      measurement: measurement,
      tags: { host: os.hostname() },
      fields: fields,
    },
  ]);
}

const processingWaitTimeMeasurement = "processing_wait_time";

async function measureProcessingWaitTime(influx: InfluxDB, pgClient: PgClient) {
  const res = await pgQuery(
    pgClient,
    `select "createdAt" from "Recordings"
    where "processingState" in ('analyse', 'tracking', 'trackAndAnalyse') and "deletedAt" is null and "processingFailedCount" = 0
    order by "createdAt" asc limit 1`,
  );

  let waitMinutes = 0;
  if (res.rowCount != 0) {
    const uploadedAt = moment(res.rows[0].createdAt);
    const diff = moment().diff(uploadedAt, "minutes");
    waitMinutes = diff;
  }
  console.log(processingWaitTimeMeasurement, waitMinutes);

  await writePoints(influx, processingWaitTimeMeasurement, {
    waitMinutes: waitMinutes,
  });
}

const countStates = Object.values(RecordingProcessingState).filter(
  (state) =>
    state !== RecordingProcessingState.Finished &&
    state !== RecordingProcessingState.AnalyseTest,
) as string[];

const stateCountMeasurement = "processing_state_count";

async function stateCount(influx: InfluxDB, pgClient: PgClient) {
  const fields: Record<string, number> = {};
  for (const state of countStates) {
    fields[state] = await getCount(
      pgClient,
      `select Count(id) from "Recordings" where "processingState" = '${state}' and "deletedAt" is null`,
    );
  }
  console.log("Count: ", fields);

  await writePoints(influx, stateCountMeasurement, fields);
}

const inPast24Measurement = "in_past_24";

async function inPast24(influx: InfluxDB, pgClient: PgClient) {
  const thermalRawQuery = `SELECT COUNT(id) FROM "Recordings"
    WHERE "recordingDateTime" > (NOW() - INTERVAL '1 day')
    AND TYPE = 'thermalRaw'`;
  const audioQuery = `SELECT COUNT(id) FROM "Recordings"
    WHERE "recordingDateTime" > (NOW() - INTERVAL '1 day')
    AND TYPE = 'audio'`;

  const fields = {
    thermal_recordings: await getCount(pgClient, thermalRawQuery),
    audio_recordings: await getCount(pgClient, audioQuery),
  };
  console.log(inPast24Measurement, fields);
  await writePoints(influx, inPast24Measurement, fields);
}

async function getCount(pgClient: PgClient, query: string) {
  const res = await pgQuery(pgClient, query);
  return Number(res.rows[0].count);
}

async function influxConnect() {
  const processingFields = countStates.reduce(
    (acc, val) => {
      acc[val] = Influx.FieldType.INTEGER;
      return acc;
    },
    {} as Record<string, Influx.FieldType.INTEGER>,
  );
  return new Influx.InfluxDB({
    host: config.influx.host,
    database: config.influx.database,
    username: config.influx.username,
    password: config.influx.password,
    protocol: "https",
    port: 443,
    schema: [
      {
        measurement: stateCountMeasurement,
        fields: processingFields,
        tags: ["host"],
      },
      {
        measurement: processingWaitTimeMeasurement,
        fields: {
          waitMinutes: Influx.FieldType.INTEGER,
        },
        tags: ["host"],
      },
      {
        measurement: inPast24Measurement,
        fields: {
          thermal_recordings: Influx.FieldType.INTEGER,
          audio_recordings: Influx.FieldType.INTEGER,
        },
        tags: ["host"],
      },
    ],
  });
}

async function pgConnect() {
  const dbConf = config.database;
  const client = new pg.Client({
    host: dbConf.host,
    port: dbConf.port,
    user: dbConf.username,
    password: dbConf.password,
    database: dbConf.database,
  });
  await client.connect();
  return client;
}
