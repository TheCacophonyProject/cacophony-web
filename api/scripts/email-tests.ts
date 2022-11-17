import registerAliases from "../module-aliases";
registerAliases();
import {
  sendChangedEmailConfirmationEmail,
  sendGroupInviteExistingMemberEmail,
  sendGroupMembershipRequestEmail,
  sendGroupInviteNewMemberEmail,
  sendPasswordResetEmail,
  sendWelcomeEmailConfirmationEmail,
  sendAnimalAlertEmail,
} from "@/emails/transactionalEmails";

const _sendTestEmails = async () => {
  // TODO - Should we pass in just a user object, and have these functions create the appropriate tokens?
  const origin = "https://browse-next.cacophony.org.nz";

  // TODO: Just write these emails to disk rather than sending them for testing purposes.
  await sendPasswordResetEmail(origin, "FOO", "jon@cacphony.org.nz");
  await sendChangedEmailConfirmationEmail(origin, "FOO", "jon@cacphony.org.nz");
  await sendWelcomeEmailConfirmationEmail(origin, "FOO", "jon@cacphony.org.nz");
  await sendGroupInviteNewMemberEmail(
    origin,
    "FOO",
    "jon@hardiesoft.com",
    "My awesome group",
    "jon@cacophony.org.nz"
  );
  await sendGroupInviteExistingMemberEmail(
    origin,
    "FOO",
    "jon@hardiesoft.com",
    "My awesome group",
    "jon@cacophony.org.nz"
  );
  await sendGroupMembershipRequestEmail(
    origin,
    "FOO",
    "jon@cacophony.org.nz",
    "Your awesome group",
    "jon@hardiesoft.com"
  );

  // Should this just have a recording object, and get the recordingDateTime from there?
  await sendAnimalAlertEmail(
    origin,
    "The group name",
    "The device name",
    "The station name",
    "possum",
    1234,
    5667,
    "jon@cacophony.org.nz",
    -13
  );
};
