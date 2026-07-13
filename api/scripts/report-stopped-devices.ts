import config from "../config.js";
import log from "../logging.js";
import { Device } from "@models/Device.js";
import { Event } from "@models/Event.js";
import { initSequelize } from "@models/index.js";
import { BelongsToManyGetAssociationsMixinOptions, Op } from "sequelize";
import { sendStoppedDevicesReportEmail } from "@/emails/transactionalEmails.js";
import type { GroupId, UserId } from "@typedefs/api/common.js";
import type { User } from "@models/User.js";
import type { Group } from "@models/Group.js";
import os from "os";
import { DetailSnapshot } from "@models/DetailSnapshot.js";

await initSequelize();

type _UserGroupDevices = Record<
  UserId,
  {
    user: User;
    groups: Record<GroupId, { group: Group; stoppedDevices: Device[] }>;
  }
>;

type GroupUserDevices = Record<
  GroupId,
  {
    group: Group;
    stoppedDevices: Device[];
    users: User[];
  }
>;

const getUserEvents = async (devices: Device[]): Promise<GroupUserDevices> => {
  const recipientUsers: Record<GroupId, User[]> = {};
  for (const device of devices) {
    if (!Object.prototype.hasOwnProperty.call(recipientUsers, device.GroupId)) {
      recipientUsers[device.GroupId] = await device.Group.getUsers({
        where: { emailConfirmed: true },
        through: {
          where: {
            [Op.or]: [
              {
                admin: true,
                [Op.and]: [
                  {
                    "settings.notificationPreferences.reportStoppedDevices": {
                      [Op.eq]: null,
                    },
                  },
                ],
              },
              { "settings.notificationPreferences.reportStoppedDevices": true },
            ],
            removedAt: { [Op.eq]: null },
          },
        },
      } as BelongsToManyGetAssociationsMixinOptions);
    }
  }
  const groupUserDevices: GroupUserDevices = {};
  for (const device of devices) {
    groupUserDevices[device.GroupId] = groupUserDevices[device.GroupId] || {
      stoppedDevices: [],
      users: recipientUsers[device.GroupId],
      group: device.Group,
    };
    groupUserDevices[device.GroupId].stoppedDevices.push(device);
  }
  return groupUserDevices;
};

async function main() {
  const args = process.argv.slice(2); // Remove the first two default paths
  const forceRun = args.length !== 0 && args[0] === "--force";
  if (config.cronScriptProcessingHostname !== os.hostname() && !forceRun) {
    return;
  }
  if (!config.smtpDetails) {
    throw "No SMTP details found in config/app.js";
  }
  const stoppedEvents = await Event.latestEventsOfTypes(["stop-reported"]);
  // filter devices which have already been alerted on
  const devices = (await Device.stoppedDevices()).filter((device) => {
    const hasAlerted =
      stoppedEvents.find(
        (event) =>
          event.DeviceId === device.id &&
          event.dateTime > device.lastConnectionTime,
      ) !== undefined;
    return !hasAlerted;
  });
  if (devices.length == 0) {
    log.info("No new stopped devices");
    return;
  }

  const userEvents = await getUserEvents(devices);
  const failedEmails = [];
  for (const { group, stoppedDevices, users } of Object.values(userEvents)) {
    const userEmails = users.map(({ email, emailConfirmed }) => ({
      email,
      emailConfirmed,
    }));
    const successes = await sendStoppedDevicesReportEmail(
      group.groupName,
      stoppedDevices.map((device) => device.deviceName),
      userEmails,
    );
    for (let i = 0; i < successes.length; i++) {
      if (!successes[i]) {
        failedEmails.push(userEmails[i].email);
      }
    }
  }

  if (failedEmails.length) {
    log.error(
      "Failed sending stopped devices email to %s",
      failedEmails.join(", "),
    );
  }

  const detail = await DetailSnapshot.getOrCreateMatching("stop-reported", {});
  const detailsId = detail.id;
  const eventList = [];
  const time = new Date();

  for (const device of devices) {
    eventList.push({
      DeviceId: device.id,
      EventDetailId: detailsId,
      dateTime: time,
    });
  }
  try {
    await Event.bulkCreate(eventList);
  } catch (exception: unknown) {
    let message = "unknown error";
    if (exception instanceof Error) {
      message = exception.message;
    }
    log.error("Failed to record stop-reported events. %s", message);
  }
}

main()
  .catch((e) => {
    log.error(e);
    console.trace(e);
  })
  .then(() => {
    process.exit(0);
  });
