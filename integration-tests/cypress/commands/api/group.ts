// load the global Cypress types
/// <reference types="cypress" />

import { getTestName } from "../names";
import { logTestDescription, prettyLog } from "../descriptions";

import {
  getCreds,
  makeAuthorizedRequestWithStatus,
  saveIdOnly,
  v1ApiPath,
  sortArrayOn,
  sortArrayOnHash,
  checkTreeStructuresAreEqualExcept,
} from "../server";

import {
  ApiGroupsUserReturned,
  ApiGroupReturned,
  ApiGroupsDevice,
  ApiStationData,
} from "../types";
import { ApiStationResponse } from "@typedefs/api/station";

Cypress.Commands.add(
  "apiGroupUserAdd",
  (
    groupAdminUser: string,
    userName: string,
    groupName: string,
    admin = false,
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
      fullName = getTestName(userName);
    }

    const adminStr = admin ? " as admin " : "";
    logTestDescription(
      `${groupAdminUser} Adding user '${userName}' to group '${groupName}' ${adminStr}`,
      { user: userName, groupName, admin },
      log
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("groups/users"),
        body: {
          group: fullGroupName,
          admin: admin.toString(),
          username: fullName,
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

    let fullName: string;
    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestName(userName);
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
          username: fullName,
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
    expectedUsers: ApiGroupsUserReturned[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;
    let sortUsers: ApiGroupsUserReturned[];
    let sortExpectedUsers: ApiGroupsUserReturned[];

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
        //sort expected and actual events into same order (means groupName, devicename, username, userId is mandatory in expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortGroups = sortArrayOn(response.body.groups, "groupName");
          sortExpectedGroups = sortArrayOn(expectedGroups, "groupName");
          for (let count = 0; count < sortGroups.length; count++) {
            sortGroups[count].Devices = sortArrayOn(
              sortGroups[count].Devices,
              "devicename"
            );
            sortGroups[count].Users = sortArrayOn(
              sortGroups[count].Users,
              "username"
            );
            sortGroups[count].GroupUsers = sortArrayOn(
              sortGroups[count].GroupUsers,
              "userId"
            );
          }
          for (let count = 0; count < sortExpectedGroups.length; count++) {
            sortExpectedGroups[count].Devices = sortArrayOn(
              sortExpectedGroups[count].Devices,
              "devicename"
            );
            sortExpectedGroups[count].Users = sortArrayOn(
              sortExpectedGroups[count].Users,
              "username"
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
        //sort expected and actual events into same order (means groupName, devicename, username, userId is mandatory in expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortGroups = response.body.groups;
          sortExpectedGroups = expectedGroups;
        } else {
          sortGroups = sortArrayOn(response.body.groups, "groupName");
          sortExpectedGroups = sortArrayOn(expectedGroups, "groupName");
          for (let count = 0; count < sortGroups.length; count++) {
            sortGroups[count].Devices = sortArrayOn(
              sortGroups[count].Devices,
              "devicename"
            );
            sortGroups[count].Users = sortArrayOn(
              sortGroups[count].Users,
              "username"
            );
            sortGroups[count].GroupUsers = sortArrayOn(
              sortGroups[count].GroupUsers,
              "userId"
            );
          }
          for (let count = 0; count < sortExpectedGroups.length; count++) {
            sortExpectedGroups[count].Devices = sortArrayOn(
              sortExpectedGroups[count].Devices,
              "devicename"
            );
            sortExpectedGroups[count].Users = sortArrayOn(
              sortExpectedGroups[count].Users,
              "username"
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
        //sort expected and actual events into same order (means groupName, devicename, username, userId is mandatory in expectedGroup)
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

Cypress.Commands.add(
  "apiGroupStationsUpdate",
  (
    userName: string,
    groupIdOrName: string,
    stations: ApiStationData[],
    updateFrom?: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }

    logTestDescription(
      `Add stations ${prettyLog(stations)} to group '${groupIdOrName}' `,
      { userName, groupIdOrName, stations, updateFrom }
    );

    const body: { [key: string]: string } = {
      stations: JSON.stringify(stations),
    };
    if (updateFrom !== undefined) {
      body["from-date"] = updateFrom;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`groups/${fullGroupName}/stations`),
        body,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["warnings"]) {
        const warnings = response.body.warnings;
        const expectedWarnings = additionalChecks["warnings"];
        expect(warnings).to.exist;
        expectedWarnings.forEach(function (warning: string) {
          expect(warnings, "Expect warning to be present").to.contain(warning);
        });
      }
      if (statusCode == 200) {
        //store station Ids against names
        for (let count = 0; count < stations.length; count++) {
          const stationName = stations[count].name;
          const stationId = response.body.stationIdsAddedOrUpdated[count];
          saveIdOnly(stationName, stationId);
        }
        cy.wrap(response.body.stationIdsAddedOrUpdated);
      }
    });
  }
);

Cypress.Commands.add(
  "apiGroupsStationsCheck",
  (
    userName: string,
    groupIdOrName: string,
    expectedStations: ApiStationResponse[],
    excludeCheckOn: any = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check stations for group ${groupIdOrName}`, {
      userName,
      groupIdOrName,
    });
    let fullGroupName: string;
    let sortStations: ApiStationResponse[];
    let sortExpectedStations: ApiStationResponse[];

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`groups/${fullGroupName}/stations`),
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, devicename, username, userId is mandatory in   expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortStations = response.body.stations;
          sortExpectedStations = expectedStations;
        } else {
          sortStations = sortArrayOnHash(response.body.stations, "location");
          sortExpectedStations = sortArrayOnHash(expectedStations, "location");
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedStations,
          sortStations,
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
