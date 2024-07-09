import config from "../config.js";
import log from "../logging.js";
import type { Device } from "@models/Device.js";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";
import { sendStoppedDevicesReportEmail } from "@/emails/transactionalEmails.js";
import type { GroupId, UserId } from "@typedefs/api/common.js";
import type { User } from "@models/User.js";
import type { Group } from "@models/Group.js";

const models = await modelsInit();

type UserGroupDevices = Record<
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
  const recipientUsers = {};
  for (const device of devices) {
    if (!recipientUsers.hasOwnProperty(device.GroupId)) {
      recipientUsers[device.GroupId] = await device.Group.getUsers({
        through: {
          where: {
            [Op.or]: [
              {
                [Op.and]: [
                  { admin: true },
                  {
                    [Op.ne]: {
                      "settings.notificationPreferences.reportStoppedDevices":
                        false,
                    },
                  },
                ],
              },
              { "settings.notificationPreferences.reportStoppedDevices": true },
            ],
            removedAt: { [Op.eq]: null },
          },
        },
      });
    }
  }
  const groupUserDevices = {};
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
  if (!config.smtpDetails) {
    throw "No SMTP details found in config/app.js";
  }
  const stoppedEvents = await models.Event.latestEvents(null, null, {
    useCreatedDate: false,
    admin: true,
    eventType: ["stop-reported"],
  });

  // filter devices which have already been alerted on
  const devices = (await models.Device.stoppedDevices()).filter((device) => {
    const hasAlerted =
      stoppedEvents.find(
        (event) =>
          event.DeviceId === device.id &&
          event.dateTime > device.lastConnectionTime
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
      config.server.browse_url.replace("https://", ""),
      group.groupName,
      stoppedDevices.map((device) => device.deviceName),
      userEmails
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
      failedEmails.join(", ")
    );
  }

  const detail = await models.DetailSnapshot.getOrCreateMatching(
    "stop-reported",
    {}
  );
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
    await models.Event.bulkCreate(eventList);
  } catch (exception) {
    log.error("Failed to record stop-reported events. %s", exception.message);
  }
}

main()
  .catch(log.error)
  .then(() => {
    process.exit(0);
  });
