import registerAliases from "../module-aliases";
registerAliases();
import config from "../config";
import log from "../logging";
import { Device } from "@models/Device";

import moment from "moment";
import models from "../models";
import { sendEmail } from "@/emails/sendEmail";

async function getUserEvents(devices: Device[]) {
  const groupAdmins = {};
  const userEvents = {};

  for (const device of devices) {
    if (!groupAdmins.hasOwnProperty(device.GroupId)) {
      const adminUsers = await device.Group.getUsers({
        through: { where: { admin: true } },
      });
      groupAdmins[device.GroupId] = adminUsers;
    }
    for (const user of groupAdmins[device.GroupId]) {
      if (userEvents.hasOwnProperty(user.id)) {
        userEvents[user.id].devices.push(device);
      } else {
        userEvents[user.id] = { user: user, devices: [device] };
      }
    }
  }
  return userEvents;
}

async function main() {
  if (!config.smtpDetails) {
    throw "No SMTP details found in config/app.js";
  }
  let devices = await models.Device.stoppedDevices();
  const stoppedEvents = await models.Event.latestEvents(null, null, {
    useCreatedDate: false,
    admin: true,
    eventType: ["stop-reported"],
  });

  //filter devices which have already been alerted on
  devices = devices.filter(
    (device) =>
      !stoppedEvents.find(
        (event) =>
          event.DeviceId == device.id && event.dateTime > device.nextHeartbeat
      )
  );

  if (devices.length == 0) {
    log.info("No new stopped devices");
    return;
  }

  const userEvents = await getUserEvents(devices);

  const failedEmails = [];
  for (const userID in userEvents) {
    const userInfo = userEvents[userID];
    const html = generateHtml(userInfo.devices);
    const text = generateText(userInfo.devices);
    if (
      !(await sendEmail(html, text, userInfo.user.email, "Stopped Devices"))
    ) {
      failedEmails.push(userInfo.user.email);
    }
  }
  if (config.server.adminEmails) {
    for (const email of config.server.adminEmails) {
      const html = generateHtml(devices);
      const text = generateText(devices);
      if (!(await sendEmail(html, text, email, "Stopped Devices"))) {
        failedEmails.push(email);
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

function generateText(stoppedDevices: Device[]): string {
  let textBody = `Stopped Devices ${moment().format("MMM ddd Do ha")}\r\n`;
  for (const device of stoppedDevices) {
    const deviceText = `${device.Group.groupname}- ${device.devicename} id: ${
      device.id
    } has stopped, last last message at ${moment(device.heartbeat).format(
      "MMM ddd Do ha"
    )} expected to hear again at  ${moment(device.nextHeartbeat).format(
      "MMM ddd Do ha"
    )}\r\n`;
    textBody += deviceText;
  }
  textBody += "Thanks, Cacophony Team";
  return textBody;
}

function generateHtml(stoppedDevices: Device[]): string {
  let html = `<b>Stopped Devices ${moment().format("MMM ddd Do ha")} </b>`;
  html += "<ul>";
  for (const device of stoppedDevices) {
    const deviceText = `<li>${device.Group.groupname}-${
      device.devicename
    } id: ${device.id} has stopped, received last message at ${moment(
      device.heartbeat
    ).format("MMM ddd Do ha")} expected to hear again at ${moment(
      device.nextHeartbeat
    ).format("MMM ddd Do ha")}</li>`;
    html += deviceText;
  }
  html += "</ul>";
  html += "<br><p>Thanks,<br> Cacophony Team</p>";
  return html;
}

main()
  .catch(log.error)
  .then(() => {
    process.exit(0);
  });
