import registerAliases from "../module-aliases";
registerAliases();
import config from "../config";
import { Recording } from "@models/Recording";
import { TrackTag } from "@models/TrackTag";
import log from "../logging";
import moment from "moment";
import { SMTPClient, Message } from "emailjs";
import { Readable } from "stream";
import { User } from "@models/User";
import { getEmailConfirmationToken, getResetToken } from "@api/auth";
function alertBody(
  recording: Recording,
  tag: TrackTag,
  camera: String,
  hasThumbnail: boolean
): string[] {
  const dateTime = moment(recording.recordingDateTime)
    .tz(config.timeZone)
    .format("h:mma Do MMM");
  let html = `<b>${camera} has detected a ${tag.what} - ${dateTime}</b>`;
  if (hasThumbnail) {
    html += `<br> <a  href="${config.server.recording_url_base}/${recording.id}/${tag.TrackId}?device=${recording.DeviceId}">`;
    html += `<img width="200" height ="200" src="cid:thumbnail" alt="recording thumbnail"></a><br>`;
  }
  html += `<br><a  href="${config.server.recording_url_base}/${recording.id}/${tag.TrackId}?device=${recording.DeviceId}">View Recording</a>`;
  html += "<br><p>Thanks,<br> Cacophony Team</p>";

  let text = `${camera} has detected a ${tag.what} - ${dateTime}\r\n`;
  text += `Go to ${config.server.recording_url_base}/${recording.id}/${tag.TrackId}?device=${recording.DeviceId} to view this recording\r\n`;
  text += "Thanks, Cacophony Team";
  return [html, text];
}
function resetBody(userTitle: string, token: string): string[] {
  const resetUrl = `${config.server.browse_url}/new-password/?token=${token}`;
  let html = `Hello ${userTitle},<br><br>`;
  html += `We received a request to reset your Cacophony password.<br>`;
  html += `Click the link below to set a new password<br><br>`;
  html += `<a href="${resetUrl}">Set New Password</a><br><br>`;
  html += `If this was not you, ignore this email.<br><br>`;
  html += "Thanks,<br> Cacophony Team<br><br>";
  html += `<br>Having trouble with the link? Use this url to reset your password<br>${resetUrl}`;

  let text = `Hello ${userTitle},\r\n\r\n`;
  text += `We received a request to reset your Cacophony password.\r\n`;
  text += `Visit ${resetUrl} to set a new password.\r\n\r\n`;
  text += `If this was not you, ignore this email.\r\n\r\n`;
  text += "Thanks, Cacophony Team";
  return [html, text];
}

async function sendResetEmail(user: User, password: string): Promise<boolean> {
  const token = getResetToken(user.id, password);
  const [html, text] = resetBody(user.firstName || user.username, token);
  return sendEmail(
    html,
    text,
    user.email,
    "Your request to reset your Cacophony account password"
  );
}

export async function sendWelcomeEmailConfirmationEmail(
  user: User
): Promise<boolean> {
  // TODO - This is like the email change confirmation email, but includes a bit more of a "welcome to cacophony" vibe.

  const token = getEmailConfirmationToken(user.id, user.email);
  // FIXME - This needs to be a transactional email about confirming your email.
  // TODO - Only send automated emails to users if they have confirmed their email address.
  const [html, text] = resetBody(user.firstName || user.username, token);
  return sendEmail(
    html,
    text,
    user.email,
    "Confirm your email associated with your Cacophony account"
  );
}
export async function sendEmailConfirmationEmail(
  user: User,
  newEmailAddress: string
): Promise<boolean> {
  const token = getEmailConfirmationToken(user.id, newEmailAddress);
  // FIXME - This needs to be a transactional email about confirming your email.
  // TODO - Only send automated emails to users if they have confirmed their email address.
  const [html, text] = resetBody(user.firstName || user.username, token);
  return sendEmail(
    html,
    text,
    newEmailAddress,
    "Confirm your email associated with your Cacophony account"
  );
}

async function sendEmail(
  html: string,
  text: string,
  to: string,
  subject: string,
  thumbnail?: Buffer
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
    if (thumbnail) {
      message.attach({
        stream: Readable.from(thumbnail),
        type: "image/png",
        headers: { "Content-ID": "<thumbnail>" },
      });
    }
    await client.sendAsync(message);
  } catch (err) {
    log.error(err.toString());
    return false;
  }
  return true;
}

export { sendEmail, alertBody, sendResetEmail };
