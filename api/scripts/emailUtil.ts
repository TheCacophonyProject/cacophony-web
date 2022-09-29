import registerAliases from "../module-aliases";
registerAliases();
import config from "../config";
import { Recording } from "@models/Recording";
import { TrackTag } from "@models/TrackTag";
import moment from "moment";
import { User } from "@models/User";
import { getEmailConfirmationToken, getResetToken } from "@api/auth";
import { sendEmail } from "@/emails/sendEmail";

export interface EmailImageAttachment {
  buffer: Buffer;
  cid: string;
  mimeType: "image/png" | "image/jpeg";
}

function alertBody(
  recording: Recording,
  tag: TrackTag,
  hasThumbnail: boolean,
  camera?: string,
  station?: string
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

  html += `<br><a  href="${config.server.recording_url_base}/${recording.id}/${tag.TrackId}">View Recording</a>`;
  html += "<br><p>Thanks,<br> Cacophony Team</p>";

  let text = camera
    ? `${camera} has detected a ${tag.what} - ${dateTime}\r\n`
    : `${tag.what} detected at station ${station} - ${dateTime}\r\n`;
  text += `Go to ${config.server.recording_url_base}/${recording.id}/${tag.TrackId} to view this recording\r\n`;
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
  const [html, text] = resetBody(user.userName, token);
  return sendEmail(
    html,
    text,
    user.email,
    "Your request to reset your Cacophony account password"
  );
}

// export async function sendWelcomeEmailConfirmationEmail(
//   user: User
// ): Promise<boolean> {
//   // TODO - This is like the email change confirmation email, but includes a bit more of a "welcome to cacophony" vibe.
//
//   const token = getEmailConfirmationToken(user.id, user.email);
//   // FIXME - This needs to be a transactional email about confirming your email.
//   // TODO - Only send automated emails to users if they have confirmed their email address.
//   const [html, text] = resetBody(user.userName, token);
//   return sendEmail(
//     html,
//     text,
//     user.email,
//     "Confirm your email associated with your Cacophony account"
//   );
// }
export async function sendEmailConfirmationEmail(
  user: User,
  newEmailAddress: string
): Promise<boolean> {
  const token = getEmailConfirmationToken(user.id, newEmailAddress);
  // FIXME - This needs to be a transactional email about confirming your email.
  // TODO - Only send automated emails to users if they have confirmed their email address.
  const [html, text] = resetBody(user.userName, token);
  return sendEmail(
    html,
    text,
    newEmailAddress,
    "Confirm your email associated with your Cacophony account"
  );
}

export { alertBody, sendResetEmail };
