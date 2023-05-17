import config from "../config.js";
import type { User } from "@models/User.js";
import { getPasswordResetToken } from "@api/auth.js";
import { sendEmail } from "@/emails/sendEmail.js";

export interface EmailImageAttachment {
  buffer: Buffer;
  cid: string;
  mimeType: "image/png" | "image/jpeg";
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
  const token = getPasswordResetToken(user.id, password);
  const [html, text] = resetBody(user.userName, token);
  return sendEmail(
    html,
    text,
    user.email,
    "Your request to reset your Cacophony account password"
  );
}

export { sendResetEmail };
