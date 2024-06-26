import config from "../config.js";
import log from "../logging.js";
import {
  getDevicesFailingSaltUpdatesInReportingPeriod,
  groupedSystemErrors,
} from "@api/V1/systemError.js";
import { sendDailyServiceErrorsEmail } from "@/emails/transactionalEmails.js";

const ignoredSaltNodeGroups = ["unknown-node-group", "tc2-dev", "dev-pis"];

async function main() {
  if (!config.smtpDetails) {
    throw "No SMTP details found in config/app.js";
  }
  if (!config.smtpDetails.serviceErrorsEmail) {
    throw "No recipients configured for service error emails in config/app.js";
  }
  // Make sure that we always report from the same time offset, regardless of when this script is run.
  const endDate = new Date();
  endDate.setHours(9, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setHours(endDate.getHours() - 72);
  const groupedServiceErrorsByNodeGroup = await groupedSystemErrors(
    startDate,
    endDate
  );
  for (const ignoredNodeGroup of ignoredSaltNodeGroups) {
    delete groupedServiceErrorsByNodeGroup[ignoredNodeGroup];
  }
  const failingSaltUpdates =
    await getDevicesFailingSaltUpdatesInReportingPeriod(
      startDate,
      endDate,
      ignoredSaltNodeGroups
    );
  if (Object.keys(groupedServiceErrorsByNodeGroup).length === 0) {
    log.info("No service errors in the last 24 hours");
  }

  await sendDailyServiceErrorsEmail(
    config.server.browse_url.replace("https://", ""),
    config.smtpDetails.serviceErrorsEmail,
    startDate,
    endDate,
    groupedServiceErrorsByNodeGroup,
    failingSaltUpdates
  );
}

main()
  .catch((e) => {
    console.trace(e);
    log.error(e);
  })
  .then(() => {
    process.exit(0);
  });
