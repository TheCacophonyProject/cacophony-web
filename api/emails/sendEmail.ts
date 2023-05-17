import { Message, SMTPClient } from "emailjs";
import config from "@config";
import log from "@log";
import { Readable } from "stream";
import type { EmailImageAttachment } from "@/scripts/emailUtil.js";
import type {Recording} from "@models/Recording.js";
import type {TrackTag} from "@models/TrackTag.js";
import moment from "moment";
import type {Alert} from "@models/Alert.js";


export function alertBody(
    recording: Recording,
    tag: TrackTag,
    alert: Alert,
    hasThumbnail: boolean,
    camera?: string,
    station?: string,

): string[] {
  const dateTime = moment(recording.recordingDateTime)
      .tz(config.timeZone)
      .format("h:mma Do MMM");
  let html = camera
      ? `<b>${camera} has detected a ${tag.what} - ${dateTime}</b>`
      : `<b>${tag.what} detected at station ${station} - ${dateTime}</b>`;
  if (hasThumbnail) {
    html += `<br> <a href="${config.server.recording_url_base}/${recording.id}/${tag.TrackId}">`;
    html += `<img width="200" height ="200" src="cid:thumbnail" alt="recording thumbnail"></a><br>`;
  }

  html += `<br><a href="${config.server.recording_url_base}/${recording.id}/${tag.TrackId}">View Recording</a>`;
  if (station) {
    html += `<br><br><a href="${config.server.browse_url}/groups/${recording.Group.groupName}/station/${recording.Station.name}/${recording.Station.id}/alerts/${alert.id}">Remove this alert</a>`;
  }
  html += "<br><p>Thanks,<br> Cacophony Team</p>";

  let text = camera
      ? `${camera} has detected a ${tag.what} - ${dateTime}\r\n`
      : `${tag.what} detected at station ${station} - ${dateTime}\r\n`;
  text += `Go to ${config.server.recording_url_base}/${recording.id}/${tag.TrackId} to view this recording\r\n`;
  if (station) {
    text += `Go to ${config.server.browse_url}/groups/${recording.Group.groupName}/station/${recording.Station.name}/${recording.Station.id}/alerts/${alert.id} to remove this alert\r\n`;
  }
  text += "Thanks, Cacophony Team";
  return [html, text];
}

export async function sendEmail(
  html: string,
  text: string,
  to: string,
  subject: string,
  imageAttachments: EmailImageAttachment[] = []
): Promise<boolean> {
  const client = new SMTPClient(config.smtpDetails);
  log.info(`Sending email with subject ${subject} to ${to}`);
  try {
    const message = new Message({
      text,
      to,
      subject,
      from: config.smtpDetails.from_name,
      attachment: [{ data: html, alternative: true }],
    });
    for (const image of imageAttachments) {
      message.attach({
        stream: Readable.from(image.buffer),
        type: image.mimeType,
        headers: { "Content-ID": `<${image.cid}>` },
      });
    }
    await client.sendAsync(message);
  } catch (err) {
    log.error(err.toString());
    return false;
  }
  return true;
}
