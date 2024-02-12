// Call with node mailServerStub.js
import { init } from "smtp-tester";
import { appendFile, writeFile } from "fs";
import util from "util";
import { exec as cp_exec } from "child_process";
const port = 7777;
const exec = util.promisify(cp_exec);

const checkOnlyInstanceOfScriptRunning = async () => {
  const me = [process.pid, process.ppid];
  // eslint-disable-next-line no-undef
  const { stdout } = await exec("pgrep -f mailServerStub");
  const lines = stdout.split("\n");
  const processes = lines
    .filter((i) => i.trim() !== "")
    .map((i) => Number(i.trim()))
    .filter((i) => !me.includes(i));

  if (processes.length !== 0) {
    // Make sure the process in question is node
    const { stdout } = await exec("pgrep -f node");
    const lines = stdout
      .split("\n")
      .filter((i) => i.trim() !== "")
      .map((i) => Number(i.trim()));
    for (const processId of processes) {
      if (lines.includes(processId)) {
        // Already running
        console.log("mailServerStub already running");
        process.exit(0);
      }
    }
  }
};
(async function main() {
  await checkOnlyInstanceOfScriptRunning();
  const mailServer = init(port);
  const stubFile = "mailServerStub.log";
  console.log("Init mailserver stub");
  writeFile(stubFile, "SERVER: started", (err) => {
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
})();
