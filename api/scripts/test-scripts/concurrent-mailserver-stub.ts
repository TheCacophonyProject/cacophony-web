// Call with node concurrent-mailserver-stub.js

import { init } from "smtp-tester";
import type { MailServer } from "smtp-tester";
import util from "util";
import { exec as cp_exec } from "child_process";
import express, { Request, Response } from "express";
const exec = util.promisify(cp_exec);

type EmailInfo = Parameters<Parameters<MailServer["bind"]>[0]>[2];

const checkOnlyInstanceOfScriptRunning = async () => {
  const me = [process.pid, process.ppid];
  const { stdout } = await exec("pgrep -f concurrent-mailserver-stub");
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
        console.log("concurrent-mailserver-stub already running");
        process.exit(0);
      }
    }
  }
};

interface BufferedEmail {
  id: number;
  email: EmailInfo;
}

interface Waiter {
  address: string;
  subject?: string;
  resolve: (email: BufferedEmail["email"]) => void;
  timer: ReturnType<typeof setTimeout>;
}

(async function main() {
  await checkOnlyInstanceOfScriptRunning();
  const port = 7777;
  const httpPort = 8888;
  const mailServer = init(port);
  const server = express();
  server.use(express.json());

  // Emails are buffered here (keyed by nothing in particular - just arrival
  // order) rather than being consumed straight out of smtp-tester's own
  // store, so that a `/get-mail` request which filters by subject can skip
  // over non-matching emails without discarding them - they stay available
  // for whichever later request actually wants them.
  let nextBufferedId = 0;
  const pendingEmails: BufferedEmail[] = [];
  const waiters: Waiter[] = [];

  const matches = (email: EmailInfo, address: string, subject?: string) => {
    // smtp-tester's own types declare `receivers` as `Record<"string", true>`
    // (a literal key, not a string index signature), so we cast to index it.
    if (!(email.receivers as Record<string, boolean>)[address]) {
      return false;
    }
    if (
      subject &&
      !String(email.headers.subject ?? "")
        .toLowerCase()
        .includes(subject.toLowerCase())
    ) {
      return false;
    }
    return true;
  };

  const tryDeliverToWaiters = () => {
    for (const waiter of waiters) {
      const index = pendingEmails.findIndex((buffered) =>
        matches(buffered.email, waiter.address, waiter.subject),
      );
      if (index !== -1) {
        const [buffered] = pendingEmails.splice(index, 1);
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(buffered.email);
        // Re-run from the top since we mutated `waiters` mid-iteration.
        tryDeliverToWaiters();
        return;
      }
    }
  };

  // Bind once for every message, immediately move it out of smtp-tester's
  // own store and into our own buffer so it survives until something asks
  // for it (matching or not).
  mailServer.bind((_address: string | null, id: number, email: EmailInfo) => {
    mailServer.remove(id);
    pendingEmails.push({ id: nextBufferedId++, email });
    tryDeliverToWaiters();
  });

  server.get("/", async (_request: Request, response: Response) => {
    response.json({
      running: true,
    });
  });

  server.get("/get-mail", async (request: Request, response: Response) => {
    const address = request.query.address as string;
    const subject = (request.query.subject as string) || undefined;
    let wait = 5000;
    if (request.query.timeout) {
      wait = Number(request.query.timeout as string);
    }

    const existingIndex = pendingEmails.findIndex((buffered) =>
      matches(buffered.email, address, subject),
    );
    if (existingIndex !== -1) {
      const [buffered] = pendingEmails.splice(existingIndex, 1);
      const { headers, body, html } = buffered.email;
      response.json({ headers, body, html });
      return;
    }

    try {
      const email = await new Promise<EmailInfo>((resolve, reject) => {
        const waiter: Waiter = {
          address,
          subject,
          resolve,
          timer: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`No message delivered to ${address}`));
          }, wait),
        };
        waiters.push(waiter);
      });
      const { headers, body, html } = email;
      response.json({ headers, body, html });
    } catch (e) {
      response.json({
        error: e.toString(),
      });
    }
  });

  server.get(
    "/clear-mailbox",
    async (_request: Request, response: Response) => {
      mailServer.removeAll();
      pendingEmails.length = 0;
      response.json({
        message: "cleared mailbox",
      });
    },
  );

  server.listen(httpPort);
})();
