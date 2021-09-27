/// <reference types="cypress" />

import { getTestName } from "../names";
import {
  v1ApiPath,
  saveCreds,
  getCreds,
  checkRequestFails,
  makeAuthorizedRequestWithStatus,
  sortArrayOn,
  sortArrayOnTwoKeys,
} from "../server";
import { logTestDescription } from "../descriptions";
import {
  ApiDeviceInGroupDevice,
  ApiDeviceQueryDevice,
  ApiDevicesDevice,
  ApiDeviceUsersUser,
  TestDeviceAndGroup,
} from "../types";

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
        const devices = response.body.devices.rows;
        //TODO: Issue 63.  Reenable this when devices count is correct
        //expect(response.body.devices.count).to.equal(expectedDevices.length);
        expect(devices.length).to.equal(expectedDevices.length);
        let devCount: number;
        const sortDevices = sortArrayOn(devices, "devicename");
        const sortExpectedDevices = sortArrayOn(expectedDevices, "devicename");
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
  device: ApiDevicesDevice,
  expectedDevice: ApiDevicesDevice
) {
  expect(device.id).to.equal(expectedDevice.id);
  expect(device.devicename).to.equal(expectedDevice.devicename);
  expect(device.active).to.equal(expectedDevice.active);
  if (expectedDevice.Users === null) {
    expect(device.Users).to.not.exist;
  } else {
    expect(device.Users.length).to.equal(expectedDevice.Users.length);
    // sort users and expected users to ensure order is the same
    const users = sortArrayOn(device.Users, "username");
    const expectedUsers = sortArrayOn(expectedDevice.Users, "username");

    // compare user list
    let count: number;
    for (count = 0; count < expectedUsers.length; count++) {
      expect(users[count].username).to.equal(expectedUsers[count].username);
      expect(users[count].id).to.equal(expectedUsers[count].id);
      expect(users[count].DeviceUsers.admin).to.equal(
        expectedUsers[count].DeviceUsers.admin
      );
      expect(users[count].DeviceUsers.UserId).to.equal(
        expectedUsers[count].DeviceUsers.UserId
      );
    }
  }
}

Cypress.Commands.add(
  "apiDevicesCheckContains",
  (
    userName: string,
    expectedDevices: ApiDevicesDevice[],
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
        const devices = response.body.devices.rows;
        expect(response.body.devices.count).to.be.at.least(
          expectedDevices.length
        );
        expect(devices.length).to.be.at.least(expectedDevices.length);
        let devCount: number;
        //check each device in our expected list
        for (devCount = 0; devCount < expectedDevices.length; devCount++) {
          let found = false;
          // is found somewhere in the actual list
          devices.forEach(function (device: ApiDevicesDevice) {
            // and contains the correct values
            if (device.devicename == expectedDevices[devCount].devicename) {
              found = true;
              checkDeviceMatchesExpected(device, expectedDevices[devCount]);
            }
          });
          expect(found).to.equal(true);
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiDeviceInGroupCheck",
  (
    userName: string,
    deviceName: string,
    groupName: string,
    groupId: number,
    expectedDevice: ApiDeviceInGroupDevice,
    params: any = {},
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${userName} Check user '${userName}' can see device '${deviceName}' in group '${groupName}' `,
      { user: userName, groupName, deviceName },
      true
    );

    // use group id if present, otherwise query by name
    let fullUrl = null;
    if (groupId !== null) {
      fullUrl = v1ApiPath(
        "devices/" + getTestName(deviceName) + "/in-group/" + groupId,
        params
      );
    } else {
      fullUrl = v1ApiPath(
        "devices/" +
          getTestName(deviceName) +
          "/in-group/" +
          getTestName(groupName),
        params
      );
    }

    logTestDescription(
      `Check that ${userName} get device ${deviceName} in group ${groupName} returns ${statusCode} and correct data`,
      {}
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
        const device = response.body.device;
        expect(device.id).to.equal(getCreds(deviceName).id);
        expect(device.deviceName).to.equal(getTestName(deviceName));
        expect(device.groupName).to.equal(getTestName(groupName));
        expect(device.userIsAdmin).to.equal(expectedDevice.userIsAdmin);
        if (expectedDevice.users === null) {
          expect(device.users).to.not.exist;
        } else {
          expect(device.users.length).to.equal(expectedDevice.users.length);
          // sort users and expected users to ensure order is the same
          const users = sortArrayOn(device.users, "userName");
          const expectedUsers = sortArrayOn(expectedDevice.users, "userName");

          // compare user list
          let count: number;
          for (count = 0; count < expectedDevice.users.length; count++) {
            expect(users[count].userName).to.equal(
              expectedUsers[count].userName
            );
            expect(users[count].admin).to.equal(expectedUsers[count].admin);
            expect(users[count].id).to.equal(expectedUsers[count].id);
          }
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiDeviceQueryCheck",
  (
    userName: string,
    devicesArray: TestDeviceAndGroup[],
    groupsArray: string[],
    expectedDevices: ApiDeviceQueryDevice[],
    operator: string = "or",
    statusCode: number = 200
  ) => {
    logTestDescription(
      `${userName} Check devices using query '${JSON.stringify(
        devicesArray
      )}' '${operator}' '${JSON.stringify(groupsArray)}'`,
      { user: userName, devicesArray, groupsArray, operator },
      true
    );

    const params = {
      devices: JSON.stringify(devicesArray),
      groups: JSON.stringify(groupsArray),
      operator: operator,
    };
    const fullUrl = v1ApiPath("devices/query", params);

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
        // sort both devices and expected devices on devicename,groupname to ensure order is same
        const devices = sortArrayOnTwoKeys(
          response.body.devices,
          "devicename",
          "groupname"
        );
        expectedDevices = sortArrayOnTwoKeys(
          expectedDevices,
          "devicename",
          "groupname"
        );
        expect(devices.length).to.equal(expectedDevices.length);

        //compare device list
        for (let index = 0; index < expectedDevices.length; index++) {
          expect(devices[index].groupname).to.equal(
            expectedDevices[index].groupname
          );
          expect(devices[index].devicename).to.equal(
            expectedDevices[index].devicename
          );
          if (
            expectedDevices[index].saltId !== null &&
            expectedDevices[index].saltId !== undefined
          ) {
            expect(devices[index].saltId).to.equal(
              expectedDevices[index].saltId
            );
          }

          //TODO: consider removing the following from API - not a standard format of parameter
          expect(devices[index]["Group.groupname"]).to.equal(
            expectedDevices[index].groupname
          );
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiDeviceUsersCheck",
  (
    userName: string,
    deviceName: string,
    expectedUsers: ApiDeviceUsersUser[],
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
        const users = sortArrayOn(response.body.rows, "username");
        expectedUsers = sortArrayOn(expectedUsers, "username");
        expect(users.length).to.equal(expectedUsers.length);

        for (let index = 0; index < expectedUsers.length; index++) {
          expect(users[index].id).to.equal(expectedUsers[index].id);
          expect(users[index].username).to.equal(expectedUsers[index].username);
          expect(users[index].relation).to.equal(expectedUsers[index].relation);
          expect(users[index].admin).to.equal(expectedUsers[index].admin);
          expect(users[index].email).to.equal(expectedUsers[index].email);
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
          admin: "false",
          username: fullName,
        },
      },
      deviceAdminUser,
      statusCode
    );
  }
);
