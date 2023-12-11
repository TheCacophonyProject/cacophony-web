/// <reference path="../../../support/index.d.ts" />
import { getTestName } from "@commands/names";
import { makeAuthorizedRequest, v1ApiPath, getCreds } from "@commands/server";
import { TestGetLocation } from "@commands/api/station";
import { TestCreateExpectedHistoryEntry } from "@commands/api/device";
import ApiDeviceResponse = Cypress.ApiDeviceResponse;
import { DeviceType } from "@typedefs/api/consts";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { DeviceHistoryEntry, TestNameAndId } from "@commands/types";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";


const templateExpectedCypressRecording: ApiThermalRecordingResponse =
  JSON.parse(JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE));

const templateExpectedStation = {
  location,
  name: NOT_NULL_STRING,
  id: NOT_NULL,
  lastThermalRecordingTime: NOT_NULL_STRING,
  createdAt: NOT_NULL_STRING,
  updatedAt: NOT_NULL_STRING,
  activeAt: NOT_NULL_STRING,
  automatic: true,
  needsRename: true,
  groupId: NOT_NULL,
  groupName: NOT_NULL_STRING,
};

describe("Devices list", () => {
  const superuser = getCreds("superuser")["email"];
  const suPassword = getCreds("superuser")["password"];

  const groupAdmin = "Edith-groupAdmin";
  const groupMember = "Edwin-groupMember";
  const hacker = "E-Hacker";
  const group = "Edith-Team";
  const group2 = "Second-E-Team";
  const group3 = "Charlie-Team";
  const camera = "E-camera1";
  const NOT_ADMIN = false;
  const user2 = "Bridget";
  const user3 = "Charlie";
  const camera2 = "second_E_camera";
  const camera3 = "Charlie-camera";
  const camera4 = "Debbie-camera";
  const Josie = "Josie_recordings_stations";
  const group4 = "recordings_stations";
  const group5= "recordings_stations-2";



  let expectedDeviceAdminView: ApiDeviceResponse;
  let expectedDeviceMemberView: ApiDeviceResponse;
  let expectedDevice2AdminView: ApiDeviceResponse;
  let expectedDevice3AdminView: ApiDeviceResponse;
  let expectedDevice4AdminView: ApiDeviceResponse;

  before(() => {
    cy.apiUserAdd(groupMember);
    cy.apiUserAdd(hacker);
    cy.testCreateUserGroupAndDevice(groupAdmin, group, camera).then(() => {
      expectedDeviceAdminView = {
        id: getCreds(camera).id,
        saltId: getCreds(camera).id,
        deviceName: getTestName(camera),
        groupName: getTestName(group),
        groupId: getCreds(group).id,
        active: true,
        admin: true,
        type: DeviceType.Unknown,
      };
      expectedDeviceMemberView = {
        id: getCreds(camera).id,
        deviceName: getTestName(camera),
        active: true,
        groupName: getTestName(group),
        groupId: getCreds(group).id,
        admin: false,
        saltId: getCreds(camera).id,
        type: DeviceType.Unknown,
      };
    });

    cy.testCreateUserAndGroup(Josie, group4).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group4).id;
      templateExpectedCypressRecording.groupName = getTestName(group4);
      templateExpectedStation.groupId = getCreds(group4).id;
      templateExpectedStation.groupName = getTestName(group4);
    });
    cy.apiGroupAdd(Josie, group5);

    cy.apiGroupUserAdd(groupAdmin, groupMember, group, NOT_ADMIN);

    //second group
    cy.testCreateUserGroupAndDevice(user2, group2, camera2).then(() => {
      expectedDevice2AdminView = {
        id: getCreds(camera2).id,
        saltId: getCreds(camera2).id,
        deviceName: getTestName(camera2),
        groupId: getCreds(group2).id,
        groupName: getTestName(group2),
        active: true,
        admin: true,
        type: DeviceType.Unknown,
      };
    });

    //reregistered device
    cy.testCreateUserGroupAndDevice(user3, group3, camera3);
    cy.apiDeviceReregister(camera3, camera4, group3).then(() => {
      expectedDevice3AdminView = {
        id: getCreds(camera3).id,
        saltId: getCreds(camera3).id,
        deviceName: getTestName(camera3),
        groupName: getTestName(group3),
        groupId: getCreds(group3).id,
        active: false,
        admin: true,
        type: DeviceType.Unknown,
      };
      expectedDevice4AdminView = {
        id: getCreds(camera4).id,
        saltId: getCreds(camera4).id,
        deviceName: getTestName(camera4),
        active: true,
        admin: true,
        groupName: getTestName(group3),
        groupId: getCreds(group3).id,
        type: DeviceType.Unknown,
      };
    });
  });

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user should see all devices", () => {
      cy.apiSignInAs(null, superuser, suPassword);

      const expectedDevice2AdminView = {
        id: getCreds(camera2).id,
        saltId: getCreds(camera2).id,
        deviceName: getTestName(camera2),
        active: true,
        admin: true,
        groupName: getTestName(group2),
        groupId: getCreds(group2).id,
        type: DeviceType.Unknown,
      };

      cy.apiDevicesCheckContains(superuser, [
        expectedDeviceAdminView,
        expectedDevice2AdminView,
      ]);
    });
  } else {
    it.skip("Super-user should see all devices including User details", () => {});
  }

  //Do not run against a live server as we don't have superuser login
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user 'as user' should see only their devices and users only where they are device admin", () => {
      // note: if this test fails and does not clean up after itself, it will continue to fail until the superuser is removed from the old test devices
      cy.apiSignInAs(null, superuser, suPassword);
      // add superuser to group2
      makeAuthorizedRequest(
        {
          method: "POST",
          url: v1ApiPath("groups/users"),
          body: {
            group: getTestName(group2),
            admin: true,
            email: superuser,
          },
        },
        user2
      );

      cy.apiDevicesCheck(superuser, [expectedDevice2AdminView], {
        "view-mode": "user",
      });

      //remove superuser from group2
      makeAuthorizedRequest(
        {
          method: "DELETE",
          url: v1ApiPath("groups/users"),
          body: {
            group: getTestName(group2),
            email: superuser,
          },
        },
        user2
      );
    });
  } else {
    it.skip("Super-user 'as user' should see only their devices and users only where they are device admin", () => {});
  }

  it("Setting a mask region if the device has a current location", () => {
    const deviceName = "new-device";
    const recordingTime = new Date(
      new Date().setDate(new Date().getDate() + 1)
    );
    const location = TestGetLocation(1);
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];

    expectedStation1.location = location;
    expectedStation1.activeAt = recordingTime.toISOString();
    expectedStation1.lastThermalRecordingTime = recordingTime.toISOString();
    cy.apiDeviceAdd(deviceName, group4).then(() => {
      cy.log("Add a recording and check new station is created");
      cy.testUploadRecording(deviceName, {
        ...location,
        time: recordingTime,
        noTracks: true,
      })
        .thenCheckStationIsNew(Josie)
        .then((station: TestNameAndId) => {
          cy.log("Check station created correctly");
          cy.apiStationCheck(Josie, station.name, expectedStation1);

          cy.log("Check device has a new valid deviceHistory created");
          expectedHistory[0] = TestCreateExpectedHistoryEntry(
            deviceName,
            group4,
            NOT_NULL_STRING,
            null,
            "register",
            null
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group4,
            recordingTime.toISOString(),
            location,
            "automatic",
            station.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
        });
    });
  });


  it("Set, retrieve, and validate a single mask region for the latest device location", () => {
    const id = getCreds(camera2).id;
    let getResponse;
    const testRegions = [
      {
        region: "0",
        points: [
          { x: 0.99, y: 0.66 },
          { x: 0.80, y: 0.83 },
          { x: 0.58, y: 0.18 },
          { x: 0.3, y: 0.1 },
          { x: 0.5, y: 0.7 },
          { x: 0.8, y: 0.4 },
          { x: 0.9, y: 0.3 },
          { x: 0.1, y: 0.02 },
          { x: 0.12, y: 0.3}
        ]
      },
    ];
    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath(`devices/${id}/mask-regions`, id),
        body: {
          "maskRegions": [
            testRegions
          ]
        },
      },
      user2
      );

      makeAuthorizedRequest(
        {
          method: "GET",
          url: v1ApiPath(`devices/${id}/mask-regions`, id),
        },
        user2
      ).then((response) => {
        getResponse = response.body.maskRegions;
        const postRegionPoints = testRegions;
        const getRegionPoints = getResponse[0];
        expect(postRegionPoints).to.deep.equal(getRegionPoints);
      });
  });

  it("Set, retrieve, and validate multiple mask regions for the latest device location", () => {
    const id = getCreds(camera2).id;
    let getResponse;
    const testRegions = [
      {
        region: "0",
        points: [
          { x: 0.99, y: 0.66 },
          { x: 0.80, y: 0.83 },
          { x: 0.58, y: 0.18 }
        ]
      },
      {
        region: "1", 
        points: [
          { x: 0.3, y: 0.1 },
          { x: 0.5, y: 0.7 },
          { x: 0.8, y: 0.4 }
        ]
      },
      {
        region: "2",
        points: [
          { x: 0.9, y: 0.3 },
          { x: 0.1, y: 0.02 },
          { x: 0.12, y: 0.3}
        ]
      }
    ];
    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath(`devices/${id}/mask-regions`, id),
        body: {
          "maskRegions": [
            testRegions
          ]
        },
      },
      user2
      );

      makeAuthorizedRequest(
        {
          method: "GET",
          url: v1ApiPath(`devices/${id}/mask-regions`, id),
        },
        user2
      ).then((response) => {
        getResponse = response.body.maskRegions;
        const postRegionPoints = testRegions;
        const getRegionPoints = getResponse[0];
        expect(postRegionPoints).to.deep.equal(getRegionPoints);
      });
  });

  it("Group admin should see everything, and be listed as admin", () => {
    cy.apiDevicesCheck(groupAdmin, [expectedDeviceAdminView]);
  });

  it("Group member should be able to see everything, but should be not listed as admin", () => {
    cy.apiDevicesCheck(groupMember, [expectedDeviceMemberView]);
  });

  it("Non member should not have any access to any devices", () => {
    cy.apiDevicesCheck(hacker, []);
  });

  it("Should display inactive devices only when requested", () => {
    //verify inactive device is not shown by default
    cy.apiDevicesCheck(user3, [expectedDevice4AdminView]);

    //verify inactive device is shown when inactive is requested
    cy.apiDevicesCheck(
      user3,
      [expectedDevice3AdminView, expectedDevice4AdminView],
      { onlyActive: false }
    );
  });
});
