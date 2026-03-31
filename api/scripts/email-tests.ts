import {
  sendChangedEmailConfirmationEmail,
  sendGroupInviteExistingMemberEmail,
  sendGroupMembershipRequestEmail,
  sendGroupInviteNewMemberEmail,
  sendPasswordResetEmail,
  sendWelcomeEmailConfirmationEmail,
  sendAnimalAlertEmail,
} from "@/emails/transactionalEmails.js";

const _sendTestEmails = async () => {
  // TODO - Should we pass in just a user object, and have these functions create the appropriate tokens?

  // TODO: Just write these emails to disk rather than sending them for testing purposes.
  await sendPasswordResetEmail("FOO", "jon@cacphony.org.nz");
  await sendChangedEmailConfirmationEmail("FOO", "jon@cacphony.org.nz");
  await sendWelcomeEmailConfirmationEmail("FOO", "jon@cacphony.org.nz");
  await sendGroupInviteNewMemberEmail(
    "FOO",
    "jon@hardiesoft.com",
    "My awesome group",
    "Jon Hardie",
    "jon@cacophony.org.nz",
  );
  await sendGroupInviteExistingMemberEmail(
    "FOO",
    "jon@hardiesoft.com",
    "My awesome group",
    "Jon Hardie",
    "jon@cacophony.org.nz",
  );
  await sendGroupMembershipRequestEmail(
    "FOO",
    "jon@cacophony.org.nz",
    "Jon Hardie",
    "Your awesome group",
    "jon@hardiesoft.com",
  );

  // Should this just have a recording object, and get the recordingDateTime from there?
  await sendAnimalAlertEmail(
    "The group name",
    "The device name",
    "The station name",
    1, // The station id
    new Date(),
    "possum",
    "mammal",
    1234,
    5667,
    "jon@cacophony.org.nz",
    null,
  );
};
