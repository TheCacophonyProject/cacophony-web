import log from "../logging.js";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";

const models = await modelsInit();

async function main() {
  // log.info("Removing events older than 30 days");
  //
  // const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));
  // const eventTypesToRemove = [
  //   "--help",
  //   "AttinyCommError",
  //   "ATtinyError",
  //   "AudioMode",
  //   "AudioRecordingFailed",
  //   "EndedRecording",
  //   "FileOffloadFailed",
  //   "FlashStorageNearlyFull",
  //   "GotPowerOnTimeout",
  //   "GotRpiPoweredOn",
  //   "LogOffloadFailed",
  //   "LostFrames",
  //   "OffloadedLogs",
  //   "OffloadedRecording",
  //   "RecordingNotFinished",
  //   "Rp2040MissedAudioAlarm",
  //   "Rp2040Sleep",
  //   "Rp2040Woken",
  //   "SetAlarm",
  //   "StartedAudioRecording",
  //   "StartedGettingFrames",
  //   "StartedRecording",
  //   "StartedSendingFramesToRpi",
  //   "ThermalMode",
  //   "ToldRpiToWake",
  //   "WouldDiscardAsFalsePositive",
  //   "audiobait",
  //   "bad-thermal-frame",
  //   "failed-modem-shutdown",
  //   "humidityTooHigh",
  //   "modemConnectedToNetwork",
  //   "modemPingFail",
  //   "noModemFound",
  //   "power-on-test",
  //   "programmingAttiny",
  //   "rtc-ntp-drift",
  //   "rtcIntegrityLost",
  //   "rtcNtpDriftHigh",
  //   "rtcNtpMismatch",
  //   "test",
  //   "throttle",
  //   "unknown",
  // ];
  //
  // const eventDetailIds = await models.Event.findAll({
  //   distinct: true,
  //   attributes: ["EventDetailId"],
  //   where: {
  //     dateTime: { [Op.lt]: thirtyDaysAgo }, // Should this be event date, or event creation date?
  //   },
  //   include: [
  //     {
  //       model: models.DetailSnapshot,
  //       as: "EventDetail",
  //       required: true,
  //       attributes: [],
  //       where: {
  //         type: { [Op.in]: eventTypesToRemove },
  //       },
  //     },
  //   ],
  // } as any);
  //
  // const events = await models.Event.count({
  //   where: {
  //     EventDetailId: {
  //       [Op.in]: eventDetailIds.map(
  //         (eventDetailId) => eventDetailId.EventDetailId
  //       ),
  //     },
  //   },
  // });
  // // TODO:
  // // const eventTypes = await models.sequelize.query(
  // //   `select distinct type from "DetailSnapshots"`,
  // //   { type: QueryTypes.SELECT }
  // // );
  // log.info(`Found ${events} event detail ids`);
  // const events = await models.Event.count({
  //   where: {
  //     dateTime: { [Op.lt]: thirtyDaysAgo }, // Should this be event date, or event creation date?
  //   },
  //   include: [
  //     {
  //       model: models.DetailSnapshot,
  //       as: "EventDetail",
  //       required: true,
  //       attributes: ["type"],
  //       where: {
  //         type: { [Op.in]: eventTypesToRemove },
  //       },
  //     },
  //   ],
  // });
  //
  // log.info(`Removed ${events} events`);
  // Also remove old expired user sessions, and maybe write out some stats about user agents?
}

main()
  .catch((e) => {
    log.error(e);
    console.trace(e);
  })
  .then(() => {
    process.exit(0);
  });
