// Call with node concurrent-mailserver-stub.js

import { init } from "smtp-tester";
import util from "util";
import { exec as cp_exec } from "child_process";
import express, { Request, Response } from "express";
const exec = util.promisify(cp_exec);

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
(async function main() {
  await checkOnlyInstanceOfScriptRunning();
  const port = 7777;
  const httpPort = 8888;
  const mailServer = init(port);
  const server = express();
  server.use(express.json());
  server.get("/", async (_request: Request, response: Response) => {
    response.json({
      running: true,
    });
  });
  server.get("/get-mail", async (request: Request, response: Response) => {
    try {
      // Maybe get all the emails from this address and return the latest one, since order isn't guaranteed?
      let suppliedTimeout: string | number = request.query.timeout as string;
      if (suppliedTimeout) {
        suppliedTimeout = Number(suppliedTimeout);
      }
      const params = {
        wait: 5000,
      };
      if (suppliedTimeout) {
        params.wait = suppliedTimeout as number;
      }
      const {
        email: { headers, body, html },
        id,
      } = await mailServer.captureOne(request.query.address as string, params);
      mailServer.remove(id);
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
      response.json({
        message: "cleared mailbox",
      });
    },
  );
  server.listen(httpPort);
})();
