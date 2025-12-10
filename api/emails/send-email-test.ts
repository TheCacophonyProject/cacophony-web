import { sendAlerts } from "../api/V1/recordingUtil.js";
import { initSequelize } from "@models/index.js";

(async () => {
  await initSequelize();
  //await sendAlerts(1822136);
  await sendAlerts(1864777, true);
})();
