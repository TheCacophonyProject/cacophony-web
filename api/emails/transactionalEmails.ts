import {
  createEmailWithTemplate,
  StoppedDevice,
  urlNormaliseGroupName,
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

const commonInterpolants = () => {
  return {
    cacophonyBrowseUrl: config.server.browse_url,
    cacophonyDisplayUrl: "browse.cacophony.org.nz",
  };
};

const cacophonyBrowseUrl = config.server.browse_url;
// const emailSettingsUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/settings`;
// const stationUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/station/${urlNormaliseGroupName(stationName)}`;
// const recordingUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/station/${urlNormaliseGroupName(stationName)}/recording/${recordingId}/track/${trackId}`;

export const sendWelcomeEmailConfirmationEmail = async (
  emailConfirmationToken: string,
  userEmailAddress: string
): Promise<boolean> => {
  try {
    const common = commonInterpolants();
    const emailConfirmationUrl = `${
      common.cacophonyBrowseUrl
    }/confirm-account-email/${emailConfirmationToken.replace(/\./g, ":")}`;
    const { text, html } = await createEmailWithTemplate(
      "welcome-confirm-email.html",
      { emailConfirmationUrl, ...commonInterpolants() }
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

export const sendChangedEmailConfirmationEmail = async (
  emailConfirmationToken: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants();
  const emailConfirmationUrl = `${
    common.cacophonyBrowseUrl
  }/confirm-account-email/${emailConfirmationToken.replace(/\./g, ":")}`;
  const { text, html } = await createEmailWithTemplate(
    "confirm-email-change.html",
    { emailConfirmationUrl, ...commonInterpolants() }
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
  existingAccountJoinGroupToken: string,
  requesterEmailAddress: string,
  requestGroupName: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants();
  const existingAccountJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/${urlNormaliseGroupName(
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
      ...commonInterpolants(),
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
  newMemberJoinGroupToken: string,
  requesterEmailAddress: string,
  requestGroupName: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants();
  const signupAndJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/register/accept-invite/${newMemberJoinGroupToken.replace(/\./g, ":")}`;
  const existingAccountJoinGroupUrl = `${
    common.cacophonyBrowseUrl
  }/${urlNormaliseGroupName(
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
      ...commonInterpolants(),
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
  userEmailAddress: string,
  groupNamesAdded: string[]
) => {
  const { text, html } = await createEmailWithTemplate(
    "added-to-group-notification.html",
    { groupNamesAdded, ...commonInterpolants() }
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
  acceptToGroupToken: string,
  requesterEmailAddress: string,
  requestGroupNames: string[],
  userEmailAddress: string
) => {
  const common = commonInterpolants();
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
        ...commonInterpolants(),
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
        ...commonInterpolants(),
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
  groupName: string,
  stoppedDevices: StoppedDevice[],
  userEmailAddress: string
) => {
  const common = commonInterpolants();
  // TODO User group settings
  const emailSettingsUrl = `${
    common.cacophonyBrowseUrl
  }/${urlNormaliseGroupName(groupName)}/my-settings`;
  const { text, html } = await createEmailWithTemplate(
    "stopped-devices-report.html",
    { emailSettingsUrl, groupName, stoppedDevices, ...commonInterpolants() }
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
  groupName: string,
  deviceName: string,
  stationName: string,
  classification: string,
  recordingId: number,
  trackId: number,
  userEmailAddress: string,
  recipientTimeZoneOffset: number
) => {
  const common = commonInterpolants();
  const emailSettingsUrl = `${
    common.cacophonyBrowseUrl
  }/${urlNormaliseGroupName(groupName)}/my-settings`;
  const targetSpecies =
    classification.charAt(0).toUpperCase() + classification.slice(1);
  const cacophonyBrowseUrl = config.server.browse_url;
  const stationUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(
    groupName
  )}/station/${urlNormaliseGroupName(stationName)}`;
  const recordingUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(
    groupName
  )}/station/${urlNormaliseGroupName(
    stationName
  )}/recording/${recordingId}/track/${trackId}`;

  const { text, html } = await createEmailWithTemplate("animal-alert.html", {
    targetSpecies:
      targetSpecies.charAt(0).toUpperCase() + targetSpecies.slice(1),
    emailSettingsUrl,
    groupName,
    recordingUrl,
    stationUrl,
    ...commonInterpolants(),
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
  resetPasswordToken: string,
  userEmailAddress: string
) => {
  const common = commonInterpolants();
  const accountEmailAddress = userEmailAddress;
  const passwordResetUrl = `${
    common.cacophonyBrowseUrl
  }/reset-password/${resetPasswordToken.replace(/\./g, ":")}`;
  const { text, html } = await createEmailWithTemplate("reset-password.html", {
    accountEmailAddress,
    passwordResetUrl,
    ...commonInterpolants(),
  });
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    "Reset your Cacophony Monitoring password",
    await commonAttachments()
  );
};
