// load the global Cypress types
/// <reference types="cypress" />

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

import { ApiGroupReturned, ApiGroupsDevice } from "../types";

import { ApiGroupUserResponse } from "@typedefs/api/group";

Cypress.Commands.add(
  "apiGroupUserAdd",
  (
    groupAdminUser: string,
    userName: string,
    groupName: string,
    admin = false,
    owner = false,
    log = true,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }
    let fullName: string;
    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestEmail(userName);
    }

    const adminStr = admin ? " as admin " : "";
    const ownerStr = owner ? " as owner " : "";
    logTestDescription(
      `${groupAdminUser} Adding user '${userName}' to group '${groupName}' ${adminStr} ${ownerStr}`,
      { user: userName, groupName, admin, owner },
      log
    );
    const body = {
      group: fullGroupName,
      admin: admin.toString(),
      email: fullName,
    };
    if (owner) {
      (body as any).owner = owner.toString();
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("groups/users"),
        body,
      },
      groupAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiGroupUserInvite",
  (
    groupAdminUser: string,
    inviteeEmail: string,
    groupName: string,
    admin: boolean = false,
    owner: boolean = false,
    log: boolean = true,
    statusCode: number = 200
  ) => {
    const fullGroupName = getTestName(groupName);
    const email = getTestEmail(inviteeEmail);

    const adminStr = admin ? " as admin " : "";
    const ownerStr = owner ? " as owner " : "";
    logTestDescription(
      `${groupAdminUser} Inviting user '${email}' to group '${groupName}'${adminStr}${ownerStr}`,
      { user: inviteeEmail, groupName, admin, owner },
      log
    );
    const body = {
      email,
    };
    if (admin) {
      (body as any).admin = true;
    }
    if (owner) {
      (body as any).owner = true;
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`groups/${fullGroupName}/invite-user`),
        body,
      },
      groupAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiGroupUserAcceptInvite",
  (
    invitedUser: string,
    groupName: string,
    token: string,
    useExistingUser: boolean = false,
    log: boolean = true,
    statusCode: number = 200
  ) => {
    const fullGroupName = getTestName(groupName);
    const body = {
      acceptGroupInviteJWT: token.replace(/:/g, "."),
    };
    logTestDescription(
      `${invitedUser} accepting invitation to group '${groupName}'`,
      { user: invitedUser, groupName },
      log
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(
          `groups/${fullGroupName}/accept-invitation`,
          useExistingUser ? { "existing-member": 1 } : {}
        ),
        body,
      },
      invitedUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiGroupUserRequestInvite",
  (
    groupAdminUserEmail: string,
    userName: string,
    groupName: string,
    log: boolean = true,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${userName} requesting access to group '${groupName}' from ${groupAdminUserEmail}`,
      { user: userName, groupName, groupAdminUserEmail },
      log
    );
    const body = {
      groupAdminEmail: groupAdminUserEmail,
      groupId: getCreds(groupName).id,
    };
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`users/request-group-membership`),
        body,
      },
      userName,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiGroupUserAcceptInviteRequest",
  (
    groupAdminUser: string,
    token: string,
    log: boolean = true,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${groupAdminUser} approves access to group`,
      { user: groupAdminUser },
      log
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
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiGroupUserRemove",
  (
    groupAdminUser: string,
    userName: string,
    groupName: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    let email: string;
    if (additionalChecks["useRawUserName"] === true) {
      email = userName;
    } else {
      email = getTestEmail(userName);
    }

    logTestDescription(
      `${groupAdminUser} Removing user '${userName}' from group '${groupName}' `,
      { user: userName, groupName },
      true
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
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiGroupUsersCheck",
  (
    userName: string,
    groupName: string,
    expectedUsers: ApiGroupUserResponse[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;
    let sortUsers: ApiGroupUserResponse[];
    let sortExpectedUsers: ApiGroupUserResponse[];

    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    const fullUrl = v1ApiPath(`groups/${fullGroupName}/users`);

    logTestDescription(
      `${userName} Check users in group '${groupName}' `,
      { user: userName, groupName },
      true
    );

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means dateTime is mandatory in expectedEvents)
        if (additionalChecks["doNotSort"] === true) {
          sortUsers = response.body.users;
          sortExpectedUsers = expectedUsers;
        } else {
          sortUsers = sortArrayOn(response.body.users, "userName");
          sortExpectedUsers = sortArrayOn(expectedUsers, "userName");
        }
        checkTreeStructuresAreEqualExcept(
          sortExpectedUsers,
          sortUsers,
          excludeCheckOn
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiGroupAdd",
  (
    userName: string,
    groupName: string,
    log = true,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;

    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    logTestDescription(
      `Create group '${groupName}' for user '${userName}'`,
      { user: userName, group: groupName },
      log
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("groups"),
        body: { groupname: fullGroupName },
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        saveIdOnly(groupName, response.body.groupId);
        cy.wrap(response.body.groupId);
      }
    });
  }
);

Cypress.Commands.add(
  "apiGroupCheck",
  (
    userName: string,
    groupNameOrId: string,
    expectedGroups: ApiGroupReturned[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let sortGroups: ApiGroupReturned[];
    let sortExpectedGroups: ApiGroupReturned[];
    let fullGroupName: string;

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupNameOrId;
    } else {
      fullGroupName = getTestName(groupNameOrId);
    }

    const fullUrl = v1ApiPath(`groups/${fullGroupName}`);

    logTestDescription(
      `${userName} Check group '${groupNameOrId}' `,
      { user: userName, groupNameOrId },
      true
    );

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, deviceName, userName, userId is mandatory in expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortGroups = sortArrayOn(response.body.groups, "groupName");
          sortExpectedGroups = sortArrayOn(expectedGroups, "groupName");
          for (let count = 0; count < sortGroups.length; count++) {
            sortGroups[count].Devices = sortArrayOn(
              sortGroups[count].Devices,
              "deviceName"
            );
            sortGroups[count].Users = sortArrayOn(
              sortGroups[count].Users,
              "userName"
            );
            sortGroups[count].GroupUsers = sortArrayOn(
              sortGroups[count].GroupUsers,
              "userId"
            );
          }
          for (let count = 0; count < sortExpectedGroups.length; count++) {
            sortExpectedGroups[count].Devices = sortArrayOn(
              sortExpectedGroups[count].Devices,
              "deviceName"
            );
            sortExpectedGroups[count].Users = sortArrayOn(
              sortExpectedGroups[count].Users,
              "userName"
            );
            sortExpectedGroups[count].GroupUsers = sortArrayOn(
              sortExpectedGroups[count].GroupUsers,
              "userId"
            );
          }
        }
        checkTreeStructuresAreEqualExcept(
          sortExpectedGroups,
          sortGroups,
          excludeCheckOn
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiGroupsCheck",
  (
    userName: string,
    where: any,
    expectedGroups: ApiGroupReturned[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let sortGroups: ApiGroupReturned[];
    let sortExpectedGroups: ApiGroupReturned[];

    logTestDescription(
      `${userName} Check groups accessible for user`,
      { user: userName },
      true
    );
    const params = {
      where: JSON.stringify(where),
    };

    const fullUrl = v1ApiPath(`groups`, params);

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, deviceName, userName, userId is mandatory in expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortGroups = response.body.groups;
          sortExpectedGroups = expectedGroups;
        } else {
          sortGroups = sortArrayOn(response.body.groups, "groupName");
          sortExpectedGroups = sortArrayOn(expectedGroups, "groupName");
          for (let count = 0; count < sortGroups.length; count++) {
            sortGroups[count].Devices = sortArrayOn(
              sortGroups[count].Devices,
              "deviceName"
            );
            sortGroups[count].Users = sortArrayOn(
              sortGroups[count].Users,
              "userName"
            );
            sortGroups[count].GroupUsers = sortArrayOn(
              sortGroups[count].GroupUsers,
              "userId"
            );
          }
          for (let count = 0; count < sortExpectedGroups.length; count++) {
            sortExpectedGroups[count].Devices = sortArrayOn(
              sortExpectedGroups[count].Devices,
              "deviceName"
            );
            sortExpectedGroups[count].Users = sortArrayOn(
              sortExpectedGroups[count].Users,
              "userName"
            );
            sortExpectedGroups[count].GroupUsers = sortArrayOn(
              sortExpectedGroups[count].GroupUsers,
              "userId"
            );
          }
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedGroups,
          sortGroups,
          excludeCheckOn
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiGroupDevicesCheck",
  (
    userName: string,
    groupNameOrId: any,
    expectedDevices: ApiGroupsDevice[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let sortDevices: ApiGroupsDevice[];
    let sortExpectedDevices: ApiGroupsDevice[];
    let fullGroupName: string;

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupNameOrId;
    } else {
      fullGroupName = getTestName(groupNameOrId);
    }

    logTestDescription(
      `${userName} Check group's devices for group ${groupNameOrId}`,
      { user: userName },
      true
    );

    const fullUrl = v1ApiPath(`groups/${fullGroupName}/devices`);

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: fullUrl },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, deviceName, userName, userId is mandatory in expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortDevices = response.body.devices;
          sortExpectedDevices = expectedDevices;
        } else {
          sortDevices = sortArrayOn(response.body.devices, "deviceName");
          sortExpectedDevices = sortArrayOn(expectedDevices, "deviceName");
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedDevices,
          sortDevices,
          excludeCheckOn
        );
      }
    });
  }
);

/*******************************************************************************************************
 * Following are legacy test functions from old tests. The above standard-format API wrappers should be used in
 * preference to these functions.  These may be deleted in the future
 *****************************************************************************************************/

Cypress.Commands.add(
  "testGroupUserCheckAccess",
  (userName: string, groupName: string, testForSuccess: boolean = true) => {
    const user = getCreds(userName);
    const fullGroupname = getTestName(groupName);
    const fullUrl = v1ApiPath("groups");

    logTestDescription(
      `${userName} Check user '${userName}' can see group '${groupName}' `,
      { user: userName, groupName },
      true
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
  }
);
