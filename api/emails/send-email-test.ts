import { sendAlerts } from "../api/V1/recordingUtil.js";
import modelsInit from "../models/index.js";

(async () => {
  const models = await modelsInit();
  //await sendAlerts(models, 1822136);
  await sendAlerts(models, 1864777, true);
})();
