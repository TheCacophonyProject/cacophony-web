import config from "../config.js";
import log from "../logging.js";
import type { Device } from "@models/Device.js";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";
import { DeviceType } from "@typedefs/api/consts.js";
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

const getUserEvents = async (devices: Device[]): Promise<UserGroupDevices> => {
  const groupAdmins = {};
  const userEvents = {};
  for (const device of devices) {
    if (!groupAdmins.hasOwnProperty(device.GroupId)) {
      groupAdmins[device.GroupId] = await device.Group.getUsers({
        through: { where: { admin: true, removedAt: { [Op.eq]: null } } },
      });
    }
    // TODO: Get the user group settings, and check if they've opted into these notifications.
    for (const user of groupAdmins[device.GroupId]) {
      userEvents[user.id] = userEvents[user.id] || { user: user, groups: {} };
      userEvents[user.id].groups[device.GroupId] = userEvents[user.id].groups[
        device.GroupId
      ] || { group: device.Group, devices: [] };
      userEvents[user.id].groups[device.GroupId].devices.push(device);
    }
  }
  return userEvents;
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
    if (
      device.kind === DeviceType.Thermal ||
      device.kind === DeviceType.Hybrid ||
      device.kind === DeviceType.Unknown
    ) {
      const hasAlerted =
        stoppedEvents.find(
          (event) =>
            event.DeviceId === device.id &&
            event.dateTime > device.lastConnectionTime
        ) !== undefined;
      return !hasAlerted;
    } else if (device.kind === DeviceType.Audio) {
      const hasAlerted =
        stoppedEvents.find(
          (event) =>
            event.DeviceId === device.id &&
            event.dateTime > device.lastConnectionTime
        ) !== undefined;
      return !hasAlerted;
    } else {
      return false;
    }
  });

  if (devices.length == 0) {
    log.info("No new stopped devices");
    return;
  }

  const userEvents = await getUserEvents(devices);
  const failedEmails = [];
  for (const { user, groups } of Object.values(userEvents)) {
    for (const { group, stoppedDevices } of Object.values(groups)) {
      const success = await sendStoppedDevicesReportEmail(
        config.server.browse_url.replace("https://", ""),
        group.groupName,
        stoppedDevices.map((device) => device.deviceName),
        user.email
      );
      if (!success) {
        failedEmails.push(user.email);
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
