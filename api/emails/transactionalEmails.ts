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
    cacophonyBrowseUrl: origin,
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
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const existingAccountJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/${urlNormaliseName(
    requestGroupName
  )}/accept-invite/${existingAccountJoinGroupToken.replace(
    /\./g,
    ":"
  )}?existing-member=1`;
  const { text, html } = await createEmailWithTemplate(
    "group-invite-existing-member.html",
    {
      existingAccountJoinGroupUrl,
      requestGroupName,
      requesterEmailAddress,
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "You're invited to join a group on Cacophony Monitoring",
    await commonAttachments()
  );
};

export const sendGroupInviteNewMemberEmail = async (
  origin: string,
  newMemberJoinGroupToken: string,
  requesterEmailAddress: string,
  requestGroupName: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  const signupAndJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/register/accept-invite/${newMemberJoinGroupToken.replace(/\./g, ":")}`;
  const existingAccountJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/${urlNormaliseName(
    requestGroupName
  )}/accept-invite/${newMemberJoinGroupToken.replace(
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
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "You're invited to join a group on Cacophony Monitoring",
    await commonAttachments()
  );
};
export const sendAddedToGroupNotificationEmail = async (
  origin: string,
  userEmailAddress: string,
  groupNamesAdded: string[]
) => {
  const { text, html } = await createEmailWithTemplate(
    "added-to-group-notification.html",
    { groupNamesAdded, ...commonInterpolants(origin) }
  );
  let subject;
  if (groupNamesAdded.length === 1) {
    subject = `👌 You've been accepted to '${groupNamesAdded[0]}'`;
  } else {
    subject = "👌 You've been accepted to some Cacophony Monitoring groups";
  }
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
  requestGroupNames: string[],
  userEmailAddress: string
) => {
  const common = commonInterpolants(origin);
  if (requestGroupNames.length === 1) {
    const requestGroupName = requestGroupNames[0];
    const acceptToGroupUrl = `${
      common.cacophonyBrowseUrl
    }/confirm-group-membership-request/${acceptToGroupToken.replace(
      /\./g,
      ":"
    )}`;
    const { text, html } = await createEmailWithTemplate(
      "group-membership-request.html",
      {
        acceptToGroupUrl,
        requestGroupName,
        requesterEmailAddress,
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
  } else {
    const acceptToGroupsUrl = `${
      common.cacophonyBrowseUrl
    }/confirm-group-membership-request/${acceptToGroupToken.replace(
      /\./g,
      ":"
    )}`;
    const { text, html } = await createEmailWithTemplate(
      "groups-membership-request.html",
      {
        acceptToGroupsUrl,
        requesterEmailAddress,
        ...common,
      }
    );
    return await sendEmail(
      html,
      text,
      userEmailAddress,
      "A Cacophony Monitoring user wants to join some of your groups",
      await commonAttachments()
    );
  }
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
