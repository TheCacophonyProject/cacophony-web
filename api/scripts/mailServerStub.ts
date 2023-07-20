// Call with node mailServerStub.js
import { init } from "smtp-tester";
import { appendFile, writeFile } from "fs";
const port = 7777;
const mailServer = init(port);
let num = 1;
const stubFile = "mailServerStub.log";
console.log("Init mailserver stub");
writeFile(stubFile, "SERVER: started", (err) => {
  appendFile(stubFile, `HERE ${num++}`, () => {});
  if (err) {
    console.error(err);
    appendFile(stubFile, err.toString(), () => {});
    return;
  }
});

// process single emails
mailServer.bind((addr: string, id: number, email: any) => {
  if (email.headers.to.includes("pump-smtp")) {
    // A special email address to simply pump the SMTP stub,
    // when we're expecting *NO* email to be sent on an event,
    // but we don't want the cypress test to just timeout.
    const content: string = "SERVER: received email\n";
    appendFile(stubFile, content, (err) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  } else {
    let content: string = "";
    content += "SERVER: received email\n";
    content += `SERVER: from: ${email.sender}\n`;
    content += `SERVER: subject: ${email.headers.subject}\n`;
    content += `SERVER: to: ${email.headers.to}\n`;
    content += `SERVER: body: ${email.data}\n`;
    content += "SERVER: end of mail\n";
    writeFile(stubFile, content, (err) => {
      if (err) {
        console.error(err);
        appendFile(stubFile, err.toString(), () => {});
        return;
      }
    });
  }
});
