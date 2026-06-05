import log from "@/logging.js";
import { Device } from "@models/Device.js";
import { initSequelize } from "@models/index.js";
await initSequelize();

// This script exists to induce a state where a device last communicated with the API over 25hrs ago
// which allows sending of stopped-device-report emails in test scenarios.
async function main() {
  const args = process.argv.slice(2); // Remove the first two default paths
  console.log(args.join(", "));
  if (!args.includes("--deviceId") || args.length !== 2) {
    throw new Error("No device id specified");
  }
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  if (args[0] === "--deviceId" && !isNaN(parseInt(args[1]))) {
    const deviceId = parseInt(args[1]);
    const device = await Device.findByPk(deviceId);
    // TODO handle "audio only" devices, which need a longer timeout/cooldown before sending emails
    device.lastConnectionTime = twoDaysAgo;
    await device.update({
      lastConnectionTime: twoDaysAgo,
    });
    console.log("device updated");
  } else {
    throw new Error("No device id specified");
  }
}

main()
  .catch((e) => {
    log.error(e);
    console.trace(e);
  })
  .then(() => {
    process.exit(0);
  });
