import { Message, SMTPClient } from "emailjs";
import config from "@config";
import log from "@log";
import { Readable } from "stream";
import { type EmailImageAttachment } from "@/emails/htmlEmailUtils.js";

export async function sendEmail(
  html: string,
  text: string,
  to: string,
  subject: string,
  imageAttachments: EmailImageAttachment[] = [],
  adminEmails: string[] = [],
): Promise<boolean> {
  const client = new SMTPClient(config.smtpDetails);
  log.info(`Sending email with subject ${subject} to ${to}`);
  try {
    const messageHeaders = {
      text,
      to,
      subject,
      from: config.smtpDetails.fromName,
      attachment: [{ data: html, alternative: true }],
      bcc: [] as string[],
    };
    if (adminEmails && adminEmails.length) {
      messageHeaders.bcc = adminEmails;
    }
    const message = new Message(messageHeaders);
    for (const image of imageAttachments) {
      message.attach({
        stream: Readable.from(image.buffer),
        type: image.mimeType,
        headers: { "Content-ID": `<${image.cid}>` },
        name: image.cid,
      });
    }
    await client.sendAsync(message);
  } catch (err) {
    log.error(err.toString());
    return false;
  }
  return true;
}
