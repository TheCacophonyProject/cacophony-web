import { getTestName } from "../names";
import {
  checkMessages,
  checkRequestFails,
  checkTreeStructuresAreEqualExcept,
  getCreds,
  makeAuthorizedRequest,
  makeAuthorizedRequestWithStatus,
  saveCreds,
  sortArrayOn,
  v1ApiPath,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { TestNameAndId } from "../types";
import { NOT_NULL, NOT_NULL_STRING } from "../constants";
import { DeviceId, IsoFormattedDateString, LatLng } from "@typedefs/api/common";
import { DeviceType, HttpStatusCode } from "@typedefs/api/consts";
import {
  ApiDeviceHistory,
  ApiMaskRegionsData,
  DeviceHistorySetBy,
} from "@typedefs/api/device";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import ApiGroupUserRelationshipResponse = Cypress.ApiGroupUserRelationshipResponse;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * create a device in the given group
       * optionally check for non-200 statusCode
       */
      apiDeviceAdd(
        deviceName: string,
        groupName: string,
        atTime?: Date,
        saltId?: number,
        password?: string,
        generateUniqueName?: boolean,
        log?: boolean,
        statusCode?: number,
      ): Cypress.Chainable<DeviceId>;

      /**
       * Set an active device inactive.  Returns `true` on success
       */
      apiDeviceDeleteOrSetInactive(
        userName: string,
        deviceName: string,
        groupName: string,
      ): Cypress.Chainable<boolean>;

      /**
       * Update a device's station (deviceHistory) at a given time
       * optionally check for non-200 statusCode
       * By default deviceId and stationId are looked up from
       * names in deviceIdOrName and stationIdOrName
       * Optionally supply raw ids by specifying
       *   additionalParams: {useRawDeviceId: true}
       *   additionalParams: {useRawStationId: true}
       */
      apiDeviceFixLocation(
        userName: string,
        deviceIdOrName: string,
        stationFromDate: string,
        stationIdOrName: string,
        location?: LatLng,
        statusCode?: HttpStatusCode,
        additionalParams?: {
          useRawStationId?: boolean;
          useRawDeviceId?: boolean;
          additionalParams?: object;
          messages?: string[];
        },
      ): Cypress.Chainable<void>;

      /**
       * Get history for a device
       * compare with expected history
       * by default DeviceId is looked up using name.  Set additionalChecks["useRawDeviceId"]=true to use Id provided
       * By default history and expectedHistory are sorted before comparison
       * Set additionalChecks["doNotSort"]=true to skip sorting
       * optionally check for a non-200 status code
       */
      apiDeviceHistoryCheck(
        userName: string,
        deviceIdOrName: string,
        expectedHistory: ApiDeviceHistory[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawDeviceId?: boolean; messages?: string[] },
      ): Cypress.Chainable<void>;

      /**
       * register a device under a new group or name
       * optionally check for an error response (statusCode!=200OK)
       * optionally supply a password (autogenerate if not)
       * optionally check for non-200 statusCode
       */
      apiDeviceReregister(
        oldName: string,
        newName: string,
        newGroup: string,
        newPassword?: string,
        generateUniqueName?: boolean,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<void>;

      /**
       * register a device under a new group or name
       * optionally check for an error response (statusCode!=200OK)
       * optionally supply a password (autogenerate if not)
       * optionally check for non-200 statusCode
       */
      apiDeviceReregisterAuthorized(
        oldName: string,
        newName: string,
        newGroup: string,
        adminUserName: string,
        newPassword?: string,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<Cypress.Response<{ id: DeviceId; token: string }>>;

      /**
       * Retrieve devices list from /devices
       * compare with expected device details (JSON equivalent to that returned by API)
       * pass optional params (params) to API call
       * optionally check for a non-200 status code
       */
      apiDevicesCheck(
        userName: string,
        expectedDevice: ApiDeviceResponse[],
        params?: object,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<void>;

      /**
       * Same as apiDevicesCheck but check the expected items are in the list, rather than the only things in the list
       */
      apiDevicesCheckContains(
        userName: string,
        expectedDevices: ApiDeviceResponse[],
        params?: object,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<void>;

      /**
       * Retrieve device details using id
       */
      apiDevice(
        userName: string,
        deviceName: string,
        activeAndInactive?: boolean,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<Cypress.Response<{ device: ApiDeviceResponse }>>;

      /**
       * Retrieve device details using name and groupname from /device/XX/in-group/YY
       * use groupId if provided, otherwise groupName - the unused parameter should be set to null
       */
      apiDeviceInGroup(
        userName: string,
        deviceName: string,
        groupName: string | null,
        groupId: number | null,
        params?: object,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<Cypress.Response<{ device: ApiDeviceResponse }>>;

      /**
       * Retrieve device details using name and groupname from /device/XX/in-group/YY
       * use groupId if provided, otherwise groupName - the unused parameter should be set to null
       * compare with expected device details (JSON equivalent to that returned by API)
       * optionally check for a non-200 status code
       */
      apiDeviceInGroupCheck(
        userName: string,
        deviceName: string,
        groupName: string | null,
        groupId: number | null,
        expectedDevice: ApiDeviceResponse,
        params?: object,
        statusCode?: HttpStatusCode,
      ): Cypress.Chainable<Cypress.Response<{ device: ApiDeviceResponse }>>;

      // FIXME - Delete?  Just use deviceInGroup?
      /**
       * Retrieve list of users  who can access a device from /devices/users
       * compare with expected list of users
       * takes deviceName and looks up the device Id to pass tot he API.  Hence deviceName must be unique within test environment
       * optionally check for a non-200 status code
       */
      apiDeviceUsersCheck(
        userName: string,
        deviceName: string,
        expectedUsers: ApiGroupsUserRelationshipResponse[],
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      apiDeviceHeartbeat(
        deviceName: string,
        nextHeartbeat: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: { messages?: string[] },
      ): Chainable<void>;

      apiDeviceAddMaskRegions(
        useName: string,
        deviceName: string,
        maskRegions: ApiMaskRegionsData,
        statusCode?: HttpStatusCode,
        additionalChecks?: { messages?: string[] },
      ): Chainable<Cypress.Response<{ messages: string[] }>>;

      apiDeviceGetMaskRegions(
        useName: string,
        deviceName: string,
        atTime?: Date,
        statusCode?: HttpStatusCode,
        additionalChecks?: { messages?: string[] },
      ): Chainable<Cypress.Response<ApiMaskRegionsData>>;

      /**
       * Retrieve list of users who can access a device from /devices/users
       * compare with expected list of users
       * takes deviceName and looks up the device Id to pass to the API.  Hence deviceName must be unique within test environment
       * optionally check for a non-200 status code
       */
      createDeviceStationRecordingAndFix(
        userName: string,
        deviceName: string,
        stationName: string,
        recName: string,
        group: string,
        oldLocation: LatLng,
        newLocation: LatLng,
        recTime: string,
        stationTime: string,
        move?: boolean,
        additionalRecTime?: string,
      ): Chainable<ApiDeviceHistory[]>;
    }
  }
}

Cypress.Commands.add(
  "apiDeviceAdd",
  (
    deviceName: string,
    groupName: string,
    atTime?: Date,
    saltId: number | null = null,
    password: string | null = null,
    generateUniqueName = true,
    log = true,
    statusCode = 200,
  ) => {
    logTestDescription(
      `Create camera '${deviceName}' in group '${groupName}' with saltId '${saltId}'`,
      {
        camera: deviceName,
        group: groupName,
        saltId: saltId,
      },
      log,
    );

    const request = createDevice(
      deviceName,
      groupName,
      password,
      saltId,
      generateUniqueName,
      atTime,
    );
    if (statusCode == 200) {
      cy.request(request).then((response) => {
        const id = response.body.id;
        saveCreds(response, deviceName, id);
        cy.wrap(id);
      });
    } else {
      checkRequestFails(request, statusCode);
    }
  },
);

Cypress.Commands.add(
  "apiDeviceFixLocation",
  (
    userName: string,
    deviceIdOrName: string,
    stationFromDate: string,
    stationIdOrName: string,
    recordingLocation: LatLng,
    statusCode: number = HttpStatusCode.Ok,
    additionalChecks: {
      useRawStationId?: boolean;
      useRawDeviceId?: boolean;
      additionalParams?: object;
      messages?: string[];
    } = {},
  ) => {
    let stationId: number;
    let deviceId: string;

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks.useRawStationId === true) {
      stationId = parseInt(stationIdOrName);
    } else {
      stationId = getCreds(getTestName(stationIdOrName)).id;
    }

    //Get device ID from name (unless we're asked not to)
    if (additionalChecks.useRawDeviceId === true) {
      deviceId = deviceIdOrName;
    } else {
      deviceId = getCreds(deviceIdOrName).id.toString();
    }

    const body = {
      setStationAtTime: {
        fromDateTime: stationFromDate,
        stationId: stationId,
      },
      ...(additionalChecks.additionalParams || {}),
    };

    if (recordingLocation) {
      body.setStationAtTime["location"] = recordingLocation;
    }

    logTestDescription(
      `Fix device ${deviceId} (${deviceIdOrName})  to station '${stationId}' (${stationIdOrName}) ${prettyLog(
        body,
      )}`,
      { body: body },
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath(`devices/${deviceId}/fix-location`),
        body,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.messages) {
        checkMessages(response, additionalChecks.messages);
      }
    });
  },
);

Cypress.Commands.add(
  "apiDeviceHistoryCheck",
  (
    userName: string,
    deviceIdOrName: string,
    expectedHistory: ApiDeviceHistory[],
    statusCode: number = HttpStatusCode.Ok,
    additionalChecks: { useRawDeviceId?: boolean; messages?: string[] } = {},
  ) => {
    let deviceId: string;

    //Get device ID from name (unless we're asked not to)
    if (additionalChecks.useRawDeviceId === true) {
      deviceId = deviceIdOrName;
    } else {
      deviceId = getCreds(deviceIdOrName).id.toString();
    }

    logTestDescription(
      `Check device history for  device ${deviceId} (${deviceIdOrName})`,
      { deviceId: deviceId },
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`devices/${deviceId}/history`),
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          history: ApiDeviceHistory[];
          messages: string[];
        }>,
      ) => {
        if (additionalChecks.messages) {
          checkMessages(response, additionalChecks.messages);
        }
        if (statusCode === null || statusCode == 200) {
          const deviceHistory = response.body.history;
          expect(deviceHistory.length).to.equal(expectedHistory.length);
          let devCount: number;
          let sortHistory = sortArrayOn(deviceHistory, "fromDateTime");
          let sortExpectedHistory = sortArrayOn(
            expectedHistory,
            "fromDateTime",
          );

          // JS sort is stable, so we can re-sort to put `register` at the beginning.
          const sortOrder = ["register", "automatic", "user"];
          sortHistory = sortArrayOn(deviceHistory, "setBy", sortOrder);
          sortExpectedHistory = sortArrayOn(
            expectedHistory,
            "setBy",
            sortOrder,
          );
          for (devCount = 0; devCount < expectedHistory.length; devCount++) {
            checkTreeStructuresAreEqualExcept(
              sortExpectedHistory[devCount],
              sortHistory[devCount],
              [".id"],
            );
          }
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiDeviceReregister",
  (
    oldName: string,
    newName: string,
    newGroup: string,
    password: string | null = null,
    generateUniqueName = true,
    statusCode = 200,
  ) => {
    let uniqueName: string;
    logTestDescription(
      `Reregister camera '${newName}' in group '${newGroup}'`,
      {
        camera: newName,
        group: newGroup,
      },
      true,
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
      statusCode,
    ).then((response: Cypress.Response<{ id: DeviceId; token: string }>) => {
      const id = response.body.id;
      saveCreds(response, newName, id);
    });
  },
);

Cypress.Commands.add(
  "apiDeviceReregisterAuthorized",
  (
    oldName: string,
    newName: string,
    newGroup: string,
    adminUserName: string,
    password: string | null = null,
    statusCode = 200,
  ) => {
    logTestDescription(
      `Reregister camera '${newName}' in group '${newGroup}'`,
      {
        camera: newName,
        group: newGroup,
      },
      true,
    );
    const uniqueName = getTestName(newName);
    if (password === null) {
      password = "p" + getTestName(uniqueName);
    }

    const data = {
      newName: uniqueName,
      newPassword: password,
      newGroup: getTestName(newGroup),
      authorizedToken: getCreds(adminUserName).jwt,
    };

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("devices/reregister-authorized"),
        body: data,
      },
      oldName,
      statusCode,
    ).then((response: Cypress.Response<{ id: DeviceId; token: string }>) => {
      const id = response.body.id;
      saveCreds(response, newName, id);
    });
  },
);

function createDevice(
  deviceName: string,
  groupName: string,
  password: string,
  saltId: number,
  makeCameraNameTestName = true,
  atTime?: Date,
) {
  const fullName = makeCameraNameTestName
    ? getTestName(deviceName)
    : deviceName;

  if (password === null) {
    password = "p" + fullName;
  }

  interface DataType {
    deviceName: string;
    password: string;
    group: string;
    saltId?: number;
    fromDateTime?: IsoFormattedDateString;
  }

  const data: DataType = {
    deviceName: fullName,
    password: password,
    group: getTestName(groupName),
  };

  if (saltId !== null) {
    data.saltId = saltId;
  }
  if (atTime) {
    data.fromDateTime = atTime.toISOString();
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
    expectedDevices: ApiDeviceResponse[],
    params: object = {},
    statusCode = 200,
  ) => {
    const fullUrl = v1ApiPath("devices", params);

    logTestDescription(
      `${userName} Check devices seen by  user '${userName}'`,
      { user: userName },
      true,
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ devices: ApiDeviceResponse[] }>) => {
      if (statusCode === null || statusCode == 200) {
        const devices = response.body.devices;
        expect(devices.length).to.equal(expectedDevices.length);
        let devCount: number;
        const sortDevices = sortArrayOn(devices, "deviceName");
        const sortExpectedDevices = sortArrayOn(expectedDevices, "deviceName");
        for (devCount = 0; devCount < expectedDevices.length; devCount++) {
          checkDeviceMatchesExpected(
            sortDevices[devCount],
            sortExpectedDevices[devCount],
          );
        }
      }
    });
  },
);

function checkDeviceMatchesExpected(
  device: ApiDeviceResponse,
  expectedDevice: ApiDeviceResponse,
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
    params: object = {},
    statusCode = 200,
  ) => {
    const fullUrl = v1ApiPath("devices", params);
    logTestDescription(
      `${userName} Check devices seen by user '${userName}' contain the expected devices `,
      { user: userName },
      true,
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ devices: ApiDeviceResponse[] }>) => {
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
              device.groupName === expectedDevices[devCount].groupName,
          );
          if (found) {
            checkDeviceMatchesExpected(found, expectedDevices[devCount]);
          }
          expect(found).to.not.equal(undefined);
        }
      }
    });
  },
);

Cypress.Commands.add(
  "apiDevice",
  (
    userName: string,
    deviceName: string,
    activeAndInactive = false,
    statusCode = 200,
  ) => {
    logTestDescription(`Get device ${deviceName} for ${userName}`, {
      deviceName,
      userName,
    });
    return makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`devices/${getCreds(deviceName).id}`, {
          "only-active": !activeAndInactive,
        }),
      },
      userName,
      statusCode,
    ) as Cypress.Chainable<Cypress.Response<{ device: ApiDeviceResponse }>>;
  },
);

Cypress.Commands.add(
  "apiDeviceInGroup",
  (
    userName: string,
    deviceName: string,
    groupName: string | null,
    groupId: number | null,
    params: object = {},
    statusCode = 200,
  ) => {
    const group = groupId !== null ? groupId : getTestName(groupName);
    const fullUrl = v1ApiPath(
      "devices/" + getTestName(deviceName) + "/in-group/" + group,
      params,
    );
    logTestDescription(
      `Get device ${deviceName} in group ${group} for ${userName}`,
      {},
    );

    return makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null,
      },
      userName,
      statusCode,
    ) as Cypress.Chainable<Cypress.Response<{ device: ApiDeviceResponse }>>;
  },
);

Cypress.Commands.add(
  "apiDeviceInGroupCheck",
  (
    userName: string,
    deviceName: string,
    groupName: string | null,
    groupId: number | null,
    expectedDevice: ApiDeviceResponse,
    params: object = {},
    statusCode = 200,
  ) => {
    logTestDescription(
      `${userName} Check user '${userName}' can see device '${deviceName}' in group '${groupName}' `,
      { user: userName, groupName, deviceName },
      true,
    );
    cy.apiDeviceInGroup(
      userName,
      deviceName,
      groupName,
      groupId,
      params,
      statusCode,
    ).then((response: Cypress.Response<{ device: ApiDeviceResponse }>) => {
      if (statusCode === null || statusCode == 200) {
        checkTreeStructuresAreEqualExcept(expectedDevice, response.body.device);
      }
    });
  },
);

Cypress.Commands.add(
  "apiDeviceUsersCheck",
  (
    userName: string,
    deviceName: string,
    expectedUsers: ApiGroupUserRelationshipResponse[],
    statusCode = 200,
  ) => {
    logTestDescription(
      `${userName} Check users for device '${deviceName}' requesting as user '${userName}'`,
      { user: userName, deviceName },
      true,
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          users: ApiGroupUserRelationshipResponse[];
        }>,
      ) => {
        if (statusCode === null || statusCode == 200) {
          // API returns devices: [ groupName: ..., deviceName: ..., saltId, ..., Group.groupName: ... ]
          // sort users and expected users to ensure order is the same
          const users = sortArrayOn(response.body.users, "userName");
          expectedUsers = sortArrayOn(expectedUsers, "userName");
          expect(users.length).to.equal(expectedUsers.length);

          for (let index = 0; index < expectedUsers.length; index++) {
            expect(users[index].id).to.equal(expectedUsers[index].id);
            expect(users[index].userName).to.equal(
              expectedUsers[index].userName,
            );
            expect(users[index].admin).to.equal(expectedUsers[index].admin);
          }
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiDeviceHeartbeat",
  (
    deviceName: string,
    nextHeartbeat: string,
    statusCode = 200,
    additionalChecks: { messages?: string[] } = {},
  ) => {
    logTestDescription(`Register heartbeat for camera '${deviceName}'`, {
      camera: deviceName,
      nextHeartbeat: nextHeartbeat,
    });

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("devices/heartbeat"),
        body: {
          nextHeartbeat: nextHeartbeat,
        },
      },
      deviceName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.messages !== undefined) {
        checkMessages(response, additionalChecks.messages);
      }
    });
  },
);

// Custom test functions

Cypress.Commands.add(
  "createDeviceStationRecordingAndFix",
  (
    userName: string,
    deviceName: string,
    stationName: string,
    recName: string,
    group: string,
    oldLocation: LatLng,
    newLocation: LatLng,
    recTime: string,
    stationTime: string,
    move = true,
    additionalRecTime?: string,
  ) => {
    let fixLocation: LatLng;
    let expectedLocation: LatLng;
    const expectedHistory: ApiDeviceHistory[] = [];
    let expectedMessage = "Updated 1 recording(s)";

    logTestDescription(
      `Create device, station, recording & fix '${deviceName}' in group '${group}' with recName '${recName}'`,
      {
        userName,
        deviceName,
        stationName,
        recName,
        group,
        oldLocation,
        newLocation,
        recTime,
        stationTime,
        move,
      },
      true,
    );
    //set move=true to move the recording to new location
    //set move=false to reassign recording to station, but keep old location
    if (move == true) {
      fixLocation = null;
      expectedLocation = newLocation;
    } else {
      fixLocation = oldLocation;
      expectedLocation = oldLocation;
    }

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added
      expectedHistory[0] = TestCreateExpectedHistoryEntry(
        deviceName,
        group,
        NOT_NULL_STRING,
        null,
        "register",
        null,
      );

      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: new Date(recTime) },
        recName,
      )
        .thenCheckStationIsNew(userName)
        .then((autoStation: TestNameAndId) => {
          //Device history for firstTime, oldLocation, autoStation added
          cy.log("Created automatic station", autoStation.name, autoStation.id);
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            recTime,
            oldLocation,
            "automatic",
            autoStation.name,
          );

          if (additionalRecTime) {
            cy.testUploadRecording(
              deviceName,
              { ...oldLocation, time: new Date(additionalRecTime) },
              recName,
            );
            expectedMessage = "Updated 2 recording(s)";
          }

          // USER ADDS STATION AND FIXES RECORDINGS

          cy.log("Create a new station");
          cy.apiGroupStationAdd(
            userName,
            group,
            { name: stationName, ...newLocation },
            stationTime,
          ).then((manualStationId: number) => {
            cy.log(
              "Update first and subsequent recording's location to match manual station",
              manualStationId,
            );
            cy.apiDeviceFixLocation(
              userName,
              deviceName,
              recTime,
              manualStationId.toString(),
              fixLocation,
              HttpStatusCode.Ok,
              { messages: [expectedMessage], useRawStationId: true },
            ).then(() => {
              expectedHistory[1].stationId = manualStationId;
              expectedHistory[1].location = expectedLocation;
              expectedHistory[1].setBy = "user";
            });
          });
        });
    });

    cy.wrap(expectedHistory);
  },
);

Cypress.Commands.add(
  "apiDeviceAddMaskRegions",
  (
    userName: string,
    deviceName: string,
    maskRegions: ApiMaskRegionsData,
    statusCode?: number,
    additionalChecks: { messages?: string[] } = {},
  ) => {
    logTestDescription(
      `Add ${
        Object.keys(maskRegions.maskRegions).length
      } mask regions for camera '${deviceName}'}`,
      {
        camera: deviceName,
      },
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`devices/${getCreds(deviceName).id}/mask-regions`),
        body: maskRegions,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.messages !== undefined) {
        checkMessages(response, additionalChecks.messages);
      }
      cy.wrap(response);
    });
  },
);

Cypress.Commands.add(
  "apiDeviceGetMaskRegions",
  (
    userName: string,
    deviceName: string,
    atTime?: Date,
    statusCode?: number,
    additionalChecks: { messages?: string[] } = {},
  ) => {
    const fromTime = atTime || new Date();
    logTestDescription(
      `Get mask regions for camera '${deviceName}' at time ${fromTime.toISOString()}`,
      {
        camera: deviceName,
        fromTime,
      },
    );

    const params = new URLSearchParams();
    params.append("at-time", fromTime.toISOString());
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`devices/${getCreds(deviceName).id}/mask-regions`, {
          "at-time": fromTime.toISOString(),
        }),
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.messages !== undefined) {
        checkMessages(response, additionalChecks.messages);
      }
      cy.wrap(response);
    });
  },
);

Cypress.Commands.add(
  "apiDeviceDeleteOrSetInactive",
  (userName: string, deviceName: string, groupName: string) => {
    const device = getCreds(deviceName);
    const group = getCreds(groupName);
    makeAuthorizedRequest(
      {
        method: "DELETE",
        url: v1ApiPath(`devices/${device.id}`),
        body: {
          group: group.id,
        },
      },
      userName,
    );
  },
);

export function TestCreateExpectedDevice(
  deviceName: string,
  groupName: string,
  hasDeviceConnected = false,
  type: DeviceType = DeviceType.Thermal,
  admin = true,
  active = true,
  isHealthy = true,
) {
  const expectedDevice: ApiDeviceResponse = {
    id: getCreds(deviceName).id,
    saltId: NOT_NULL,
    deviceName: getTestName(deviceName),
    groupName: getTestName(groupName),
    groupId: getCreds(groupName).id,
    type,
    admin,
    active,
    isHealthy,
  };
  if (hasDeviceConnected == true) {
    expectedDevice.lastConnectionTime = NOT_NULL_STRING;
    if (type === DeviceType.Thermal) {
      expectedDevice.lastThermalRecordingTime = NOT_NULL_STRING;
      expectedDevice.earliestThermalRecordingTime = NOT_NULL_STRING;
    } else if (type === DeviceType.Audio) {
      expectedDevice.lastAudioRecordingTime = NOT_NULL_STRING;
      expectedDevice.earliestAudioRecordingTime = NOT_NULL_STRING;
    } else if (type === DeviceType.Hybrid) {
      expectedDevice.lastThermalRecordingTime = NOT_NULL_STRING;
      expectedDevice.lastAudioRecordingTime = NOT_NULL_STRING;
      expectedDevice.earliestThermalRecordingTime = NOT_NULL_STRING;
      expectedDevice.earliestAudioRecordingTime = NOT_NULL_STRING;
    }
    expectedDevice.location = {
      lat: NOT_NULL,
      lng: NOT_NULL,
    };
  }
  return expectedDevice;
}

export function TestCreateExpectedHistoryEntry(
  deviceName: string,
  groupName: string,
  fromDate: string,
  location: LatLng,
  setBy: DeviceHistorySetBy,
  stationName: string,
): ApiDeviceHistory {
  return {
    DeviceId: getCreds(deviceName).id,
    GroupId: getCreds(groupName).id,
    deviceName: getTestName(deviceName),
    fromDateTime: fromDate,
    location: location,
    saltId: NOT_NULL,
    setBy: setBy,
    stationId: getCreds(stationName).id,
    uuid: NOT_NULL,
    settings: null,
  };
}
