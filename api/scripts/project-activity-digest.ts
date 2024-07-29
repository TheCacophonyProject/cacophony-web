import log from "@log";
import modelsInit from "@models/index.js";
import { sendProjectActivityDigestEmail } from "@/emails/transactionalEmails.js";
import {
  calculateMonitoringPageCriteria,
  type MonitoringParams,
} from "@api/V1/monitoringPage.js";
import { RecordingType } from "@typedefs/api/consts.js";
import { generateVisits, type Visit } from "@api/V1/monitoringVisit.js";
import { displayLabelForClassificationLabel } from "@/classifications/classifications.js";
import type { GroupId } from "@typedefs/api/common.js";
import type { User } from "@models/User.js";
const models = await modelsInit();

const allVisitsForProjectInTimespan = async (
  projectId: GroupId,
  from: Date,
  until: Date,
  user: User
): Promise<Visit[]> => {
  const params: MonitoringParams = {
    stations: [],
    groups: [projectId],
    page: 1,
    pageSize: 50,
    from,
    until,
    types: [RecordingType.ThermalRaw, RecordingType.TrailCamImage],
  };
  // TODO: Switch to new visit calculation functions when ready and tested.
  let searchDetails = await calculateMonitoringPageCriteria(
    user,
    params,
    false
  );
  searchDetails.compareAi = "Master";
  searchDetails.types = params.types;
  const visits = [];
  // eslint-disable-next-line no-constant-condition
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
        false
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

(async () => {
  // Default to daily, but can pass "weekly" on the command line for weekly behaviour.
  const timespan = process.argv[2] || "daily";
  let numDays = 1;
  if (timespan === "weekly") {
    numDays = 7;
  }
  const now = new Date();
  // We send the email at 9.10am, but let's make it so it's only up to 9am.
  now.setHours(9, 0, 0, 0);
  const startOfPeriod = new Date(now);
  startOfPeriod.setHours(startOfPeriod.getHours() - (24 * numDays));
  const digestGroups = await models.Group.findAll({
    attributes: ["groupName", "id"],
    include: [
      {
        model: models.User,
        through: {
          where: {
            ...(timespan === "daily"
              ? { "settings.notificationPreferences.dailyDigest": true }
              : { "settings.notificationPreferences.weeklyDigest": true }),
          },
        },
        required: true,
      },
    ],
  });
  for (const group of digestGroups) {
    const recipients = group.Users.map(({ email, userName }) => ({
      email,
      userName,
    }));
    const recordingData = {};
    // NOTE: If there was no activity, check to see if this is the *first* time there has been no activity for this time period.
    // If so, then send the email saying there was no activity, and that another email won't be sent until there is again.
    const visits = await allVisitsForProjectInTimespan(
      group.id,
      startOfPeriod,
      now,
      group.Users[0]
    );
    const noVisitsInTimespan = visits.length === 0;
    let alreadySentNoActivityEmail = false;
    if (noVisitsInTimespan) {
      // Check previous timespan for visits
      const period = new Date(startOfPeriod);
      const newNow = new Date(now);
      period.setHours(startOfPeriod.getHours() - (24 * numDays));
      now.setHours(now.getHours() - (24 * numDays));
      const visitsInPreviousTimespan = await allVisitsForProjectInTimespan(
        group.id,
        period,
        newNow,
        group.Users[0]
      );
      if (visitsInPreviousTimespan.length === 0) {
        alreadySentNoActivityEmail = true;
      }
    }
    if (!alreadySentNoActivityEmail) {
      for (const visit of visits) {
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
              species
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
        "browse-next.cacophony.org.nz",
        timespan === "weekly" ? "Weekly" : "Daily",
        group.groupName,
        recipients,
        speciesList
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
