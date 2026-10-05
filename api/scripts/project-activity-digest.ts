import log from "@log";
import { initSequelize } from "@models/index.js";
import { sendProjectActivityDigestEmail } from "@/emails/transactionalEmails.js";
import { displayLabelForClassificationLabel } from "@/classifications/classifications.js";
import type { GroupId } from "@typedefs/api/common.js";
import { User } from "@models/User.js";
import os from "os";
import { Group } from "@models/Group.js";
import config from "@config";
import SequelizeStatic, { col, Op } from "sequelize";
import { Recording } from "@models/Recording.js";
import tzLookup from "tz-lookup-oss";
import process from "process";
import { Visit } from "@models/Visit.js";
import { TrackTag } from "@models/TrackTag.js";
import { Track } from "@models/Track.js";
import { RecordingType, TagMode } from "@typedefs/api/consts.js";
import { queryRecordingsInProject } from "@api/V1/recordingsBulkQueryUtil.js";
import { ApiGroupUserSettings } from "@typedefs/api/group.js";
import { Event } from "@models/Event.js";
import { Device } from "@models/Device.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import type { BatteryInfoEventDetail } from "@typedefs/api/event.js";

interface SpeciesCount {
  species: string;
  count: number;
  speciesDisplayName: string;
}

interface BatteryReport {
  deviceName: string;
  batteryLevel: number;
}

const allVisitsForProjectInTimespan = async (
  projectId: GroupId,
  from: Date,
  until: Date,
): Promise<SpeciesCount[]> => {
  const visits = await Visit.findAll({
    where: {
      GroupId: projectId,
      startTime: {
        [Op.gte]: from,
        [Op.lte]: until,
      },
    },
    include: [
      {
        model: TrackTag,
        attributes: [],
        as: "AiTrackTag",
      },
      {
        model: TrackTag,
        attributes: [],
        as: "HumanTrackTag",
      },
    ],
    attributes: {
      include: [
        [col("HumanTrackTag.what"), "humanClassification"],
        [col("AiTrackTag.what"), "aiClassification"],
      ],
    },
  });
  const recordingData: Record<string, number> = {};
  for (const visit of visits) {
    let classification =
      visit.get("humanClassification") ||
      visit.get("aiClassification") ||
      "none";
    if (classification === "false-trigger") {
      continue;
    }
    if (classification === "none") {
      classification = "unidentified";
    }
    recordingData[classification] = recordingData[classification] || 0;
    recordingData[classification] += 1;
  }
  return Object.entries(recordingData)
    .map(([species, count]: [string, number]) => {
      return {
        species,
        count,
        speciesDisplayName: displayLabelForClassificationLabel(species).replace(
          / /g,
          "&nbsp;",
        ),
      };
    })
    .sort((a, b) => b.count - a.count);
};

const allBatteryReportsForProjectInTimespan = async (
  projectId: GroupId,
  from: Date,
  until: Date,
): Promise<BatteryReport[]> => {
  // The device firmware already computes a 0-100 percentage and sends it as part of the
  // "rpiBattery" event details - there's no voltage/chemistry conversion to do here, we just
  // need the latest one per device in the period.  Mirrors `getLastKnownDeviceBatteryLevel` in
  // `types/client/Device.ts`, which `DeviceBatteryLevel.vue` uses to display this value.
  const events = await Event.findAll({
    where: {
      dateTime: { [Op.gte]: from, [Op.lte]: until },
    },
    include: [
      {
        model: DetailSnapshot,
        as: "EventDetail",
        attributes: ["details"],
        where: { type: "rpiBattery" },
        required: true,
      },
      {
        model: Device,
        attributes: ["deviceName"],
        where: { GroupId: projectId },
        required: true,
      },
    ],
    attributes: [
      [
        SequelizeStatic.literal('DISTINCT ON("Event"."DeviceId") 1'),
        "device_id",
      ],
      "id",
      "dateTime",
      "DeviceId",
    ],
    order: [
      ["DeviceId", "DESC"],
      ["dateTime", "DESC"],
    ],
  });

  const batteryReports: BatteryReport[] = [];
  for (const event of events) {
    const details = event.EventDetail.details as BatteryInfoEventDetail;
    if (typeof details.battery !== "number") {
      continue;
    }
    batteryReports.push({
      deviceName: event.Device.deviceName,
      batteryLevel: details.battery,
    });
  }
  return batteryReports;
};

const allBirdSpeciesDetectionsForProjectInTimespan = async (
  sequelize: SequelizeStatic.Sequelize,
  projectId: GroupId,
  from: Date,
  until: Date,
): Promise<SpeciesCount[]> => {
  // Same query the bird/audio dashboard uses (`loadAudioRecordings` in DashboardView.vue) to find
  // recordings tagged with a bird species: recordings tagged with "all.bird", matching descendant
  // tags too (subClassTags).
  const matchingRecordings = await queryRecordingsInProject(
    sequelize,
    projectId,
    2.5, // minDuration - matches the dashboard's default `duration` query param
    false, // statusRecordingsOnly
    false, // includeDeletedRecordings
    [RecordingType.Audio],
    undefined, // processingState
    [], // devices
    [], // locations
    ["all.bird"], // taggedWith
    true, // subClassTags
    [], // labelledWith
    TagMode.Tagged,
    false, // includeFilteredTracks
    // Digest periods are short (a day or a week), so a generous single-page limit comfortably
    // covers real projects without needing the UI's incremental-loading pagination.
    100_000,
    from,
    until,
    undefined, // logging
  );
  if (matchingRecordings.length === 0) {
    return [];
  }

  // We count a detection as one or more bird tags in a given recording - the same tag isn't
  // counted twice in the same recording.  Mirrors the "Species summary" aggregation in
  // `audioItems` in DashboardView.vue.
  const recordings = await Recording.findAll({
    where: { id: { [Op.in]: matchingRecordings.map(({ id }) => id) } },
    attributes: ["id"],
    include: [
      {
        model: Track,
        required: true,
        attributes: ["id"],
        where: { archivedAt: { [Op.eq]: null } },
        include: [
          {
            model: TrackTag,
            required: true,
            attributes: ["path", "automatic", "what"],
            where: { used: true, archivedAt: { [Op.eq]: null } },
          },
        ],
      },
    ],
  });

  const recordingIdsBySpecies = new Map<string, Set<number>>();
  for (const recording of recordings) {
    const uniqueSpeciesInRecording = new Set<string>();
    for (const track of recording.Tracks || []) {
      const trackTags = track.TrackTags || [];
      // If a track has been tagged by both AI and a human, the human tag takes precedence
      // and the AI tag is ignored - mirrors `canonicalTrackTags` in DashboardView.vue.
      const humanTags = trackTags.filter((tag) => !tag.automatic);
      const canonicalTags = humanTags.length ? humanTags : trackTags;
      for (const trackTag of canonicalTags) {
        if (trackTag.path?.startsWith("all.bird.")) {
          uniqueSpeciesInRecording.add(trackTag.what);
        }
      }
    }
    for (const species of uniqueSpeciesInRecording) {
      const recordingIds =
        recordingIdsBySpecies.get(species) || new Set<number>();
      recordingIds.add(recording.id);
      recordingIdsBySpecies.set(species, recordingIds);
    }
  }
  const birdDetections = Array.from(recordingIdsBySpecies.entries()).map(
    ([species, recordingIds]) => ({
      species,
      count: recordingIds.size,
    }),
  );

  return birdDetections
    .map(({ species, count }) => {
      return {
        species,
        count,
        speciesDisplayName: displayLabelForClassificationLabel(
          species,
          false,
          true,
        ).replace(/ /g, "&nbsp;"),
      };
    })
    .sort((a, b) => b.count - a.count);
};

interface Recipient {
  email: string;
  userName: string;
  audioReport: boolean;
  visitsReport: boolean;
  batteryReport: boolean;
}

interface ActivityLists {
  thermalVisitsList: SpeciesCount[];
  birdSpeciesList: SpeciesCount[];
  batteryReportsList: BatteryReport[];
}

// Activity is anything in the categories the recipient has opted into.
const recipientHasActivity = (
  recipient: Recipient,
  { thermalVisitsList, birdSpeciesList, batteryReportsList }: ActivityLists,
): boolean =>
  (recipient.visitsReport && thermalVisitsList.length !== 0) ||
  (recipient.audioReport && birdSpeciesList.length !== 0) ||
  (recipient.batteryReport && batteryReportsList.length !== 0);

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
  const sequelize = await initSequelize(!forceRun);
  // Default to daily, but can pass "weekly" on the command line for weekly behaviour.
  let daily = args.includes("daily");
  const weekly = args.includes("weekly");
  const suppliedNow = args.find((item) => item.includes("--at-time="));
  // In testing, we can restrict the digest to a single project, so that concurrent tests
  // don't send each other's digests.
  const suppliedGroupId = args.find((item) => item.startsWith("--group-id="));
  const onlyGroupId = suppliedGroupId
    ? Number(suppliedGroupId.replace("--group-id=", ""))
    : undefined;
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
  const digestKey = daily ? "dailyDigest" : "weeklyDigest";
  const digestGroups = await Group.findAll({
    attributes: ["groupName", "id"],
    ...(onlyGroupId !== undefined ? { where: { id: onlyGroupId } } : {}),
    include: [
      {
        model: User,
        through: {
          attributes: ["settings"],
          where: {
            [`settings.notificationPreferences.${digestKey}`]: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "false" }],
            },
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
    const recipients = group.Users.map(({ email, userName, GroupUsers }) => {
      const settings: ApiGroupUserSettings = GroupUsers?.settings || {};
      const notificationPreferences = settings.notificationPreferences || {};
      let audioReport = true;
      let batteryReport = true;
      let visitsReport = true;
      if (
        notificationPreferences[digestKey] &&
        typeof notificationPreferences[digestKey] === "object"
      ) {
        if (notificationPreferences[digestKey].audioReport === false) {
          audioReport = false;
        }
        if (notificationPreferences[digestKey].visitsReport === false) {
          visitsReport = false;
        }
        if (notificationPreferences[digestKey].batteryReport === false) {
          batteryReport = false;
        }
      }
      return {
        email,
        userName,
        audioReport,
        visitsReport,
        batteryReport,
      };
    }).filter(
      (item) => item.batteryReport || item.visitsReport || item.audioReport,
    );
    if (recipients.length === 0) {
      continue;
    }
    // Loads activity for the categories that at least one of the given recipients has opted
    // into.  The queries are per project, rather than per recipient.
    const loadActivity = async (
      from: Date,
      until: Date,
      forRecipients: Recipient[],
    ): Promise<ActivityLists> => ({
      thermalVisitsList: forRecipients.some((r) => r.visitsReport)
        ? await allVisitsForProjectInTimespan(group.id, from, until)
        : [],
      birdSpeciesList: forRecipients.some((r) => r.audioReport)
        ? await allBirdSpeciesDetectionsForProjectInTimespan(
            sequelize,
            group.id,
            from,
            until,
          )
        : [],
      batteryReportsList: forRecipients.some((r) => r.batteryReport)
        ? await allBatteryReportsForProjectInTimespan(group.id, from, until)
        : [],
    });

    const currentActivity = await loadActivity(startOfPeriod, now, recipients);

    // NOTE: Whether there was activity is decided per recipient, based only on the categories
    //  that recipient has opted into.  A recipient with no activity gets an email saying so only
    //  if this is the *first* period with no activity for them (i.e. the previous period had
    //  some), and doesn't get another until there is activity again.
    const recipientsWithoutActivity = recipients.filter(
      (recipient) => !recipientHasActivity(recipient, currentActivity),
    );
    let recipientsToEmail = recipients.filter((recipient) =>
      recipientHasActivity(recipient, currentActivity),
    );
    if (recipientsWithoutActivity.length !== 0) {
      // Check previous timespan for activity
      const previousFrom = new Date(startOfPeriod);
      const previousUntil = new Date(now);
      previousFrom.setHours(startOfPeriod.getHours() - 24 * numDays);
      previousUntil.setHours(now.getHours() - 24 * numDays);
      const previousActivity = await loadActivity(
        previousFrom,
        previousUntil,
        recipientsWithoutActivity,
      );
      recipientsToEmail = [
        ...recipientsToEmail,
        ...recipientsWithoutActivity.filter((recipient) =>
          recipientHasActivity(recipient, previousActivity),
        ),
      ];
    }
    if (recipientsToEmail.length !== 0) {
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
        recipientsToEmail,
        currentActivity.thermalVisitsList,
        currentActivity.birdSpeciesList,
        currentActivity.batteryReportsList,
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
