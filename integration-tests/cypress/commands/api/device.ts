/// <reference types="cypress" />

import { getTestName } from "../names";
import {
  v1ApiPath,
  saveCreds,
  getCreds,
  checkRequestFails,
  makeAuthorizedRequestWithStatus,
  sortArrayOn,
} from "../server";
import { logTestDescription } from "../descriptions";
import { ApiDevicesDevice } from "../types";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import ApiDeviceUserRelationshipResponse = Cypress.ApiDeviceUserRelationshipResponse;

Cypress.Commands.add(
  "apiDeviceAdd",
  (
    deviceName: string,
    groupName: string,
    saltId: number | null = null,
    password: string | null = null,
    generateUniqueName: boolean = true,
    log = true,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `Create camera '${deviceName}' in group '${groupName}' with saltId '${saltId}'`,
      {
        camera: deviceName,
        group: groupName,
        saltId: saltId,
      },
      log
    );

    const request = createDevice(
      deviceName,
      groupName,
      password,
      saltId,
      generateUniqueName
    );
    if (statusCode == 200) {
      cy.request(request).then((response) => {
        const id = response.body.id;
        saveCreds(response, deviceName, id);
      });
    } else {
      checkRequestFails(request, statusCode);
    }
  }
);

Cypress.Commands.add(
  "apiDeviceReregister",
  (
    oldName: string,
    newName: string,
    newGroup: string,
    password: string | null = null,
    generateUniqueName: boolean = true,
    statusCode: number = 200
  ) => {
    let uniqueName: string;
    logTestDescription(
      `Reregister camera '${newName}' in group '${newGroup}'`,
      {
        camera: newName,
        group: newGroup,
      },
      true
    );

    if (generateUniqueName == true) {
      uniqueName = getTestName(newName);
    } else {
      uniqueName = newName;
    }

    if (password === null) {
      password = "p" + getTestName(uniqueName);
    }

    const data = {
      newName: uniqueName,
      newPassword: password,
      newGroup: getTestName(newGroup),
    };
    const fullUrl = v1ApiPath("devices/reregister");

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: fullUrl,
        body: data,
      },
      oldName,
      statusCode
    ).then((response) => {
      const id = response.body.id;
      saveCreds(response, newName, id);
    });
  }
);

function createDevice(
  deviceName: string,
  groupName: string,
  password: string,
  saltId: number,
  makeCameraNameTestName = true
): any {
  const fullName = makeCameraNameTestName
    ? getTestName(deviceName)
    : deviceName;

  if (password === null) {
    password = "p" + fullName;
  }

  interface DataType {
    devicename: string;
    password: string;
    group: string;
    saltId?: number;
  }

  const data: DataType = {
    devicename: fullName,
    password: password,
    group: getTestName(groupName),
  };

  if (saltId !== null) {
    data.saltId = saltId;
  }

  return {
    method: "POST",
    url: v1ApiPath("devices"),
    body: data,
  };
}

Cypress.Commands.add(
  "apiDevicesCheck",
  (
    userName: string,
    expectedDevices: ApiDevicesDevice[],
    params: any = {},
    statusCode: number = 200
  ) => {
    const fullUrl = v1ApiPath("devices", params);

    logTestDescription(
      `${userName} Check devices seen by  user '${userName}'`,
      { user: userName },
      true
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === null || statusCode == 200) {
        const devices = response.body.devices;
        expect(devices.length).to.equal(expectedDevices.length);
        let devCount: number;
        const sortDevices = sortArrayOn(devices, "deviceName");
        const sortExpectedDevices = sortArrayOn(expectedDevices, "deviceName");
        for (devCount = 0; devCount < expectedDevices.length; devCount++) {
          checkDeviceMatchesExpected(
            sortDevices[devCount],
            sortExpectedDevices[devCount]
          );
        }
      }
    });
  }
);

function checkDeviceMatchesExpected(
  device: ApiDeviceResponse,
  expectedDevice: ApiDeviceResponse
) {
  expect(device.groupName, "groupName").to.equal(expectedDevice.groupName);
  expect(device.deviceName, "deviceName").to.equal(expectedDevice.deviceName);
  expect(device.groupId, "groupId").to.equal(expectedDevice.groupId);
  expect(device.active, "active").to.equal(expectedDevice.active);
  expect(device.admin, "admin").to.equal(expectedDevice.admin);
}

Cypress.Commands.add(
  "apiDevicesCheckContains",
  (
    userName: string,
    expectedDevices: ApiDeviceResponse[],
    params: any = {},
    statusCode: number = 200
  ) => {
    const fullUrl = v1ApiPath("devices", params);
    logTestDescription(
      `${userName} Check devices seen by user '${userName}' contain the expected devices `,
      { user: userName },
      true
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === null || statusCode == 200) {
        const devices = response.body.devices;
        expect(devices.length).to.be.at.least(expectedDevices.length);
        let devCount: number;
        //check each device in our expected list
        for (devCount = 0; devCount < expectedDevices.length; devCount++) {
          // is found somewhere in the actual list

          // Note that deviceNames only need to be unique within groups, so
          // match on groupName also.
          const found = devices.find(
            (device) =>
              device.deviceName === expectedDevices[devCount].deviceName &&
              device.groupName === expectedDevices[devCount].groupName
          );
          if (found) {
            checkDeviceMatchesExpected(found, expectedDevices[devCount]);
          }
          expect(found).to.not.equal(undefined);
        }
      }
    });
  }
);



Cypress.Commands.add(
  "apiDevice",
  (    userName: string,
      deviceName: string,
      statusCode: number = 200

    ) => {
      logTestDescription(
        `Get device ${deviceName} for ${userName}`,
        {deviceName,userName}
      );
      const fullUrl = v1ApiPath(
        "devices/" + getCreds(deviceName).id)

      return makeAuthorizedRequestWithStatus(
        {
          method: "GET",
          url: fullUrl,
        },
        userName,
        statusCode
      )
    }
  );

Cypress.Commands.add(
  "apiDeviceInGroup",
  (    userName: string,
      deviceName: string,
      groupName: string | null,
      groupId: number | null,
      params: any = {},
      statusCode: number = 200

    ) => {
      const group = groupId !== null? groupId  :getTestName(groupName)
      const fullUrl = v1ApiPath(
        "devices/" + getTestName(deviceName) + "/in-group/" + group,
        params
      );
      logTestDescription(
        `Get device ${deviceName} in group ${group} for ${userName}`,
        {}
      );

      return makeAuthorizedRequestWithStatus(
        {
          method: "GET",
          url: fullUrl,
          body: null,
        },
        userName,
        statusCode
      )

    }
  );


Cypress.Commands.add(
  "apiDeviceInGroupCheck",
  (
    userName: string,
    deviceName: string,
    groupName: string | null,
    groupId: number | null,
    expectedDevice: ApiDeviceResponse,
    params: any = {},
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${userName} Check user '${userName}' can see device '${deviceName}' in group '${groupName}' `,
      { user: userName, groupName, deviceName },
      true
    );
    cy.apiDeviceInGroup(userName,deviceName,groupName,groupId,params,statusCode).then((response) => {
      if (statusCode === null || statusCode == 200) {
        const device = response.body.device;
        expect(device.id).to.equal(getCreds(deviceName).id);
        expect(device.deviceName).to.equal(getTestName(deviceName));
        expect(device.groupName).to.equal(getTestName(groupName));
        expect(device.admin).to.equal(expectedDevice.admin);
      }
    });
  }
);

Cypress.Commands.add(
  "apiDeviceUsersCheck",
  (
    userName: string,
    deviceName: string,
    expectedUsers: ApiDeviceUserRelationshipResponse[],
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${userName} Check users for device '${deviceName}' requesting as user '${userName}'`,
      { user: userName, deviceName },
      true
    );
    const params = {
      deviceId: getCreds(deviceName).id,
    };
    const fullUrl = v1ApiPath("devices/users", params);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === null || statusCode == 200) {
        // API returns devices: [ groupname: ..., devicename: ..., saltId, ..., Group.groupName: ... ]
        // sort users and expected users to ensure order is the same
        const users = sortArrayOn(response.body.users, "userName");
        expectedUsers = sortArrayOn(expectedUsers, "userName");
        expect(users.length).to.equal(expectedUsers.length);

        for (let index = 0; index < expectedUsers.length; index++) {
          expect(users[index].id).to.equal(expectedUsers[index].id);
          expect(users[index].userName).to.equal(expectedUsers[index].userName);
          expect(users[index].relation).to.equal(expectedUsers[index].relation);
          expect(users[index].admin).to.equal(expectedUsers[index].admin);
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiDeviceUserAdd",
  (
    deviceAdminUser: string,
    userName: string,
    device: string,
    admin: boolean = false,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullName: string;
    logTestDescription(
      `${deviceAdminUser} Adding user '${userName}' to device '${device}'`,
      { user: userName, device }
    );
    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestName(userName);
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("devices/users"),
        body: {
          deviceId: getCreds(device).id,
          admin: admin,
          username: fullName,
        },
      },
      deviceAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiDeviceUserRemove",
  (
    deviceAdminUser: string,
    userName: string,
    device: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullName: string;
    if (additionalChecks["useRawUserName"] === true) {
      fullName = userName;
    } else {
      fullName = getTestName(userName);
    }

    logTestDescription(
      `${deviceAdminUser} Removing user '${userName}' to device '${device}'`,
      { user: userName, device }
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: v1ApiPath("devices/users"),
        body: {
          deviceId: getCreds(device).id,
          userName: fullName,
        },
      },
      deviceAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiDeviceHeartbeat",
  (
    deviceName: string,
    nextHeartbeat: Date,
    statusCode: number = 200,
  ) => {

    logTestDescription(
      `${deviceName} Sending heart beat, next heart beat ${nextHeartbeat}'`,{deviceName,nextHeartbeat}
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("devices/heartbeat"),
        body: {
          nextHeartbeat: nextHeartbeat,
        },
      },
      deviceName,
      statusCode
    );
  }

);
