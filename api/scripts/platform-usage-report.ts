import process from "process";
import config from "../config.js";
import log from "../logging.js";
import type { Client as PgClient, QueryResult } from "pg";
import pkg from "pg";
const { Client } = pkg;
import { sendPlatformUsageEmail } from "@/emails/transactionalEmails.js";
import type { EmailImageAttachment } from "@/scripts/emailUtil.js";
import { embedImage } from "@/emails/htmlEmailUtils.js";

const CACOPHONY_GROUPS = config.cacophonyGroupIds || [];
const CACOPHONY_USERS = config.cacophonyUserIds || [];

const weeksAgo = (
  numWeeksAgo: number,
  dateField: string,
  now: Date,
): string => {
  return `and "${dateField}" > timestamp '${now.toISOString()}' - interval '${numWeeksAgo} week' and "${dateField}" < timestamp '${now.toISOString()}' - interval '${
    numWeeksAgo - 1
  } week'`;
};

const newUserSignupsForWeekEnding = (now: Date, nWeeksAgo: number): string => {
  return `select count(*) from "Users" where "emailConfirmed" = true and "Users"."endUserAgreement" is not null ${weeksAgo(
    nWeeksAgo,
    "createdAt",
    now,
  )};`;
};

const camerasActiveForWeekEnding = (now: Date, nWeeksAgo: number): string => {
  return `select count(distinct uuid) from "Devices" inner join "Recordings" on "Recordings"."DeviceId" = "Devices".id where "Recordings"."GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) and "Recordings"."type" = 'thermalRaw' ${weeksAgo(
    nWeeksAgo,
    "recordingDateTime",
    now,
  )};`;
};

const totalRegisteredCamerasForWeekEnding = (
  now: Date,
  nWeeksAgo: number,
): string => {
  return `select count(*) from (select distinct on (uuid) "DeviceHistory"."fromDateTime", "DeviceHistory".uuid from "DeviceHistory" inner join "Devices" on "Devices".uuid = "DeviceHistory".uuid where "Devices".kind = 'thermal'  and "DeviceHistory"."GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) and "fromDateTime" < timestamp '${now.toISOString()}' - interval '${nWeeksAgo} week' order by uuid, "fromDateTime" desc) as a;`;
};

const birdMonitorsActiveForWeekEnding = (
  now: Date,
  nWeeksAgo: number,
): string => {
  return `select count(distinct uuid) from "Devices" inner join "Recordings" on "Recordings"."DeviceId" = "Devices".id where "Recordings"."GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) and "Recordings"."type" = 'audio' ${weeksAgo(
    nWeeksAgo,
    "recordingDateTime",
    now,
  )};`;
};

const totalRegisteredBirdMonitorsForWeekEnding = (
  now: Date,
  nWeeksAgo: number,
): string => {
  return `select count(*) from (select distinct on (uuid) "DeviceHistory"."fromDateTime", "DeviceHistory".uuid from "DeviceHistory" inner join "Devices" on "Devices".uuid = "DeviceHistory".uuid where "Devices".kind = 'audio'  and "DeviceHistory"."GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) and "fromDateTime" < timestamp '${now.toISOString()}' - interval '${nWeeksAgo} week' order by uuid, "fromDateTime" desc) as a;`;
};

const activeUserSessions = (now: Date, nWeeksAgo: number): string => {
  return `select count(distinct "userId") from "UserSessions" where "userId" not in (${CACOPHONY_USERS.join(
    ", ",
  )}) ${weeksAgo(nWeeksAgo, "updatedAt", now)};`;
};
const projectsCreated = (now: Date, nWeeksAgo: number): string => {
  return `select count(distinct query."GroupId") from (select * from "Groups" inner join "GroupUsers" on "GroupUsers"."GroupId" = "Groups".id inner join "Users" on "GroupUsers"."UserId" = "Users".id where "emailConfirmed" is true and "Users".id not in (${CACOPHONY_USERS.join(
    ", ",
  )}) ${weeksAgo(nWeeksAgo, `Groups"."createdAt`, now)}) as query;`;
};

const devicesRegistered = (now: Date, nWeeksAgo: number): string => {
  return `select count(id) from "Devices" where "GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) ${weeksAgo(nWeeksAgo, "createdAt", now)}`;
};
const activeProjectsForWeekEnding = (now: Date, nWeeksAgo: number): string => {
  return `select count(distinct "GroupId") from "Recordings" where "GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) ${weeksAgo(nWeeksAgo, "recordingDateTime", now)};`;
};

const eventsForWeekEnding = (
  now: Date,
  nWeeksAgo: number,
  eventType: string,
): string => {
  return `select count(*) from "Events" inner join "DetailSnapshots" on "Events"."EventDetailId" = "DetailSnapshots".id where "DetailSnapshots".type = '${eventType}' ${weeksAgo(
    nWeeksAgo,
    `Events"."createdAt`,
    now,
  )} and "Events"."DeviceId" not in (select id from "Devices" where "GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}));`;
};
const trackTagsAddedForWeekEnding = (now: Date, nWeeksAgo: number): string => {
  return `select count(*) from "TrackTags" where automatic is false ${weeksAgo(
    nWeeksAgo,
    "createdAt",
    now,
  )} and "UserId" not in (${CACOPHONY_USERS.join(", ")});`;
};
const activeTaggersForWeekEnding = (now: Date, nWeeksAgo: number): string => {
  return `select count(distinct "UserId") from "TrackTags" where automatic is false ${weeksAgo(
    nWeeksAgo,
    "createdAt",
    now,
  )} and "UserId" not in (${CACOPHONY_USERS.join(", ")})`;
};
const recordingsForWeekEnding = (
  now: Date,
  nWeeksAgo: number,
  recordingType: string,
): string => {
  return `select count(*) from "Recordings" where "type" = '${recordingType}' ${weeksAgo(
    nWeeksAgo,
    "recordingDateTime",
    now,
  )} and "GroupId" not in (${CACOPHONY_GROUPS.join(
    ", ",
  )}) and "deletedAt" is null;`;
};
const queryPrevXWeeks = async (
  fn: (n: Date, i: number) => string,
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
): Promise<number[]> => {
  const weeks: Promise<QueryResult>[] = [];
  for (let i = numPrevWeeks; i > 0; i--) {
    const query = fn(now, i);
    if (conn) {
      weeks.push(conn.query(query));
    }
  }
  if (weeks.length) {
    const weeksTimeSeries = await Promise.all(weeks);
    return weeksTimeSeries.map((week) => Number(week.rows[0].count));
  }
  return [];
};
const totalRegisteredBirdMonitorsForPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) =>
  queryPrevXWeeks(
    totalRegisteredBirdMonitorsForWeekEnding,
    numPrevWeeks,
    now,
    conn,
  );
const birdMonitorsActiveForPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(birdMonitorsActiveForWeekEnding, numPrevWeeks, now, conn);
const camerasActiveForPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(camerasActiveForWeekEnding, numPrevWeeks, now, conn);
const newUserSignupsForPrevXWeeks = async (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(newUserSignupsForWeekEnding, numPrevWeeks, now, conn);
const totalRegisteredCamerasForPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) =>
  queryPrevXWeeks(totalRegisteredCamerasForWeekEnding, numPrevWeeks, now, conn);
const activeUserSessionsPrev1Week = async (
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(activeUserSessions, 1, now, conn);
const devicesRegisteredPrev1Week = async (
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(devicesRegistered, 1, now, conn);
const projectsCreatedPrev1Week = async (
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(projectsCreated, 1, now, conn);
const activeProjectsPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(activeProjectsForWeekEnding, numPrevWeeks, now, conn);
const eventsForPrevXWeeks = async (
  numPrevWeeks: number,
  now: Date,
  eventType: string,
  conn: PgClient | undefined,
) =>
  queryPrevXWeeks(
    (now: Date, numPrevWeeks: number) =>
      eventsForWeekEnding(now, numPrevWeeks, eventType),
    numPrevWeeks,
    now,
    conn,
  );
const trackTagsAddedPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(trackTagsAddedForWeekEnding, numPrevWeeks, now, conn);
const taggersPrevXWeeks = (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) => queryPrevXWeeks(activeTaggersForWeekEnding, numPrevWeeks, now, conn);
const thermalRecordingsPrevXWeeks = async (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) =>
  queryPrevXWeeks(
    (now: Date, numPrevWeeks: number) =>
      recordingsForWeekEnding(now, numPrevWeeks, "thermalRaw"),
    numPrevWeeks,
    now,
    conn,
  );
const birdRecordingsPrevXWeeks = async (
  numPrevWeeks: number,
  now: Date,
  conn: PgClient | undefined,
) =>
  queryPrevXWeeks(
    (now: Date, numPrevWeeks: number) =>
      recordingsForWeekEnding(now, numPrevWeeks, "audio"),
    numPrevWeeks,
    now,
    conn,
  );
// TODO: Can we distinguish a tc2 cam from a classic cam via the API?
// Possibly get sidekick stats via https://developer.apple.com/help/app-store-connect/reference/sales-and-trends-reports-availability
//
async function pgConnect(): Promise<PgClient> {
  const dbconf = config.database;
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

const svg = (
  contents: string,
  width: number,
  height: { height: number },
): string => {
  return `
        <svg 
        xmlns="http://www.w3.org/2000/svg"        
        viewBox="-10 -0.5 ${width + 20} ${height.height + 10}"
      >
      ${contents}
      </svg>
    `;
};
const curvedLine = (
  values: number[],
  width: number,
  height: number | { height: number },
  max: number,
  colour: number[],
): string => {
  // Actually a curve-fitting algorithm would be better here?  Though that could over/undershoot actual values.
  let h = 0;
  if (typeof height === "number") {
    h = height;
  } else {
    h = height.height;
  }
  const numValues = values.length - 1;
  const points = values.map((value, index) => [
    index * (width / numValues),
    h - value * (h / max),
  ]);
  let p = "";
  p += `M ${points[0][0]}, ${points[0][1]} `;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const hX = (p2[0] - p1[0]) / 2;
    p += `C ${p2[0] - hX} ${p1[1]}, ${p1[0] + hX} ${p2[1]}, ${p2[0]} ${p2[1]} `;
  }
  // Join up the shape
  p += `L ${width} ${h}`;
  points.push([width, h]);
  p += `L 0 ${h}`;
  points.push([0, h]);
  p += `Z`;
  points.push([0, h - values[0] / max]);

  let p2 = "";
  // Let's put grid lines on too.
  for (let i = 1; i < points.length - 4; i++) {
    const pt = points[i];
    p2 += `M ${pt[0]} ${h} L ${pt[0]} ${pt[1]}`;
  }

  return `
      <path
          d="${p}"
          fill="${colourRgb(colour)}"
      />
      <path
          d="${p2}"
          stroke-width="0.5"
          stroke="white"
          stroke-dasharray="1 1"
      />
    `;
};

const getMonthName = (num: number) => {
  switch (num) {
    case 1:
      return "Jan";
    case 2:
      return "Feb";
    case 3:
      return "Mar";
    case 4:
      return "Apr";
    case 5:
      return "May";
    case 6:
      return "Jun";
    case 7:
      return "Jul";
    case 8:
      return "Aug";
    case 9:
      return "Sep";
    case 10:
      return "Oct";
    case 11:
      return "Nov";
    case 12:
      return "Dec";
  }
};
const getDateLabels = (dates: Date[]): [number, undefined | string][] => {
  // We only want to show the month name for the first occurance each month.
  let lastMonth = "";
  const dateLabels: [number, undefined | string][] = [];
  for (const date of dates) {
    const label: [number, undefined | string] = [date.getDate(), undefined];
    const month = getMonthName(date.getMonth() + 1);
    if (lastMonth !== month) {
      lastMonth = month;
      label[1] = lastMonth;
    }
    dateLabels.push(label);
  }
  return dateLabels;
};

const lineGraph = (
  now: Date,
  values: number[],
  width = 135,
  height = 50,
  colour: number[],
) => {
  const max = values.reduce((prev, curr) => Math.max(prev, curr));
  const heightTrack = { height };
  const line = curvedLine(values, width, heightTrack, max, colour);
  const axis = xAxis(now, values.length, width, height, colour);
  heightTrack.height += 13;

  return svg(
    `
        ${line}
        ${axis}
    `,
    width,
    heightTrack,
  );
};

const xAxis = (
  now: Date,
  numWeeks: number,
  width: number,
  height: number,
  colour: number[],
): string => {
  const numValues = numWeeks - 1;
  const dates = [];
  for (let i = numValues; i > 0; i--) {
    dates.push(new Date(new Date(now).setDate(now.getDate() - 7 * i)));
  }
  dates.push(now);
  const xP = new Array(numWeeks)
    .fill(0)
    .map((_, index) => index * (width / numValues));
  let axis = `
      <rect x="0" y="${
        height - 0.5
      }" height="0.5" width="${width}" fill="${colourRgb(colour)}" />
      <rect x="0" y="${height}" height="0.5" width="${width}" fill="white" />
    `;
  const dateLabels = getDateLabels(dates);
  for (let i = 0; i < numWeeks; i++) {
    axis += `<text x="${xP[i]}" y="${height + 9}"
          text-anchor="middle"
          fill="#555"
          font-size="7px"
          font-family="sans-serif">${dateLabels[i][0]}</text>`;
    if (dateLabels[i][1] !== undefined) {
      axis += `<text
                    x="${xP[i]}"
                    y="${height + 9 + 8}"
                    text-anchor="middle"
                    fill="#999"
                    font-size="6px"
                    font-family="sans-serif"
                  >${dateLabels[i][1]}</text>`;
    }
  }
  return axis;
};
const colourRgb = (colours: number[]) =>
  `rgb(${colours[0]}, ${colours[1]}, ${colours[2]})`;
const stackedGraph = (
  now: Date,
  allSeries: [string, number[], number[]][],
  width = 135,
  height = 50,
): [string, string] => {
  const colours = [];
  for (let i = 0; i < allSeries.length; i++) {
    colours.push(allSeries[i][2]);
  }
  let max = 0;
  for (const [_, series] of allSeries) {
    max = Math.max(
      series.reduce((prev, curr) => Math.max(prev, curr)),
      max,
    );
  }
  const heightTrack = { height };
  let curvedLines = "";
  for (let i = 0; i < allSeries.length; i++) {
    const series = allSeries[i][1];
    curvedLines += curvedLine(
      series,
      width,
      heightTrack,
      max,
      colours[i % colours.length],
    );
  }
  const axis = xAxis(
    now,
    allSeries[0][1].length,
    width,
    height,
    colours[colours.length - 1],
  );
  heightTrack.height += 13;

  let legend = `<div>`;
  for (let i = 0; i < allSeries.length; i++) {
    const [label, _] = allSeries[i];
    legend += `         
          <div>
            <div style="background-color: ${colourRgb(
              colours[i % colours.length],
            )}; width: 13px; height: 13px; margin-left: 20px; margin-right: 7px; display: inline-block;"></div><span>${label}</span>
          </div>
        `;
  }
  legend += "</div>";

  return [
    svg(
      `
        ${curvedLines}
        ${axis}
    `,
      width,
      heightTrack,
    ),
    legend,
  ];
};
async function main() {
  if (config.server.browse_url !== "https://browse.cacophony.org.nz") {
    log.info("Platform usage report only runs on production");
    return;
  }
  if (!config.smtpDetails) {
    throw "No SMTP details found in config/app.js";
  }
  // Report goes up til midnight on Sunday, this report runs on Monday morning
  const now = new Date();
  let weekEndDate = new Date(now.setDate(now.getDate() - now.getDay()));
  weekEndDate = new Date(weekEndDate.setHours(23, 59, 59, 999));
  const last = (arr: number[]) => arr[arr.length - 1];
  const numPrevWeeks = 10;
  const pgClient = await pgConnect();
  const newUserSignups = await newUserSignupsForPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const camerasActive = await camerasActiveForPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const totalCamerasRegistered = await totalRegisteredCamerasForPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const birdMonitorsActive = await birdMonitorsActiveForPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const totalBirdMonitorsRegistered =
    await totalRegisteredBirdMonitorsForPrevXWeeks(
      numPrevWeeks,
      weekEndDate,
      pgClient,
    );
  const activeUsers = last(
    await activeUserSessionsPrev1Week(weekEndDate, pgClient),
  );
  const newDevices = last(
    await devicesRegisteredPrev1Week(weekEndDate, pgClient),
  );
  const projectsStarted = last(
    await projectsCreatedPrev1Week(weekEndDate, pgClient),
  );
  const systemErrors = await eventsForPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    "systemError",
    pgClient,
  );
  const animalAlertEmails = await eventsForPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    "alert",
    pgClient,
  );
  const trackTagsAdded = await trackTagsAddedPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const activeProjects = await activeProjectsPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const thermalRecordings = await thermalRecordingsPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const audioRecordings = await birdRecordingsPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const activeTaggers = await taggersPrevXWeeks(
    numPrevWeeks,
    weekEndDate,
    pgClient,
  );
  const cacophonyGreen = [89, 189, 15];
  const darkerGreen = [13, 115, 38];
  const [activeCamerasSvg, activeCamerasLegend] = stackedGraph(
    weekEndDate,
    [
      ["All registered cameras", totalCamerasRegistered, darkerGreen],
      ["Active cameras", camerasActive, cacophonyGreen],
    ],
    250,
    50,
  );
  const [activeBirdMonitorsSvg, activeBirdMonitorsLegend] = stackedGraph(
    weekEndDate,
    [
      [
        "All registered bird monitors",
        totalBirdMonitorsRegistered,
        darkerGreen,
      ],
      ["Active bird monitors", birdMonitorsActive, cacophonyGreen],
    ],
    250,
    50,
  );
  const imageAttachments: EmailImageAttachment[] = [];
  const activeCamerasGraph = await embedImage(
    "active-cameras-graph",
    imageAttachments,
    activeCamerasSvg,
  );
  const activeBirdMonitorsGraph = await embedImage(
    "active-bird-monitors-graph",
    imageAttachments,
    activeBirdMonitorsSvg,
  );
  const signupsPerWeekGraph = await embedImage(
    "weekly-signups-graph",
    imageAttachments,
    lineGraph(weekEndDate, newUserSignups, 250, 50, cacophonyGreen),
  );
  const activeProjectsGraph = await embedImage(
    "active-projects-graph",
    imageAttachments,
    lineGraph(weekEndDate, activeProjects, 250, 50, cacophonyGreen),
  );
  const activeTaggersGraph = await embedImage(
    "active-taggers-graph",
    imageAttachments,
    lineGraph(weekEndDate, activeTaggers, 250, 50, cacophonyGreen),
  );
  const addedTagsGraph = await embedImage(
    "added-tags-graph",
    imageAttachments,
    lineGraph(weekEndDate, trackTagsAdded, 250, 50, cacophonyGreen),
  );
  const emailAlertsGraph = await embedImage(
    "email-alerts-graph",
    imageAttachments,
    lineGraph(weekEndDate, animalAlertEmails, 250, 50, cacophonyGreen),
  );
  const thermalRecordingsGraph = await embedImage(
    "thermal-recordings-graph",
    imageAttachments,
    lineGraph(weekEndDate, thermalRecordings, 250, 50, cacophonyGreen),
  );
  const audioRecordingsGraph = await embedImage(
    "audio-recordings-graph",
    imageAttachments,
    lineGraph(weekEndDate, audioRecordings, 250, 50, cacophonyGreen),
  );
  const systemErrorsGraph = await embedImage(
    "system-errors-graph",
    imageAttachments,
    lineGraph(weekEndDate, systemErrors, 250, 50, cacophonyGreen),
  );
  const maybePlural = (v: number) => (v !== 1 ? "s" : "");
  const column = (
    num: number,
    str: string,
    numColumns: number,
    totalWidth: number,
  ): string => {
    const width = 100 / numColumns;
    const absWidth = totalWidth / numColumns;
    return `
        <td align="center" valign="top" width="${width}%">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td class="columnContent" style="text-align: center;">
                        <span style="max-width:${
                          absWidth - 2
                        }px; font-size: 24px; font-weight: bold;" class="columnImage">${num}</span>                       
                    </td>
                </tr>
                <tr>
                    <td valign="top" style="text-align: center;">
                        <span class="columnContent" style="display: inline-block; margin-left: 10px;margin-right: 10px;">${str.replace(
                          / /g,
                          "&nbsp;",
                        )}</span>
                    </td>
                </tr>
            </table>
        </td>
      `;
  };

  const columns = (values: [number, string][], width: number) => {
    return `
        <table border="0" cellpadding="0" cellspacing="0" width="${width}">
            <tr>
                ${values
                  .map(([n, v], i, a) => column(n, v, a.length, width))
                  .join("")}                
            </tr>
        </table>`;
  };

  const emailHtml = `
    <div>
        <br>
        ${columns(
          [
            [activeUsers, `active user${maybePlural(activeUsers)}`],
            [newDevices, `new device${maybePlural(newDevices)}`],
            [projectsStarted, `new project${maybePlural(projectsStarted)}`],
          ],
          600,
        )}
        <br><br><br>       

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          newUserSignups,
        )}</span> new user sign-up${maybePlural(
    last(newUserSignups),
  )}</p>        
        <img alt="Signups per week: ${newUserSignups.join(
          ", ",
        )}" src='${signupsPerWeekGraph}' width='100%' height='auto' />
        <br><br><br>
        
        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          activeProjects,
        )}</span> active project${maybePlural(last(activeProjects))}</p>
        <img alt="Active projects per week: ${activeProjects.join(
          ", ",
        )}" src='${activeProjectsGraph}' width='100%' height='auto' />
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          camerasActive,
        )}</span> camera${maybePlural(
    last(camerasActive),
  )} recording, out of <strong>${last(
    totalCamerasRegistered,
  )}</strong> total registered camera${maybePlural(
    last(totalCamerasRegistered),
  )}</p>
        <img alt="Weekly active cameras: ${camerasActive.join(
          ", ",
        )}" src='${activeCamerasGraph}' width='100%' height='auto' />
        ${activeCamerasLegend}
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          thermalRecordings,
        )}</span> thermal recording${maybePlural(last(thermalRecordings))}</p>
        <img alt="Thermal recordings per week: ${thermalRecordings.join(
          ", ",
        )}" src='${thermalRecordingsGraph}' width='100%' height='auto' />
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          birdMonitorsActive,
        )}</span> bird monitor${maybePlural(
    last(birdMonitorsActive),
  )} recording, out of <strong>${last(
    totalBirdMonitorsRegistered,
  )}</strong> total registered bird monitor${maybePlural(
    last(totalBirdMonitorsRegistered),
  )}</p>
        <img alt="Weekly active bird monitors: ${birdMonitorsActive.join(
          ", ",
        )}" src='${activeBirdMonitorsGraph}' width='100%' height='auto' />
        ${activeBirdMonitorsLegend}
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          audioRecordings,
        )}</span> bird recording${maybePlural(last(audioRecordings))}</p>
        <img alt="Bird recordings per week: ${audioRecordings.join(
          ", ",
        )}" src='${audioRecordingsGraph}' width='100%' height='auto' />
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          activeTaggers,
        )}</span> active tagger${maybePlural(last(activeTaggers))}</p>
        <img alt="Active taggers per week: ${activeTaggers.join(
          ", ",
        )}" src='${activeTaggersGraph}' width='100%' height='auto' />
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          trackTagsAdded,
        )}</span> user classification${maybePlural(
    last(trackTagsAdded),
  )} added</p>
        <img alt="Added tags per week: ${trackTagsAdded.join(
          ", ",
        )}" src='${addedTagsGraph}' width='100%' height='auto' />
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          animalAlertEmails,
        )}</span> alert notification${maybePlural(
    last(animalAlertEmails),
  )} sent</p>
        <img alt="Alerts per week: ${animalAlertEmails.join(
          ", ",
        )}" src='${emailAlertsGraph}' width='100%' height='auto' />
        <br><br><br>

        <p style="font-size: 16px; margin-bottom: 28px;"><span style="font-size: 20px; font-weight: bold;">${last(
          systemErrors,
        )}</span> device error${maybePlural(last(systemErrors))} reported</p>
        <img alt="Device errors per week: ${systemErrors.join(
          ", ",
        )}" src='${systemErrorsGraph}' width='100%' height='auto' />
        <br><br>
    </div>
`;
  await sendPlatformUsageEmail(
    config.server.browse_url.replace("https://", ""),
    config.smtpDetails.platformUsageEmail,
    weekEndDate,
    emailHtml,
    imageAttachments,
  );
}

main()
  .catch(log.error)
  .then(() => {
    process.exit(0);
  });
