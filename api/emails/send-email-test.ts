import { sendAlerts } from "../api/V1/recordingUtil.js";
import modelsInit from "../models/index.js";

(async () => {
  await modelsInit();
  //await sendAlerts(1822136);
  await sendAlerts(1864777, true);
})();
