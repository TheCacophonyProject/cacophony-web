import {
  createEmailWithTemplate,
  StoppedDevice,
  urlNormaliseName,
} from "@/emails/htmlEmailUtils";
import { EmailImageAttachment } from "@/scripts/emailUtil";
import fs from "fs/promises";
import { sendEmail } from "@/emails/sendEmail";
import config from "@config";
import logger from "@/logging";

const commonAttachments = async (): Promise<EmailImageAttachment[]> => {
  const buffer = await fs.readFile(`${__dirname}/templates/cacophony-logo.png`);
  return [
    {
      buffer,
      mimeType: "image/png",
      cid: "cacophony-logo",
    },
  ];
};

const commonInterpolants = (origin: string) => {
  return {
    cacophonyBrowseUrl: `https://${origin}`,
    cacophonyDisplayUrl: "browse.cacophony.org.nz",
  };
};
// const emailSettingsUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/settings`;
// const stationUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/station/${urlNormaliseGroupName(stationName)}`;
// const recordingUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/station/${urlNormaliseGroupName(stationName)}/recording/${recordingId}/track/${trackId}`;

export const sendWelcomeEmailConfirmationEmail = async (
  origin: string,
  emailConfirmationToken: string,
  userEmailAddress: string
): Promise<boolean> => {
  try {
    const common = commonInterpolants(origin);
    const emailConfirmationUrl = `${
      common.cacophonyBrowseUrl
    }/confirm-account-email/${emailConfirmationToken.replace(/\./g, ":")}`;
    const { text, html } = await createEmailWithTemplate(
      "welcome-confirm-email.html",
      { emailConfirmationUrl, ...common }
    );
    return await sendEmail(
      html,
      text,
      userEmailAddress,
      "🔧 Finish setting up your new Cacophony Monitoring account",
      await commonAttachments()
    );
  } catch (e) {
    logger.error("%s", e);
  }
};

export const sendWelcomeEmailWithGroupsAdded = async (
  origin: string,
  userEmailAddress: string,
  groupNamesAdded: string[]
): Promise<boolean> => {
  try {
    const common = commonInterpolants(origin);
    const { text, html } = await createEmailWithTemplate(
      "welcome-with-groups.html",
      { groupNamesAdded, ...common }
    );
    return await sendEmail(
      html,
      text,
      userEmailAddress,
      "🎉 Welcome to your new Cacophony Monitoring account!",
      await commonAttachments()
    );
  } catch (e) {
    logger.error("%s", e);
  }
};

export const sendEmailConfirmationEmailLegacyUser = async (
  origin: string,
  emailConfirmationToken: string,
  userEmailAddress: string
): Promise<boolean> => {
  try {
    const common = commonInterpolants(origin);
    const emailConfirmationUrl = `${
      common.cacophonyBrowseUrl
    }/confirm-account-email/${emailConfirmationToken.replace(/\./g, ":")}`;
    const { text, html } = await createEmailWithTemplate(
      "confirm-email-legacy-user.html",
      { emailConfirmationUrl, ...common }
    );
    return await sendEmail(
      html,
      text,
      userEmailAddress,
      "🔧 Confirm your Cacophony Monitoring account email address",
      await commonAttachments()
    );
  } catch (e) {
    logger.error("%s", e);
  }
};

export const sendChangedEmailConfirmationEmail = async (
  origin: string,
  emailConfirmationToken: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const emailConfirmationUrl = `${
    common.cacophonyBrowseUrl
  }/confirm-account-email/${emailConfirmationToken.replace(/\./g, ":")}`;
  const { text, html } = await createEmailWithTemplate(
    "confirm-email-change.html",
    {
      emailConfirmationUrl,
      ...common,
      newAccountEmailAddress: userEmailAddress,
    }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "🔧 Confirm your email change for Cacophony Monitoring",
    await commonAttachments()
  );
};

export const sendGroupInviteExistingMemberEmail = async (
  origin: string,
  existingAccountJoinGroupToken: string,
  requesterEmailAddress: string,
  requestGroupName: string,
  requesterUserName: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const existingAccountJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/accept-invite/${existingAccountJoinGroupToken.replace(
    /\./g,
    ":"
  )}?existing-member=1`;
  const { text, html } = await createEmailWithTemplate(
    "group-invite-existing-member.html",
    {
      existingAccountJoinGroupUrl,
      requestGroupName,
      requesterUserName,
      requesterEmailAddress,
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "You've been invited to join a group on Cacophony Monitoring",
    await commonAttachments()
  );
};

export const sendGroupInviteNewMemberEmail = async (
  origin: string,
  newMemberJoinGroupToken: string,
  requesterEmailAddress: string,
  requestGroupName: string,
  requesterUserName: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const signupAndJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/register?nextUrl=/accept-invite/${newMemberJoinGroupToken.replace(
    /\./g,
    ":"
  )}`;
  const existingAccountJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/accept-invite/${newMemberJoinGroupToken.replace(
    /\./g,
    ":"
  )}?existing-member=1`;
  const { text, html } = await createEmailWithTemplate(
    "group-invite-new-member.html",
    {
      signupAndJoinGroupUrl,
      existingAccountJoinGroupUrl,
      requestGroupName,
      requesterEmailAddress,
      requesterUserName,
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "You've been invited to join a group on Cacophony Monitoring",
    await commonAttachments()
  );
};

const getPermissions = (permissions: { owner?: boolean; admin?: boolean }) => {
  const madeOwner = typeof permissions.owner === "boolean" && permissions.owner;
  const removedOwner =
    typeof permissions.owner === "boolean" && !permissions.owner;
  const madeAdmin = typeof permissions.admin === "boolean" && permissions.admin;
  const removedAdmin =
    typeof permissions.admin === "boolean" && !permissions.admin;
  return { madeAdmin, madeOwner, removedAdmin, removedOwner };
};

export const sendAddedToGroupNotificationEmail = async (
  origin: string,
  userEmailAddress: string,
  groupNameAdded: string,
  permissions: { owner?: boolean; admin?: boolean }
) => {
  const { text, html } = await createEmailWithTemplate(
    "added-to-group-notification.html",
    {
      groupNameAdded,
      ...getPermissions(permissions),
      ...commonInterpolants(origin),
      groupUrl: urlNormaliseName(groupNameAdded),
    }
  );
  const subject = `👌 You've been accepted to '${groupNameAdded}'`;

  return await sendEmail(
    html,
    text,
    userEmailAddress,
    subject,
    await commonAttachments()
  );
};

export const sendUpdatedGroupPermissionsNotificationEmail = async (
  origin: string,
  userEmailAddress: string,
  groupName: string,
  permissions: { owner?: boolean; admin?: boolean }
) => {
  const { text, html } = await createEmailWithTemplate(
    "updated-to-group-permissions-notification.html",
    {
      groupName,
      ...getPermissions(permissions),
      ...commonInterpolants(origin),
      groupUrl: urlNormaliseName(groupName),
    }
  );
  const subject = `Your status in the group '${groupName}' has changed`;
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    subject,
    await commonAttachments()
  );
};

export const sendRemovedFromGroupNotificationEmail = async (
  origin: string,
  userEmailAddress: string,
  groupNameRemoved: string
) => {
  const { text, html } = await createEmailWithTemplate(
    "removed-from-group-notification.html",
    { groupNameRemoved, ...commonInterpolants(origin) }
  );

  const subject = `❗️You've been removed from '${groupNameRemoved}'`;
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    subject,
    await commonAttachments()
  );
};

export const sendLeftGroupNotificationEmail = async (
  origin: string,
  userEmailAddress: string,
  groupNameRemoved: string
) => {
  const { text, html } = await createEmailWithTemplate(
    "left-group-notification.html",
    { groupNameRemoved, ...commonInterpolants(origin) }
  );

  const subject = `❗️You've left '${groupNameRemoved}'`;
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    subject,
    await commonAttachments()
  );
};

export const sendRemovedFromInvitedGroupNotificationEmail = async (
  origin: string,
  userEmailAddress: string,
  groupNameRemoved: string
) => {
  const { text, html } = await createEmailWithTemplate(
    "removed-from-invited-group-notification.html",
    { groupNameRemoved, ...commonInterpolants(origin) }
  );

  const subject = `❗️You've been uninvited from '${groupNameRemoved}'`;
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    subject,
    await commonAttachments()
  );
};

export const sendGroupMembershipRequestEmail = async (
  origin: string,
  acceptToGroupToken: string,
  requesterEmailAddress: string,
  requesterUserName: string,
  requestGroupName: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const acceptToGroupUrl = `${
    common.cacophonyBrowseUrl
  }/confirm-group-membership-request/${acceptToGroupToken.replace(/\./g, ":")}`;
  const { text, html } = await createEmailWithTemplate(
    "group-membership-request.html",
    {
      acceptToGroupUrl,
      requestGroupName,
      requesterEmailAddress,
      requesterUserName,
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    `A Cacophony Monitoring user wants to join your '${requestGroupName}' group`,
    await commonAttachments()
  );
};

export const sendUserDeletionEmail = async (
  origin: string,
  userEmailAddress: string
) => {
  const adminEmail = await createEmailWithTemplate(
    "user-deletion-request.html",
    {
      ...commonInterpolants(origin),
      userEmailAddress,
    }
  );

  const userEmail = await createEmailWithTemplate("user-deletion.html", {
    ...commonInterpolants(origin),
    userEmailAddress,
  });

  await sendEmail(
    adminEmail.html,
    adminEmail.text,
    "coredev@cacophony.org.nz",
    `User ${userEmailAddress} has requested deletion of their account`
  );

  return await sendEmail(
    userEmail.html,
    userEmail.text,
    userEmailAddress,
    "Your request to delete your Cacophony Monitoring account has been received",
    await commonAttachments()
  );
};

export const sendStoppedDevicesReportEmail = async (
  origin: string,
  groupName: string,
  stoppedDevices: StoppedDevice[],
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  // TODO User group settings
  const emailSettingsUrl = `${common.cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/my-settings`;
  const { text, html } = await createEmailWithTemplate(
    "stopped-devices-report.html",
    { emailSettingsUrl, groupName, stoppedDevices, ...common }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "Daily device health check for Cacophony Monitoring",
    await commonAttachments()
  );
};

export const sendAnimalAlertEmail = async (
  origin: string,
  groupName: string,
  deviceName: string,
  stationName: string,
  classification: string,
  recordingId: number,
  trackId: number,
  userEmailAddress: string,
  recipientTimeZoneOffset: number
) => {
  const common = commonInterpolants(origin);
  const emailSettingsUrl = `${common.cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/my-settings`;
  const targetSpecies =
    classification.charAt(0).toUpperCase() + classification.slice(1);
  const cacophonyBrowseUrl = config.server.browse_url;
  const stationUrl = `${cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/station/${urlNormaliseName(stationName)}`;
  const recordingUrl = `${cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/station/${urlNormaliseName(
    stationName
  )}/recording/${recordingId}/track/${trackId}`;

  const { text, html } = await createEmailWithTemplate("animal-alert.html", {
    targetSpecies:
      targetSpecies.charAt(0).toUpperCase() + targetSpecies.slice(1),
    emailSettingsUrl,
    groupName,
    recordingUrl,
    stationUrl,
    ...common,
  });
  // FIXME - fetch actual thumbnail
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    `🎯 ${targetSpecies} alert at '${stationName}'`,
    [
      ...(await commonAttachments()),
      {
        buffer: await fs.readFile(`${__dirname}/templates/test-thumb.png`),
        mimeType: "image/png",
        cid: "thumbnail",
      },
    ]
  );
};

export const sendAnimalAlertEmailForEvent = async (
  origin: string,
  groupName: string,
  deviceName: string,
  stationName: string,
  classification: string,
  recordingId: number,
  trackId: number,
  userEmailAddress: string,
  recipientTimeZoneOffset: number
) => {
  const common = commonInterpolants(origin);
  const emailSettingsUrl = `${common.cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/my-settings`;
  const targetSpecies =
    classification.charAt(0).toUpperCase() + classification.slice(1);
  const cacophonyBrowseUrl = config.server.browse_url;
  const stationUrl = `${cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/station/${urlNormaliseName(stationName)}`;
  const recordingUrl = `${cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/station/${urlNormaliseName(
    stationName
  )}/recording/${recordingId}/track/${trackId}`;

  const { text, html } = await createEmailWithTemplate("animal-alert.html", {
    targetSpecies:
      targetSpecies.charAt(0).toUpperCase() + targetSpecies.slice(1),
    emailSettingsUrl,
    groupName,
    recordingUrl,
    stationUrl,
    ...common,
  });
  // FIXME - fetch actual thumbnail
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    `🎯 ${targetSpecies} alert at '${stationName}'`,
    [
      ...(await commonAttachments()),
      {
        buffer: await fs.readFile(`${__dirname}/templates/test-thumb.png`),
        mimeType: "image/png",
        cid: "thumbnail",
      },
    ]
  );
};

export const sendPasswordResetEmail = async (
  origin: string,
  resetPasswordToken: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const accountEmailAddress = userEmailAddress;
  const passwordResetUrl = `${
    common.cacophonyBrowseUrl
  }/reset-password/${resetPasswordToken.replace(/\./g, ":")}`;
  const { text, html } = await createEmailWithTemplate("reset-password.html", {
    accountEmailAddress,
    passwordResetUrl,
    ...common,
  });
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "Reset your Cacophony Monitoring password",
    await commonAttachments()
  );
};
