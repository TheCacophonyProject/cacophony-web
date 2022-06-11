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

const sendTestEmails = async () => {
  // TODO - Should we pass in just a user object, and have these functions create the appropriate tokens?

  await sendPasswordResetEmail("FOO", "jon@cacphony.org.nz");
  await sendChangedEmailConfirmationEmail("FOO", "jon@cacphony.org.nz");
  await sendWelcomeEmailConfirmationEmail("FOO", "jon@cacphony.org.nz");
  await sendGroupInviteNewMemberEmail(
    "FOO",
    "jon@hardiesoft.com",
    "My awesome group",
    "jon@cacophony.org.nz"
  );
  await sendGroupInviteExistingMemberEmail(
    "FOO",
    "jon@hardiesoft.com",
    "My awesome group",
    "jon@cacophony.org.nz"
  );
  await sendGroupMembershipRequestEmail(
    "FOO",
    "jon@cacophony.org.nz",
    ["Your awesome group"],
    "jon@hardiesoft.com"
  );

  await sendGroupMembershipRequestEmail(
    "FOO",
    "jon@cacophony.org.nz",
    ["Your awesome group", "another group"],
    "jon@hardiesoft.com"
  );

  // Should this just have a recording object, and get the recordingDateTime from there?
  await sendAnimalAlertEmail(
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
