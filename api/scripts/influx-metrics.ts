import * as Influx from "influx";
import { InfluxDB } from "influx";
import process from "process";
import { Client as PgClient, QueryResult } from "pg";
import moment from "moment";
import os from "os";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import config from "../config.js";

const PROCESSING_WAIT_TIME = "processing_wait_time";
const PROCESSING_STATE_COUNT = "processing_state_count";
const IN_PAST_24_HRS = "in_past_24";
const countStates = Object.values(RecordingProcessingState).filter(
  (state) =>
    state !== RecordingProcessingState.Finished &&
    state !== RecordingProcessingState.AnalyseTest,
) as string[];
const timeout = 1000;

(async function main() {
  try {
    const pgClient = await pgConnect();
    const measurements = [stateCount, measureProcessingWaitTime, inPast24];
    const results = await Promise.all(
      measurements.map((measurementFn) => measurementFn(pgClient)),
    );

    for (const result of results) {
      console.log(result.measurement, result.fields);
    }

    if (config.cronScriptProcessingHostname !== os.hostname()) {
      console.log("Influx metrics: not running on cron script host, exiting.");
      process.exit(0);
    } else {
      const influx = await influxConnect();
      await Promise.all(
        results.map(({ measurement, fields }) =>
          writePoints(influx, measurement, fields),
        ),
      );
      console.log("finished logging metrics");
    }
  } catch (e) {
    console.log("error with logging metrics:", e);
  }
  process.exit(0);
})();

async function pgQuery(client: PgClient, query: string) {
  const result = await client.query({
    text: `SET statement_timeout = ${timeout}; ${query}`,
  });
  // NOTE: because we have two queries in one, we need to correct the typings here.
  return (result as unknown as QueryResult[])[1];
}

async function writePoints(
  influx: InfluxDB,
  measurement: string,
  fields: Record<string, unknown>,
) {
  return influx.writePoints([
    {
      measurement,
      tags: { host: os.hostname() },
      fields,
    },
  ]);
}

async function measureProcessingWaitTime(pgClient: PgClient) {
  const result = await pgQuery(
    pgClient,
    `select "createdAt" from "Recordings"
      where "processingState" in ('analyse', 'tracking', 'trackAndAnalyse') 
        and "deletedAt" is null and "processingFailedCount" = 0
      order by "createdAt" asc limit 1`,
  );

  let waitMinutes = 0;
  if (result.rowCount != 0) {
    const uploadedAt = moment(result.rows[0].createdAt);
    const diff = moment().diff(uploadedAt, "minutes");
    waitMinutes = diff;
  }
  return {
    measurement: PROCESSING_WAIT_TIME,
    fields: { waitMinutes },
  };
}

async function stateCount(pgClient: PgClient) {
  const fields = (
    await Promise.all(
      countStates.map(async (state) => {
        const result = await getCount(
          pgClient,
          `select Count(id) from "Recordings" where "processingState" = '${state}' and "deletedAt" is null`,
        );
        return { result, key: state };
      }),
    )
  ).reduce((acc: Record<string, number>, item) => {
    acc[item.key] = item.result;
    return acc;
  }, {});
  return { fields, measurement: PROCESSING_STATE_COUNT };
}

async function inPast24(pgClient: PgClient) {
  const types = {
    thermal_recordings: RecordingType.ThermalRaw,
    audio_recordings: RecordingType.Audio,
  };
  const fields = (
    await Promise.all(
      Object.entries(types).map(async ([key, type]) => {
        const result = await getCount(
          pgClient,
          `SELECT COUNT(id) FROM "Recordings"
             WHERE "recordingDateTime" > (NOW() - INTERVAL '1 day')
               AND TYPE = '${type}'`,
        );
        return { result, key };
      }),
    )
  ).reduce((acc: Record<string, number>, item) => {
    acc[item.key] = item.result;
    return acc;
  }, {});
  return { fields, measurement: IN_PAST_24_HRS };
}

async function getCount(pgClient: PgClient, query: string) {
  const result = await pgQuery(pgClient, query);
  return Number(result.rows[0].count);
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
        measurement: PROCESSING_STATE_COUNT,
        fields: processingFields,
        tags: ["host"],
      },
      {
        measurement: PROCESSING_WAIT_TIME,
        fields: {
          waitMinutes: Influx.FieldType.INTEGER,
        },
        tags: ["host"],
      },
      {
        measurement: IN_PAST_24_HRS,
        fields: {
          thermal_recordings: Influx.FieldType.INTEGER,
          audio_recordings: Influx.FieldType.INTEGER,
        },
        tags: ["host"],
      },
    ],
  });
}

async function pgConnect(): Promise<PgClient> {
  const dbConf = config.database;
  const client = new PgClient({
    host: dbConf.host,
    port: dbConf.port,
    user: dbConf.username,
    password: dbConf.password,
    database: dbConf.database,
  });
  await client.connect();
  return client;
}
