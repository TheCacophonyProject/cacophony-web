import config from "../config.js";
import log from "../logging.js";
import { sendDailyServiceErrorsEmail } from "@/emails/transactionalEmails.js";
import type { Event } from "@models/Event.js";
import type { DeviceId } from "@typedefs/api/common.js";
import levenshteinEditDistance from "levenshtein-edit-distance";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";

const models = await modelsInit();

const ignoredSaltNodeGroups = ["unknown-node-group", "tc2-dev", "dev-pis"];

type LogLevel = "info" | "warn" | "error" | "fatal";
interface LogLine {
  line: string;
  level: LogLevel;
}

export interface ServiceError {
  devices: { id: DeviceId; name: string }[];
  log: LogLine[];
  count: number;
  from: Date;
  until: Date;
}

const levelWeight = (level: LogLevel) => {
  return ["info", "warn", "error", "fatal"].indexOf(level) + 1;
};

const fuzzyErrorMatchScore = (
  existingLog: LogLine[],
  log: LogLine[]
): number => {
  // NOTE: The last line (where the error cause usually is)
  //  must have similarity > 0.6, otherwise it's not a match.
  if (existingLog.length !== 0 && log.length !== 0) {
    const a = existingLog[existingLog.length - 1].line;
    const b = log[log.length - 1].line;
    const longest = Math.max(a.length, b.length);
    const diff = levenshteinEditDistance(a, b);
    const similarity = (longest - diff) / longest;
    if (similarity < 0.6) {
      return 0;
    }
  }

  // Get a levenshtein score for each line vs each other line.
  let strongSimilarityCount = 0;
  for (let i = 0; i < existingLog.length; i++) {
    const existingLine = existingLog[i];
    for (let j = 0; j < log.length; j++) {
      const newLine = log[j];
      const longest = Math.max(newLine.line.length, existingLine.line.length);
      const diff = levenshteinEditDistance(existingLine.line, newLine.line);
      const similarity = (longest - diff) / longest;
      if (similarity > 0.6) {
        // Weight errors/fatal higher than info status.
        // Weight later lines higher than earlier ones.
        const existingWeighting = (i + 1) / existingLog.length;
        const newWeighting = (j + 1) / log.length;
        const existingLevelWeight = levelWeight(existingLine.level);
        const newLevelWeight = levelWeight(newLine.level);
        strongSimilarityCount +=
          (1 + newLevelWeight + existingLevelWeight) *
          existingWeighting *
          newWeighting *
          similarity;
      }
    }
  }
  return strongSimilarityCount;
};

type GroupedServiceErrorsByNodeGroup = Record<string, GroupedServiceErrors[]>;

export interface GroupedServiceErrors {
  unit: string;
  errors: Record<string, ServiceError[]>;
}

// group provided events by logs are that are similar
const groupSystemErrors = (events: Event[]): GroupedServiceErrors[] => {
  const serviceMap: Record<string, GroupedServiceErrors> = {};
  for (const errorEvent of events) {
    const details = errorEvent.EventDetail.details;
    if (!("unitName" in details && "logs" in details)) {
      continue;
    }
    const unitName = details["unitName"].replace(".service", "");
    const serviceError = serviceMap[unitName] || {
      unit: unitName,
      errors: {},
    };
    serviceError.errors[(errorEvent as any).unitVersion] =
      serviceError.errors[(errorEvent as any).unitVersion] || [];
    serviceMap[unitName] = serviceError;

    // Take the first max(5) good lines.
    const linesWeCareAbout = [];
    let foundProcessFailLine = false;
    for (let i = details.logs.length - 1; i > -1; i--) {
      // Since these are process exits, the most interesting lines are likely the ones right before
      // 'Main process exited, code=exited, status=1/FAILURE'
      const line = details.logs[i];
      if (foundProcessFailLine && linesWeCareAbout.length < 5) {
        linesWeCareAbout.push(line);
      }
      if (
        !foundProcessFailLine &&
        line.endsWith("Main process exited, code=exited, status=1/FAILURE")
      ) {
        foundProcessFailLine = true;
      }
    }
    const levels = ["INFO", "FATAL", "WARN", "ERROR"].map((code) => [
      `[${code}]`,
      code.toLowerCase(),
    ]);
    const logLevel = (line: string): LogLine => {
      if (line.startsWith("[")) {
        // Parse out the log level and truncate the line
        for (const [level, code] of levels) {
          if (line.startsWith(level)) {
            return { line: line.replace(level, "").trim(), level: code as any };
          }
        }
      }
      return { line, level: "info" };
    };
    const lines = linesWeCareAbout.reverse().map(logLevel);
    // If the log is similar enough to an existing log, add it here, otherwise create a new log.
    for (const errors of Object.values(serviceError.errors)) {
      let bestExistingErrorMatch: ServiceError;
      let bestMatchScore = 0;
      for (const existingError of errors) {
        const matchScore = fuzzyErrorMatchScore(existingError.log, lines);
        if (matchScore >= 2 && matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
          bestExistingErrorMatch = existingError;
        }
      }
      if (bestExistingErrorMatch) {
        bestExistingErrorMatch.count++;
        if (
          !bestExistingErrorMatch.devices.find(
            ({ id }) => id === errorEvent.DeviceId
          )
        ) {
          bestExistingErrorMatch.devices.push({
            id: errorEvent.DeviceId,
            name: errorEvent.Device.deviceName,
          });
        }
        if (bestExistingErrorMatch.from > errorEvent.dateTime) {
          bestExistingErrorMatch.from = errorEvent.dateTime;
        }
        if (bestExistingErrorMatch.until < errorEvent.dateTime) {
          bestExistingErrorMatch.until = errorEvent.dateTime;
        }
      } else {
        // Add the error.
        errors.push({
          devices: [
            { id: errorEvent.DeviceId, name: errorEvent.Device.deviceName },
          ],
          count: 1,
          from: errorEvent.dateTime,
          until: errorEvent.dateTime,
          log: lines,
        });
      }
    }
  }
  return Object.values(serviceMap);
};

const getDevicesFailingSaltUpdatesInReportingPeriod = async (
  fromDate: Date,
  untilDate: Date,
  ignoredNodeGroups: string[]
): Promise<Record<string, { id: DeviceId; name: string }[]>> => {
  const ignoredDevices = config.deviceErrorIgnoreList || [];
  const saltEvents = await models.Event.findAll({
    where: {
      DeviceId: { [Op.notIn]: ignoredDevices },
      createdAt: {
        [Op.gte]: fromDate,
        [Op.lt]: untilDate,
      },
    },
    order: [["createdAt", "DESC"]],
    include: [
      {
        required: true,
        model: models.DetailSnapshot,
        as: "EventDetail",
        attributes: ["type", "details"],
        where: {
          type: "salt-update",
          "details.success": "false",
          "details.nodegroup": { [Op.notIn]: ignoredNodeGroups },
        },
      },
      {
        model: models.Device,
        attributes: ["deviceName"],
        required: true,
      },
    ],
    attributes: { exclude: ["updatedAt", "EventDetailId"] },
  });
  let failingDevices: { id: DeviceId; name: string; nodeGroup: string }[] =
    Object.values(
      saltEvents
        .map((event) => ({
          id: event.DeviceId,
          name: event.Device.deviceName,
          nodeGroup: event.EventDetail.details.nodegroup,
        }))
        .reduce((acc, curr) => {
          acc[curr.id] = curr;
          return acc;
        }, {})
    );
  const stillFailingPromises = [];
  for (const device of failingDevices) {
    stillFailingPromises.push(
      models.Event.findOne({
        where: {
          DeviceId: device.id,
        },
        order: [["createdAt", "DESC"]],
        include: [
          {
            required: true,
            model: models.DetailSnapshot,
            as: "EventDetail",
            attributes: ["type", "details"],
            where: {
              type: "salt-update",
            },
          },
        ],
        attributes: { exclude: ["updatedAt", "EventDetailId"] },
      })
    );
  }
  const stillFailingEvents = await Promise.all(stillFailingPromises);
  for (const event of stillFailingEvents) {
    if (event.EventDetail.details.success !== false) {
      // The latest event for the device shows that salt succeeded eventually.
      failingDevices = failingDevices.filter(
        (device) => device.id !== event.DeviceId
      );
    }
  }
  return failingDevices.reduce((acc, item) => {
    acc[item.nodeGroup] = acc[item.nodeGroup] || [];
    acc[item.nodeGroup].push({ id: item.id, name: item.name });
    return acc;
  }, {});
};

const groupedSystemErrors = async (
  fromDate?: Date,
  untilDate?: Date
): Promise<GroupedServiceErrorsByNodeGroup> => {
  const where: any = {};
  if (fromDate || untilDate) {
    where.createdAt = {};
    if (fromDate) {
      where.createdAt[Op.gte] = fromDate;
    }
    if (untilDate) {
      where.createdAt[Op.lt] = untilDate;
    }
  }
  const ignoredDevices = config.deviceErrorIgnoreList || [];
  const serviceErrorEvents = (
    await models.Event.findAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [
        {
          required: true,
          model: models.DetailSnapshot,
          as: "EventDetail",
          attributes: ["type", "details"],
          where: {
            type: "systemError",
          },
        },
        {
          model: models.Device,
          attributes: ["deviceName"],
          required: true,
        },
      ],
      attributes: { exclude: ["updatedAt", "EventDetailId"] },
      limit: 10000,
    })
  )
    .filter(
      (event) =>
        "unitName" in event.EventDetail.details &&
        "logs" in event.EventDetail.details
    )
    .filter((event) => !ignoredDevices.includes(event.DeviceId));

  // Work out the node groups for each device of these events.
  // Get all the unique devices for the set of events:
  const devices: Record<DeviceId, { minDate: Date; maxDate: Date }> = {};
  for (const errorEvent of serviceErrorEvents) {
    const existingDeviceSpan = devices[errorEvent.DeviceId] || {
      minDate: errorEvent.dateTime,
      maxDate: errorEvent.dateTime,
    };
    if (errorEvent.dateTime < existingDeviceSpan.minDate) {
      existingDeviceSpan.minDate = errorEvent.dateTime;
    }
    if (errorEvent.dateTime > existingDeviceSpan.maxDate) {
      existingDeviceSpan.maxDate = errorEvent.dateTime;
    }
    devices[errorEvent.DeviceId] = existingDeviceSpan;
  }
  const saltUpdates = [];
  const versionUpdates = [];
  for (const [deviceId, { maxDate }] of Object.entries(devices)) {
    // What node group is the device in during the time period?
    saltUpdates.push(
      models.Event.findOne({
        where: {
          DeviceId: deviceId,
          dateTime: {
            // Last successful salt-update before this event period.
            // What if node-groups changed during the event period?
            [Op.lt]: maxDate,
          },
        },
        order: [["dateTime", "DESC"]],
        include: [
          {
            required: true,
            model: models.DetailSnapshot,
            as: "EventDetail",
            attributes: ["type", "details"],
            where: {
              type: "salt-update",
            },
          },
        ],
        attributes: { exclude: ["updatedAt", "EventDetailId"] },
      })
    );

    versionUpdates.push(
      models.Event.findOne({
        where: {
          DeviceId: deviceId,
          dateTime: {
            // Last successful versionUpdate before this event period.
            [Op.lt]: maxDate,
          },
        },
        order: [["dateTime", "DESC"]],
        include: [
          {
            required: true,
            model: models.DetailSnapshot,
            as: "EventDetail",
            attributes: ["type", "details"],
            where: {
              type: "versionData",
            },
          },
        ],
        attributes: { exclude: ["updatedAt", "EventDetailId"] },
      })
    );
  }
  const saltEvents: Event[] = await Promise.all(saltUpdates);
  const versionDataEvents: Event[] = await Promise.all(versionUpdates);
  for (let i = 0; i < versionDataEvents.length; i++) {
    const deviceId = Number(Object.keys(devices)[i]);
    if (!versionDataEvents[i]) {
      // Never got version data for this device.
      for (const event of serviceErrorEvents.filter(
        (event) => event.DeviceId === deviceId
      )) {
        (event as any).unitVersion = "unknown-version";
      }
      continue;
    }
    const versionDataEvent = versionDataEvents[i];
    for (const event of serviceErrorEvents.filter(
      (event) => event.DeviceId === deviceId
    )) {
      const eventUnit = event.EventDetail.details.unitName.replace(
        ".service",
        ""
      );
      if (eventUnit in versionDataEvent.EventDetail.details) {
        (event as any).unitVersion =
          versionDataEvent.EventDetail.details[eventUnit];
      } else {
        (event as any).unitVersion = "unknown-version";
      }
    }
  }

  const eventsByNodeGroup = {};
  for (let i = 0; i < saltEvents.length; i++) {
    const deviceId = Number(Object.keys(devices)[i]);
    if (!saltEvents[i]) {
      const nodeGroup = "unknown-node-group";
      // All events for this device belong in this nodegroup:
      eventsByNodeGroup[nodeGroup] = eventsByNodeGroup[nodeGroup] || [];
      eventsByNodeGroup[nodeGroup].push(
        ...serviceErrorEvents.filter((event) => event.DeviceId === deviceId)
      );
      continue;
    }
    const saltEvent = saltEvents[i];
    if (saltEvent.dateTime > devices[saltEvent.DeviceId].minDate) {
      // Get an earlier salt events for this device just in case the node-group changed
      const earlierSaltEvent = await models.Event.findOne({
        where: {
          DeviceId: saltEvent.DeviceId,
          dateTime: {
            // Last successful salt-update before this event period.
            // What if node-groups changed during the event period?
            [Op.lt]: saltEvent.dateTime,
          },
        },
        order: [["dateTime", "DESC"]],
        include: [
          {
            required: true,
            model: models.DetailSnapshot,
            as: "EventDetail",
            attributes: ["type", "details"],
            where: {
              type: "salt-update",
            },
          },
        ],
        attributes: { exclude: ["updatedAt", "EventDetailId"] },
      });
      if (earlierSaltEvent) {
        // NOTE: If the node-group changed, it's possible we attribute events to the wrong version of a service,
        //  but probably not worth trying to be clever here.
        const currentNodeGroup = saltEvent.EventDetail.details.nodegroup;
        const olderNodeGroup = earlierSaltEvent.EventDetail.details.nodegroup;
        if (olderNodeGroup !== currentNodeGroup) {
          // Split events for this device between multiple node-groups.
          eventsByNodeGroup[currentNodeGroup] =
            eventsByNodeGroup[currentNodeGroup] || [];
          eventsByNodeGroup[currentNodeGroup].push(
            ...serviceErrorEvents.filter(
              (event) =>
                event.DeviceId === saltEvent.DeviceId &&
                event.dateTime > saltEvent.dateTime
            )
          );

          eventsByNodeGroup[olderNodeGroup] =
            eventsByNodeGroup[currentNodeGroup] || [];
          eventsByNodeGroup[olderNodeGroup].push(
            ...serviceErrorEvents.filter(
              (event) =>
                event.DeviceId === saltEvent.DeviceId &&
                event.dateTime < saltEvent.dateTime
            )
          );
          continue;
        }
      }
    }
    const nodeGroup = saltEvent.EventDetail.details.nodegroup;
    // All events for this device belong in this nodegroup:
    eventsByNodeGroup[nodeGroup] = eventsByNodeGroup[nodeGroup] || [];
    eventsByNodeGroup[nodeGroup].push(
      ...serviceErrorEvents.filter(
        (event) => event.DeviceId === saltEvent.DeviceId
      )
    );
  }
  const groupedErrorsByNodeGroup = {};
  for (const nodeGroupEvents of Object.entries(eventsByNodeGroup)) {
    groupedErrorsByNodeGroup[nodeGroupEvents[0]] = groupSystemErrors(
      nodeGroupEvents[1] as Event[]
    );
  }
  return groupedErrorsByNodeGroup;
};

async function main() {
  if (!config.smtpDetails) {
    throw "No SMTP details found in config/app.js";
  }
  if (!config.smtpDetails.serviceErrorsEmail) {
    throw "No recipients configured for service error emails in config/app.js";
  }
  if (!config.server) {
    throw "'server' not configured in config/app.js";
  }
  if (!config.server.browse_url) {
    throw "'browse_url' not configured in config/app.js";
  }
  // Make sure that we always report from the same time offset, regardless of when this script is run.
  const endDate = new Date();
  endDate.setHours(9, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setHours(endDate.getHours() - 24);

  const groupedServiceErrorsByNodeGroup = await groupedSystemErrors(
    startDate,
    endDate
  );
  for (const ignoredNodeGroup of ignoredSaltNodeGroups) {
    delete groupedServiceErrorsByNodeGroup[ignoredNodeGroup];
  }
  const failingSaltUpdates =
    await getDevicesFailingSaltUpdatesInReportingPeriod(
      startDate,
      endDate,
      ignoredSaltNodeGroups
    );
  if (Object.keys(groupedServiceErrorsByNodeGroup).length === 0) {
    log.info("No service errors in the last 24 hours");
  }

  await sendDailyServiceErrorsEmail(
    config.server.browse_url.replace("https://", ""),
    config.smtpDetails.serviceErrorsEmail,
    startDate,
    endDate,
    groupedServiceErrorsByNodeGroup,
    failingSaltUpdates
  );
}

main()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
