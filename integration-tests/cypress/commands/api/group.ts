import { getTestEmail, getTestName } from "../names";
import { logTestDescription } from "../descriptions";

import {
  getCreds,
  makeAuthorizedRequestWithStatus,
  saveIdOnly,
  v1ApiPath,
  sortArrayOn,
  checkTreeStructuresAreEqualExcept,
} from "../server";

import { ApiGroupReturned } from "../types";

import { ApiGroupUserResponse } from "@typedefs/api/group";
import { ApiDeviceResponse } from "@shared/api/device";
import { GroupId } from "@shared/api/common";
import { HttpStatusCode } from "@shared/api/consts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * create a group for the given user (who has already been referenced in the test)
       * Optionally check for fail response (statusCode!=200))
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       */

      apiGroupAdd(
        userName: string,
        groupName: string,
        log?: boolean,
        statusCode?: number,
        additionalChecks?: { useRawGroupName?: boolean },
      ): Cypress.Chainable<GroupId>;

      /**
       * Add user to group
       * Optionally check for fail response (statusCode!=200)
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       */
      apiGroupUserAdd(
        groupAdminUser: string,
        userName: string,
        groupName: string,
        admin?: boolean,
        owner?: boolean,
        log?: boolean,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawGroupName?: boolean;
          useRawUserName?: boolean;
        },
      ): Cypress.Chainable<void>;

      /**
       * Invite user to group
       * Optionally check for fail response (statusCode!=200)
       * By default groupAdminUser and groupName are converted into unique (for this test run) names.
       */
      apiGroupUserInvite(
        groupAdminUser: string,
        inviteeEmail: string,
        groupName: string,
        admin?: boolean,
        owner?: boolean,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * Ask an admin user to join one of their groups.
       */
      apiGroupUserRequestInvite(
        groupAdminUserEmail: string | undefined,
        userName: string,
        groupName: string,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * Ask to join a group via device access using device name and group name.
       */
      apiDeviceUserRequestInvite(
        groupAdminUserEmail: string | undefined,
        userName: string,
        deviceName: string,
        groupName: string,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * Ask to join a group via device access using device ID.
       */
      apiDeviceUserRequestInviteById(
        groupAdminUserEmail: string | undefined,
        userName: string,
        deviceName: string,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * Accept a user request to join one of your groups.
       */
      apiGroupUserAcceptInviteRequest(
        groupAdminUser: string,
        token: string,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * Accept group invitation
       * Optionally check for fail response (statusCode!=200)
       * By default invitedUser and groupName are converted into unique (for this test run) names.
       */
      apiGroupUserAcceptInvite(
        invitedUser: string,
        groupName: string,
        token: string,
        useExistingUser?: boolean,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * Call api/v1/groups/<groupnameorid> and check that returned values match expectedGroups
       * Optionally check for fail response (statusCode!=200)
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       * By default groups and expectedGroups are sorted on groupName before comparison and
       * devices by devicename, Users by username, GroupUsers by userId
       * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
       */
      apiGroupCheck(
        userName: string,
        groupNameOrId: string,
        expectedGroups: ApiGroupReturned[],
        excludeCheckOn?: string[],
        statusCode?: number,
        additionalChecks?: { useRawGroupName?: boolean },
      ): Chainable<void>;

      /**
       * Call api/v1/groups/<groupnameorid>/devices and check that returned values match expectedGroups
       * Optionally check for fail response (statusCode!=200)
       * By default devices and expectedDevices are sorted on devicename before comparison
       * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       */
      apiGroupDevicesCheck(
        userName: string,
        groupNameOrId: string,
        expectedDevices: ApiDeviceResponse[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawGroupName?: boolean; doNotSort?: boolean },
      ): Chainable<void>;

      /**
       * Call api/v1/groups/<groupname>/users and check that returned values match expectedUsers
       * Optionally check for fail response (statusCode!=200)
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       * By default users and expectedUsers are sorted on userName before comparison
       * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
       */
      apiGroupUsersCheck(
        userName: string,
        groupName: string,
        expectedUsers: ApiGroupUserResponse[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawGroupName?: boolean; doNotSort?: boolean },
      ): Chainable<void>;

      /**
       * Remove user from group
       * Optionally check for fail response (statusCode!=200)
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       */
      apiGroupUserRemove(
        groupAdminUser: string,
        userName: string,
        groupName: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawGroupName?: boolean;
          useRawUserName?: boolean;
        },
      ): Chainable<void>;

      /*******************************************************************************************************
       * Following are legacy test functions from old tests. The above standard-format API wrappers should be used in
       * preference to these functions.  These may be deleted in the future
       *****************************************************************************************************/

      /**
       * Verify that user can see a group
       * Optionally verify they can't see the group (set testForSuccess=false)
       */
      testGroupUserCheckAccess(
        username: string,
        groupname: string,
        testForSuccess?: boolean,
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "apiGroupUserAdd",
  (
    groupAdminUser: string,
    userName: string,
    groupName: string,
    admin = false,
    owner = false,
    log = true,
    statusCode = 200,
    additionalChecks: {
      useRawGroupName?: boolean;
      useRawUserName?: boolean;
    } = {},
  ) => {
    let fullGroupName: string;
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }
    let fullName: string;
    if (additionalChecks.useRawUserName === true) {
      fullName = userName;
    } else {
      fullName = getTestEmail(userName);
    }

    const adminStr = admin ? " as admin " : "";
    const ownerStr = owner ? " as owner " : "";
    logTestDescription(
      `${groupAdminUser} Adding user '${userName}' to group '${groupName}' ${adminStr} ${ownerStr}`,
      { user: userName, groupName, admin, owner },
      log,
    );
    const body = {
      group: fullGroupName,
      admin: admin.toString(),
      email: fullName,
    };
    if (owner) {
      body["owner"] = owner.toString();
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("groups/users"),
        body,
      },
      groupAdminUser,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiGroupUserInvite",
  (
    groupAdminUser: string,
    inviteeEmail: string,
    groupName: string,
    admin = false,
    owner = false,
    log = true,
    statusCode = 200,
  ) => {
    const fullGroupName = getTestName(groupName);
    const email = getTestEmail(inviteeEmail);

    const adminStr = admin ? " as admin " : "";
    const ownerStr = owner ? " as owner " : "";
    logTestDescription(
      `${groupAdminUser} Inviting user '${email}' to group '${groupName}'${adminStr}${ownerStr}`,
      { user: inviteeEmail, groupName, admin, owner },
      log,
    );
    const body: { admin?: boolean; owner?: boolean; email: string } = {
      email,
    };
    if (admin) {
      body.admin = true;
    }
    if (owner) {
      body.owner = true;
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`groups/${fullGroupName}/invite-user`),
        body,
      },
      groupAdminUser,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiGroupUserAcceptInvite",
  (
    invitedUser: string,
    groupName: string,
    token: string,
    useExistingUser = false,
    log = true,
    statusCode = 200,
  ) => {
    const fullGroupName = getTestName(groupName);
    const body = {
      acceptGroupInviteJWT: token.replace(/:/g, "."),
    };
    logTestDescription(
      `${invitedUser} accepting invitation to group '${groupName}'`,
      { user: invitedUser, groupName },
      log,
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(
          `groups/${fullGroupName}/accept-invitation`,
          useExistingUser ? { "existing-member": 1 } : {},
        ),
        body,
      },
      invitedUser,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiGroupUserRequestInvite",
  (
    groupAdminUserEmail: string | undefined,
    userName: string,
    groupName: string,
    log = true,
    statusCode = 200,
  ) => {
    const logMessage = groupAdminUserEmail
      ? `${userName} requesting access to group '${groupName}' from ${groupAdminUserEmail}`
      : `${userName} requesting access to group '${groupName}' (to group owner)`;
    logTestDescription(
      logMessage,
      { user: userName, groupName, groupAdminUserEmail },
      log,
    );
    const body: { groupId: string; groupAdminEmail?: string } = {
      groupId: String(getCreds(groupName).id),
    };

    if (groupAdminUserEmail) {
      body.groupAdminEmail = groupAdminUserEmail;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`users/request-group-membership`),
        body,
      },
      userName,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiDeviceUserRequestInvite",
  (
    groupAdminUserEmail: string | undefined,
    userName: string,
    deviceName: string,
    groupName: string,
    log = true,
    statusCode = 200,
  ) => {
    const logMessage = groupAdminUserEmail
      ? `${userName} requesting access to device '${deviceName}' in group '${groupName}' from ${groupAdminUserEmail}`
      : `${userName} requesting access to device '${deviceName}' in group '${groupName}' (to group owner)`;
    logTestDescription(
      logMessage,
      { user: userName, deviceName, groupName, groupAdminUserEmail },
      log,
    );
    const body: {
      deviceName: string;
      groupName: string;
      groupAdminEmail?: string;
    } = {
      deviceName: getTestName(deviceName),
      groupName: getTestName(groupName),
    };

    if (groupAdminUserEmail) {
      body.groupAdminEmail = groupAdminUserEmail;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`users/request-device-access`),
        body,
      },
      userName,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiDeviceUserRequestInviteById",
  (
    groupAdminUserEmail: string | undefined,
    userName: string,
    deviceName: string,
    log = true,
    statusCode = 200,
  ) => {
    const logMessage = groupAdminUserEmail
      ? `${userName} requesting access to device ID '${getCreds(deviceName).id}' from ${groupAdminUserEmail}`
      : `${userName} requesting access to device ID '${getCreds(deviceName).id}' (to group owner)`;
    logTestDescription(
      logMessage,
      { user: userName, deviceName, groupAdminUserEmail },
      log,
    );
    const body: { deviceId: string; groupAdminEmail?: string } = {
      deviceId: String(getCreds(deviceName).id),
    };

    if (groupAdminUserEmail) {
      body.groupAdminEmail = groupAdminUserEmail;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`users/request-device-access`),
        body,
      },
      userName,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiGroupUserAcceptInviteRequest",
  (groupAdminUser: string, token: string, log = true, statusCode = 200) => {
    logTestDescription(
      `${groupAdminUser} approves access to group`,
      { user: groupAdminUser },
      log,
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`users/validate-group-membership-request`),
        body: {
          membershipRequestJWT: token.replace(/:/g, "."),
        },
      },
      groupAdminUser,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiGroupUserRemove",
  (
    groupAdminUser: string,
    userName: string,
    groupName: string,
    statusCode = 200,
    additionalChecks: {
      useRawGroupName?: boolean;
      useRawUserName?: boolean;
    } = {},
  ) => {
    let fullGroupName: string;
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    let email: string;
    if (additionalChecks.useRawUserName === true) {
      email = userName;
    } else {
      email = getTestEmail(userName);
    }

    logTestDescription(
      `${groupAdminUser} Removing user '${userName}' from group '${groupName}' `,
      { user: userName, groupName },
      true,
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: v1ApiPath("groups/users"),
        body: {
          group: fullGroupName,
          email: email,
        },
      },
      groupAdminUser,
      statusCode,
    );
  },
);

Cypress.Commands.add(
  "apiGroupUsersCheck",
  (
    userName: string,
    groupName: string,
    expectedUsers: ApiGroupUserResponse[],
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { useRawGroupName?: boolean; doNotSort?: boolean } = {},
  ) => {
    let fullGroupName: string;
    let sortUsers: ApiGroupUserResponse[];
    let sortExpectedUsers: ApiGroupUserResponse[];

    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    const fullUrl = v1ApiPath(`groups/${fullGroupName}/users`);

    logTestDescription(
      `${userName} Check users in group '${groupName}' `,
      { user: userName, groupName },
      true,
    );

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ users: ApiGroupUserResponse[] }>) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means dateTime is mandatory in expectedEvents)
        if (additionalChecks.doNotSort === true) {
          sortUsers = response.body.users;
          sortExpectedUsers = expectedUsers;
        } else {
          sortUsers = sortArrayOn(response.body.users, "userName");
          sortExpectedUsers = sortArrayOn(expectedUsers, "userName");
        }
        checkTreeStructuresAreEqualExcept(
          sortExpectedUsers,
          sortUsers,
          excludeCheckOn,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiGroupAdd",
  (
    userName: string,
    groupName: string,
    log = true,
    statusCode = 200,
    additionalChecks: { useRawGroupName?: boolean } = {},
  ) => {
    let fullGroupName: string;

    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    logTestDescription(
      `Create group '${groupName}' for user '${userName}'`,
      { user: userName, group: groupName },
      log,
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("groups"),
        body: { groupname: fullGroupName },
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ groupId: GroupId }>) => {
      if (statusCode === 200) {
        saveIdOnly(groupName, response.body.groupId);
        cy.wrap(response.body.groupId);
      }
    });
  },
);

//FIXME(jon): This function has been broken forever, and actually doesn't check anything!
Cypress.Commands.add(
  "apiGroupCheck",
  (
    userName: string,
    groupNameOrId: string,
    _expectedGroups: ApiGroupReturned[],
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { useRawGroupName?: boolean } = {},
  ) => {
    let sortGroups: ApiGroupReturned[];
    let sortExpectedGroups: ApiGroupReturned[];
    let fullGroupName: string;

    //Make group name unique unless we're asked not to
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupNameOrId;
    } else {
      fullGroupName = getTestName(groupNameOrId);
    }

    const fullUrl = v1ApiPath(`groups/${fullGroupName}`);

    logTestDescription(
      `${userName} Check group '${groupNameOrId}' `,
      { user: userName, groupNameOrId },
      true,
    );

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode,
    ).then((_response) => {
      if (statusCode === 200) {
        checkTreeStructuresAreEqualExcept(
          sortExpectedGroups,
          sortGroups,
          excludeCheckOn,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiGroupDevicesCheck",
  (
    userName: string,
    groupNameOrId: string,
    expectedDevices: ApiDeviceResponse[],
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { useRawGroupName?: boolean; doNotSort?: boolean } = {},
  ) => {
    let sortDevices: ApiDeviceResponse[];
    let sortExpectedDevices: ApiDeviceResponse[];
    let fullGroupName: string;

    //Make group name unique unless we're asked not to
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupNameOrId;
    } else {
      fullGroupName = getTestName(groupNameOrId);
    }

    logTestDescription(
      `${userName} Check group's devices for group ${groupNameOrId}`,
      { user: userName },
      true,
    );

    const fullUrl = v1ApiPath(`groups/${fullGroupName}/devices`);

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ devices: ApiDeviceResponse[] }>) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, deviceName, userName, userId is mandatory in expectedGroup)
        if (additionalChecks.doNotSort === true) {
          sortDevices = response.body.devices;
          sortExpectedDevices = expectedDevices;
        } else {
          sortDevices = sortArrayOn(response.body.devices, "deviceName");
          sortExpectedDevices = sortArrayOn(expectedDevices, "deviceName");
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedDevices,
          sortDevices,
          excludeCheckOn,
        );
      }
    });
  },
);

/*******************************************************************************************************
 * Following are legacy test functions from old tests. The above standard-format API wrappers should be used in
 * preference to these functions.  These may be deleted in the future
 *****************************************************************************************************/

Cypress.Commands.add(
  "testGroupUserCheckAccess",
  (userName: string, groupName: string, testForSuccess = true) => {
    const user = getCreds(userName);
    const fullGroupname = getTestName(groupName);
    const fullUrl = v1ApiPath("groups");

    logTestDescription(
      `${userName} Check user '${userName}' can see group '${groupName}' `,
      { user: userName, groupName },
      true,
    );

    cy.request({
      url: fullUrl,
      headers: user.headers,
    }).then((request) => {
      const allGroupNames = request.body.groups.map((item) => item.groupName);
      if (testForSuccess == true) {
        expect(allGroupNames).to.contain(fullGroupname);
      } else {
        expect(allGroupNames).not.to.contain(fullGroupname);
      }
    });
  },
);
