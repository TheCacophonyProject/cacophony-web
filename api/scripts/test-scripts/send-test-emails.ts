import log from "@/logging.js";
import { initSequelize } from "@models/index.js";
import {
  sendAddedToGroupNotificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmailConfirmationEmail,
} from "@/emails/transactionalEmails.js";
await initSequelize();

async function main() {
  const args = process.argv.slice(2); // Remove the first two default paths
  if (!args.includes("--address") || args.length !== 2) {
    throw new Error("No email address specified");
  }
  if (args[0] === "--address") {
    const targetEmailAddress = args[1];
    // await sendAddedToGroupNotificationEmail(targetEmailAddress, "Group name", {
    //   admin: true,
    // });
    // await sendWelcomeEmailConfirmationEmail(
    //   "fake-confirmation-token",
    //   targetEmailAddress,
    // );
    await sendPasswordResetEmail(
      "fake-password-reset-token",
      targetEmailAddress,
    );
  } else {
    throw new Error("No email address specified");
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
