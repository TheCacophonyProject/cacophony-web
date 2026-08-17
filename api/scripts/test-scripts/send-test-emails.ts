import log from "@/logging.js";
import { initSequelize } from "@models/index.js";
import { sendProjectActivityDigestEmail } from "@/emails/transactionalEmails.js";
await initSequelize();

async function main() {
  const args = process.argv.slice(2); // Remove the first two default paths
  if (!args.includes("--address") || args.length !== 2) {
    throw new Error("No email address specified");
  }
  if (args[0] === "--address") {
    const targetEmailAddress = args[1];
    await sendProjectActivityDigestEmail(
      "Daily",
      "orton bradley park",
      [
        {
          email: targetEmailAddress,
          userName: "Sara",
        },
      ],
      [
        {
          species: "mustelid",
          speciesDisplayName: "Mustelid",
          count: 5,
          hasIcon: true,
        },
        {
          species: "rodent",
          speciesDisplayName: "Rodent",
          count: 10,
          hasIcon: true,
        },
        {
          species: "cat",
          speciesDisplayName: "Cat",
          count: 3,
          hasIcon: true,
        },
      ],
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
