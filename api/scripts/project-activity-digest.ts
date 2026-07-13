import log from "@log";
import { initSequelize } from "@models/index.js";
import { sendProjectActivityDigestEmail } from "@/emails/transactionalEmails.js";
import {
  calculateMonitoringPageCriteria,
  type MonitoringParams,
} from "@api/V1/monitoringPage.js";
import { RecordingType } from "@typedefs/api/consts.js";
import { generateVisits, type Visit } from "@api/V1/monitoringVisit.js";
import { displayLabelForClassificationLabel } from "@/classifications/classifications.js";
import type { GroupId } from "@typedefs/api/common.js";
import { User } from "@models/User.js";
import os from "os";
import { Group } from "@models/Group.js";
import config from "@config";
import { Op } from "sequelize";
import { Recording } from "@models/Recording.js";
import tzLookup from "tz-lookup-oss";
import process from "process";

const allVisitsForProjectInTimespan = async (
  projectId: GroupId,
  from: Date,
  until: Date,
  user: User,
): Promise<Visit[]> => {
  const params: MonitoringParams = {
    stations: [],
    groups: [projectId],
    page: 1,
    pageSize: 50,
    from,
    until,
    types: [RecordingType.ThermalRaw],
  };
  // TODO: Switch to new visit calculation functions when ready and tested.
  let searchDetails = await calculateMonitoringPageCriteria(
    user,
    params,
    false,
  );
  searchDetails.compareAi = "Master";
  searchDetails.types = params.types;
  const visits = [];

  while (true) {
    const visitsPage = await generateVisits(user.id, searchDetails, false);

    if (Array.isArray(visitsPage)) {
      const completeVisits = visitsPage.filter((visit) => !visit.incomplete);
      if (completeVisits.length === 0) {
        break;
      }
      for (const visit of completeVisits) {
        // Ignore incomplete visits
        visits.push(visit);
      }
      params.until = visits[visits.length - 1].timeEnd.toDate();
      searchDetails = await calculateMonitoringPageCriteria(
        user,
        params,
        false,
      );
      searchDetails.compareAi = "Master";
      searchDetails.types = params.types;
      if (visitsPage.length < params.pageSize) {
        break;
      }
    } else {
      console.error(visitsPage);
      break;
    }
  }
  return visits;
};

const currentHourInTimezone = (timeZone: string, now: Date): number => {
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    hour12: false,
    hourCycle: "h24",
    timeZone: timeZone,
  });

  const formattedOutput = formatter.format(now);
  return Number(formattedOutput);
};

(async () => {
  const args = process.argv.slice(2); // Remove the first two default paths
  const forceRun = args.includes("--force");
  if (config.cronScriptProcessingHostname !== os.hostname() && !forceRun) {
    return;
  }
  await initSequelize(!forceRun);
  // Default to daily, but can pass "weekly" on the command line for weekly behaviour.
  let daily = args.includes("daily");
  const weekly = args.includes("weekly");
  const suppliedNow = args.find((item) => item.includes("--at-time="));
  let numDays = 1;
  if (weekly) {
    console.log("weekly", weekly);
    numDays = 7;
  } else {
    daily = true;
  }
  let now;
  let suppliedNowDate = new Date();
  if (suppliedNow) {
    // In testing, we can supply a current time.
    now = new Date(suppliedNow.replace("--at-time=", ""));
    suppliedNowDate = new Date(now);
    console.log(`Set time to ${now.toISOString()}`);
  } else {
    now = new Date();
  }
  // We send the email at 9.10am, but let's make it so it's only up to 9am.
  now.setHours(9, 0, 0, 0);
  console.log(`Script run at ${now.toISOString()}`);
  const startOfPeriod = new Date(now);
  startOfPeriod.setHours(startOfPeriod.getHours() - 24 * numDays);
  console.log(`Start of period ${startOfPeriod.toISOString()}`);
  const digestGroups = await Group.findAll({
    attributes: ["groupName", "id"],
    include: [
      {
        model: User,
        through: {
          where: {
            ...(daily
              ? { "settings.notificationPreferences.dailyDigest": true }
              : { "settings.notificationPreferences.weeklyDigest": true }),
            removedAt: { [Op.eq]: null },
            pending: { [Op.eq]: null },
          },
        },
        required: true,
      },
    ],
  });
  for (const group of digestGroups) {
    const groupTimezoneRecording = await Recording.findOne({
      where: { GroupId: group.id, location: { [Op.ne]: null } },
      attributes: ["location"],
      order: [["recordingDateTime", "DESC"]],
      limit: 1,
    });
    if (groupTimezoneRecording) {
      const timeZone = tzLookup(
        groupTimezoneRecording.location.lat,
        groupTimezoneRecording.location.lng,
      );
      // NOTE: We ignore the possibility of a project having devices in multiple timezones,
      // or that the timezone of the project may not reflect the timezone of the recipient.
      if (currentHourInTimezone(timeZone, suppliedNowDate) !== 9) {
        // It's not time for this projects' email
        continue;
      }
    }
    const recipients = group.Users.map(({ email, userName }) => ({
      email,
      userName,
    }));
    // TODO: Add in some bird tag stats if audio recording is happening

    const recordingData: Record<string, number> = {};
    // NOTE: If there was no activity, check to see if this is the *first* time there has been no activity for this time period.
    // If so, then send the email saying there was no activity, and that another email won't be sent until there is again.
    const visits = await allVisitsForProjectInTimespan(
      group.id,
      startOfPeriod,
      now,
      // NOTE: Any of the projects' users will do here.
      group.Users[0],
    );
    const noVisitsInTimespan = visits.length === 0;
    let alreadySentNoActivityEmail = false;
    if (noVisitsInTimespan) {
      // Check previous timespan for visits
      const period = new Date(startOfPeriod);
      const newNow = new Date(now);
      period.setHours(startOfPeriod.getHours() - 24 * numDays);
      newNow.setHours(now.getHours() - 24 * numDays);
      const visitsInPreviousTimespan = await allVisitsForProjectInTimespan(
        group.id,
        period,
        newNow,
        group.Users[0],
      );
      if (visitsInPreviousTimespan.length === 0) {
        alreadySentNoActivityEmail = true;
      }
    }
    if (!alreadySentNoActivityEmail) {
      for (const visit of visits) {
        if (visit.classification === "false-trigger") {
          continue;
        }
        if (visit.classification === "none") {
          visit.classification = "unidentified";
        }
        recordingData[visit.classification] =
          recordingData[visit.classification] || 0;
        recordingData[visit.classification] += 1;
      }
      const speciesList = Object.entries(recordingData)
        .map(([species, count]: [string, number]) => {
          return {
            species,
            count,
            speciesDisplayName: displayLabelForClassificationLabel(
              species,
            ).replace(/ /g, "&nbsp;"),
          };
        })
        .sort((a, b) => b.count - a.count);
      // Make an email, then send it to all the users
      // ✅ Generate a visits summary across species.
      // Do we want a location by location break-down?
      // Do we want some graphs?
      // ✅ Link to the preferences, same as the alert email.
      // Tagging activity.
      // New controversial or flagged for review tags.
      // New cool tags?
      await sendProjectActivityDigestEmail(
        weekly ? "Weekly" : "Daily",
        group.groupName,
        recipients,
        speciesList,
      );
    }
  }
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
