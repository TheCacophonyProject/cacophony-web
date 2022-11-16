// Call with node mailServerStub.js
const port = 7777;
import { init } from "smtp-tester";
import { appendFile, writeFile } from "fs";
const mailServer = init(port);
writeFile("mailServerStub.log", "SERVER: started", (err) => {
  if (err) {
    console.error(err);
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
    appendFile("mailServerStub.log", content, (err) => {
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
    writeFile("mailServerStub.log", content, (err) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  }
});
