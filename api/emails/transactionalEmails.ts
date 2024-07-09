import { embedImage } from "@/emails/htmlEmailUtils.js";
import {
  createEmailWithTemplate,
  urlNormaliseName,
} from "@/emails/htmlEmailUtils.js";
import type { EmailImageAttachment } from "@/scripts/emailUtil.js";
import { sendEmail } from "@/emails/sendEmail.js";
import config from "@config";
import logger from "@/logging.js";
import path from "path";
import { fileURLToPath } from "url";
import type { DeviceId, StationId } from "@typedefs/api/common.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type { GroupedServiceErrors } from "@/scripts/report-service-errors.js";

const commonAttachments = async (): Promise<EmailImageAttachment[]> => {
  const attachments: EmailImageAttachment[] = [];
  await embedImage("cacophony-logo", attachments, "cacophony-logo.svg");
  return attachments;
};

const commonInterpolants = (origin: string) => {
  return {
    cacophonyBrowseUrl: `https://${origin}`,
    cacophonyDisplayUrl: "browse.cacophony.org.nz",
  };
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

export const sendStoppedDevicesReportEmail = async (
  origin: string,
  groupName: string,
  stoppedDevicesList: string[],
  recipients: { email: string; emailConfirmed: boolean }[]
) => {
  const sendPromises = [];
  const confirmedEmailUsers = recipients
    .filter(({ emailConfirmed }) => emailConfirmed)
    .map(({ email }) => email);
  const unconfirmedEmailUsers = recipients
    .filter(({ emailConfirmed }) => !emailConfirmed)
    .map(({ email }) => email);

  const common = commonInterpolants(origin);
  const emailSettingsUrl = `${common.cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}/my-settings`;
  let confirmedEmailTemplate;
  let unconfirmedEmailTemplate;
  if (confirmedEmailUsers.length !== 0) {
    confirmedEmailTemplate = await createEmailWithTemplate(
      "stopped-devices-report.html",
      {
        emailSettingsUrl,
        confirmedEmailUsers: true,
        unconfirmedEmailUsers: false,
        groupName,
        stoppedDevicesList,
        ...common,
      }
    );
  }
  if (unconfirmedEmailUsers.length !== 0) {
    unconfirmedEmailTemplate = await createEmailWithTemplate(
      "stopped-devices-report.html",
      {
        emailSettingsUrl,
        confirmedEmailUsers: false,
        unconfirmedEmailUsers: true,
        groupName,
        stoppedDevicesList,
        ...common,
      }
    );
  }
  let sentAdminCopy = false;
  for (const recipient of confirmedEmailUsers) {
    sendPromises.push(
      sendEmail(
        confirmedEmailTemplate.html,
        confirmedEmailTemplate.text,
        recipient,
        `💔 Possible stopped or offline device${
          stoppedDevicesList.length > 1 ? "s" : ""
        } in '${groupName}'`,
        await commonAttachments(),
        !sentAdminCopy ? config.server.adminEmails : [] // Just bcc admin for the first email in a group.
      )
    );
    sentAdminCopy = true;
  }
  // TODO: When we've completely switched to browse-next, remove this
  for (const recipient of unconfirmedEmailUsers) {
    sendPromises.push(
      sendEmail(
        unconfirmedEmailTemplate.html,
        unconfirmedEmailTemplate.text,
        recipient,
        `💔 Possible stopped or offline device${
          stoppedDevicesList.length > 1 ? "s" : ""
        } in '${groupName}'`,
        await commonAttachments(),
        !sentAdminCopy ? config.server.adminEmails : [] // Just bcc admin for the first email in a group.
      )
    );
    sentAdminCopy = true;
  }
  return (await Promise.allSettled(sendPromises)).map(
    (p) => p.status === "fulfilled"
  );
};

export const sendAnimalAlertEmail = async (
  origin: string,
  groupName: string,
  deviceName: string,
  stationName: string,
  stationId: StationId,
  recordingDateTime: Date,
  classification: string,
  matchedClassification: string,
  recordingId: number,
  trackId: number,
  userEmailAddress: string,
  deviceTimezone: string | null,
  thumbnail?: Buffer
) => {
  const common = commonInterpolants(origin);
  const projectRoot = `${common.cacophonyBrowseUrl}/${urlNormaliseName(
    groupName
  )}`;
  const emailSettingsUrl = `${projectRoot}/my-settings`;
  const targetTag =
    classification.charAt(0).toUpperCase() + classification.slice(1);
  const matchedTag =
    matchedClassification.charAt(0).toUpperCase() +
    matchedClassification.slice(1);
  const stationUrl = stationId
    ? `${projectRoot}/activity?display-mode=visits&recording-mode=cameras&locations=${stationId}&from=any&tag-mode=any`
    : "";
  const recordingUrl = `${projectRoot}/recording/${recordingId}/tracks/${trackId}/detail`;
  const recordingTime = recordingDateTime.toLocaleDateString("en-NZ", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: true,
    timeZone: deviceTimezone || "Pacific/Auckland",
  });
  const { text, html } = await createEmailWithTemplate("animal-alert.html", {
    targetTag,
    matchedTag,
    emailSettingsUrl,
    groupName,
    deviceName,
    recordingUrl,
    recordingTime,
    stationUrl,
    stationName,
    ...common,
  });
  const thumb: EmailImageAttachment[] = thumbnail
    ? [
        {
          buffer: thumbnail,
          mimeType: "image/png",
          cid: "thumbnail",
        },
      ]
    : [];
  return await sendEmail(
    html,
    text,
    userEmailAddress,
    `🎯 ${targetTag} alert at '${stationName}'`,
    [...(await commonAttachments()), ...thumb]
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

export const sendPlatformUsageEmail = async (
  origin: string,
  recipientEmailAddress: string,
  weekEnding: Date,
  platformUsageStats: string,
  imageAttachments: EmailImageAttachment[] = []
) => {
  const common = commonInterpolants(origin);
  const getMonthName = (num: number) => {
    switch (num) {
      case 1:
        return "Jan";
      case 2:
        return "Feb";
      case 3:
        return "Mar";
      case 4:
        return "Apr";
      case 5:
        return "May";
      case 6:
        return "Jun";
      case 7:
        return "Jul";
      case 8:
        return "Aug";
      case 9:
        return "Sep";
      case 10:
        return "Oct";
      case 11:
        return "Nov";
      case 12:
        return "Dec";
    }
  };

  const weekEndingDate = `${getMonthName(
    weekEnding.getMonth() + 1
  )}&nbsp;${weekEnding.getDate()},&nbsp;${weekEnding.getFullYear()}`;
  const { text, html } = await createEmailWithTemplate(
    "platform-usage-report.html",
    {
      platformUsageStats,
      weekEndingDate,
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    recipientEmailAddress,
    "📈 Cacophony Monitoring Platform usage report",
    [...(await commonAttachments()), ...imageAttachments]
  );
};

export const sendDailyServiceErrorsEmail = async (
  origin: string,
  recipientEmailAddress: string,
  from: Date,
  until: Date,
  serviceErrors: Record<string, GroupedServiceErrors[]>,
  devicesFailingSaltUpdate: Record<string, { id: DeviceId; name: string }[]>,
  imageAttachments: EmailImageAttachment[] = []
) => {
  const common = commonInterpolants(origin);
  const dateFormat = new Intl.DateTimeFormat("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: true,
  });
  const fromDate = dateFormat.format(from);
  const untilDate = dateFormat.format(until);
  const errors = [];
  // NOTE: A bit of data munging here to accommodate limitations with how mustache can iterate over collections.
  for (const [unit, unitErrors] of Object.entries(serviceErrors)) {
    const unitErrorsByVersion = [];
    for (const err of unitErrors) {
      unitErrorsByVersion.push({
        unit: err.unit,
        errors: Object.entries(err.errors)
          .map(([version, errors]) => ({
            unit: err.unit,
            version,
            errors: errors
              .map((e) => ({
                from: dateFormat.format(e.from),
                until: dateFormat.format(e.until),
                devices: e.devices,
                count: `${e.count} instance${e.count !== 1 ? "s" : ""}`,
                c: e.count,
                logging: e.log.map(({ line, level }, index) => {
                  let l = "";
                  if (level === "info" && index !== e.log.length - 1) {
                    l = "color: #01b601 !important";
                  } else if (level === "warn") {
                    l = "color: orange !important";
                  } else {
                    l = "color: red !important; font-weight: bold;";
                  }
                  return {
                    line,
                    level: l,
                  };
                }),
              }))
              .sort((a, b) => b.c - a.c),
          }))
          .sort(
            (a, b) =>
              b.errors.reduce((acc, item) => item.c + acc, 0) -
              a.errors.reduce((acc, item) => item.c + acc, 0)
          ),
      });
    }
    unitErrorsByVersion.sort((a, b) => {
      return a.errors.length - b.errors.length;
    });
    errors.push({
      unit,
      unitErrorsByVersion,
    });
  }
  const failingDevices = [];
  for (const [unit, devices] of Object.entries(devicesFailingSaltUpdate)) {
    failingDevices.push({
      unit,
      devices,
    });
  }
  const { text, html } = await createEmailWithTemplate(
    "service-errors-report.html",
    {
      serviceErrors: errors,
      failingDevices,
      fromDate,
      untilDate,
      ...common,
    }
  );
  return await sendEmail(
    html,
    text,
    recipientEmailAddress,
    "🧨💥 Service Errors in the last 24 hours",
    [...(await commonAttachments()), ...imageAttachments]
  );
};

export const sendProjectActivityDigestEmail = async (
  origin: string,
  frequency: "Daily" | "Weekly",
  projectName: string,
  recipients: { email: string; userName: string }[],
  visitsInfo: {
    species: string;
    speciesDisplayName: string;
    count: number;
    hasIcon?: boolean;
  }[]
) => {
  const common = commonInterpolants(origin);
  const projectRoot = `${common.cacophonyBrowseUrl}/${urlNormaliseName(
    projectName
  )}`;
  const emailFrequency = frequency.toLowerCase();
  const emailSettingsUrl = `${projectRoot}/my-settings`;
  const timespan = frequency === "Weekly" ? "1-week-ago" : "24-hours-ago";
  const activityUrl = `${projectRoot}/activity?display-mode=visits&recording-mode=cameras&locations=any&from=${timespan}&tag-mode=any`;
  const imageAttachments = [...(await commonAttachments())];
  for (const species of visitsInfo) {
    const iconExists = await embedImage(
      species.species,
      imageAttachments,
      `classification-icons/${species.species}.svg`,
      false
    );
    species.hasIcon = iconExists !== false;
  }
  const { text, html } = await createEmailWithTemplate(
    "project-activity-digest.html",
    {
      emailSettingsUrl,
      projectName,
      emailFrequency,
      visitsInfo,
      hasVisitsInPeriod: visitsInfo.length !== 0,
      hasNoVisitsInPeriod: visitsInfo.length === 0,
      activityUrl,
      ...common,
    }
  );

  // TODO: How much info should we try to cram into these reports?
  const recipientPromises = [];
  for (const recipient of recipients) {
    recipientPromises.push(
      sendEmail(
        html,
        text,
        `${recipient.userName} <${recipient.email}>`,
        `📊 ${frequency} activity report for '${projectName}'`,
        imageAttachments
      )
    );
  }
  return (await Promise.allSettled(recipientPromises)).every(
    (success) => success.status === "fulfilled"
  );
};
