import log from "@log";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";
import type { ApiDeviceHistorySettings } from "@typedefs/api/device.js";
const models = await modelsInit();
(async () => {
  const results = await models.sequelize.query(`
    select distinct on
      (dh."uuid") dh."DeviceId",
      dh."GroupId",
      dh."uuid",
      dh."location",
      dh."fromDateTime",
      dh."settings",
      dh."setBy"
    from
      "DeviceHistory" dh
    where dh.settings is not null and dh.location is not null
    order by
      dh."uuid" ,
      dh."fromDateTime" desc
  `);
  for (const item of results[0]) {
    const allEntries = await models.DeviceHistory.findAll({
      where: {
        DeviceId: item["DeviceId"],
        GroupId: item["GroupId"],
        settings: { [Op.ne]: null },
      },
      order: [["fromDateTime", "asc"]],
    });
    let settings: ApiDeviceHistorySettings = {};
    let prevEntry;
    for (const entry of allEntries) {
      if (prevEntry) {
        const entryIsRatThreshOnlyEntry =
          Object.keys(entry.settings).length === 1 &&
          Object.keys(entry.settings).includes("ratThresh");
        if (!entryIsRatThreshOnlyEntry) {
          if (prevEntry.settings.maskRegions && !entry.settings.maskRegions) {
            delete settings.maskRegions;
          }
          if (
            prevEntry.settings.referenceImagePOV &&
            !entry.settings.referenceImagePOV
          ) {
            delete settings.referenceImagePOV;
          }
          if (
            prevEntry.settings.referenceImageInSitu &&
            !entry.settings.referenceImageInSitu
          ) {
            delete settings.referenceImageInSitu;
          }
          if (
            prevEntry.settings.referenceImageInSituFileSize &&
            !entry.settings.referenceImageInSituFileSize
          ) {
            delete settings.referenceImageInSituFileSize;
          }
          if (
            prevEntry.settings.referenceImagePOVFileSize &&
            !entry.settings.referenceImagePOVFileSize
          ) {
            delete settings.referenceImagePOVFileSize;
          }
          if (
            prevEntry.location.lat !== entry.location.lat ||
            prevEntry.location.lng !== entry.location.lng
          ) {
            // Location changed, remove location specific device settings
            delete settings.referenceImageInSitu;
            delete settings.referenceImagePOV;
            delete settings.referenceImageInSituFileSize;
            delete settings.referenceImagePOVFileSize;
            delete settings.maskRegions;
            delete settings.warp;
            delete settings.ratThresh;
          }
        }
      }
      settings = {
        ...settings,
        ...entry.settings,
      };
      prevEntry = entry;
    }
    await models.DeviceHistory.updateDeviceSettings(
      item["DeviceId"],
      item["GroupId"],
      settings,
      "user"
    );
  }
})()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
