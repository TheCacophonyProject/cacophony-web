import log from "../logging.js";
import { sendAlerts } from "../api/V1/recordingUtil.js";
import { initSequelize } from "@models/index.js";

try {
  await initSequelize();
  //await sendAlerts(1822136);
  await sendAlerts(1864777, true);
} catch (e) {
  log.error(e);
  console.trace(e);
} finally {
  process.exit(0);
}
