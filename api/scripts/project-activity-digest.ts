import log from "@log";
import modelsInit from "@models/index.js";
import {sendProjectActivityDigestEmail} from "@/emails/transactionalEmails.js";
import {calculateMonitoringPageCriteria, type MonitoringParams} from "@api/V1/monitoringPage.js";
import {RecordingType} from "@typedefs/api/consts.js";
import {generateVisits} from "@api/V1/monitoringVisit.js";
const models = await modelsInit();

(async () => {
  // Default to daily, but can pass "weekly" on the command line for weekly behaviour.
  const timespan = process.argv[2] || "daily";
  let numDays = 1;
  if (timespan === "weekly") {
    numDays = 70;
  }
  const now = new Date();
  // We send the email at 9.10am, but let's make it so it's only up to 9am.
  now.setHours(9, 0, 0 ,0);
  const startOfPeriod = new Date();
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
    const params: MonitoringParams = {
      stations: [],
      groups: [group.id],
      page: 1,
      pageSize: 50,
      from: startOfPeriod,
      until: now,
      types: [RecordingType.ThermalRaw, RecordingType.TrailCamImage]
    }; // TODO: Make sure we load all the pages of visits
    // TODO: Switch to new visit calculation functions when ready and tested.
    let searchDetails = await calculateMonitoringPageCriteria(
        group.Users[0],
        params,
        false,
    );
    searchDetails.compareAi = "Master";
    searchDetails.types = params.types;
    console.log(searchDetails);
    const visits = [];
    while (searchDetails.pageFrom > searchDetails.searchFrom) {
      const visitsPage = await generateVisits(
          group.Users[0].id,
          searchDetails,
          false
      );
      if (Array.isArray(visitsPage)) {
        visits.push(...visitsPage);
      }
      // TODO: Narrow the search using the date of the last visit or whatever, or the pageFrom/pageUntil
      searchDetails = await calculateMonitoringPageCriteria(
          group.Users[0],
          params,
          false,
      );
    }
    const recordingData = {};

    if (Array.isArray(visits)) {
      for (const visit of visits) {
        recordingData[visit.classification] = recordingData[visit.classification] || 0;
        recordingData[visit.classification] += 1;
      }
      const speciesList = Object.entries(recordingData).map(([species, count]: [string, number]) => {
        return { species, count };
      });
      // Make an email, then send it to all the users
      // Generate a visits summary across species.
      // Do we want a location by location break-down?
      // Do we want some graphs?
      // Link to the preferences, same as the alert email.
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
    } else {
      // No visits, no email?
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
