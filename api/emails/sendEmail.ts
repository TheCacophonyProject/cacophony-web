import {Message, SMTPClient} from "emailjs";
import config from "@config";
import log from "@log";
import {Readable} from "stream";
import {EmailImageAttachment} from "@/scripts/emailUtil";

export async function sendEmail(
    html: string,
    text: string,
    to: string,
    subject: string,
    imageAttachments: EmailImageAttachment[] = [],
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
                headers: { "Content-ID": `<${image.cid}>`}
            });
        }
        await client.sendAsync(message);
    } catch (err) {
        log.error(err.toString());
        return false;
    }
    return true;
}
