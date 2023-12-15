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
  const user1 = 'Josie';
  const group1 = "Josie-Team";
  const camera1 = "Josie-camera";
  const user2 = 'Sam';
  const group2 = "Sam-Team";
  const camera2 = "Sam-camera";
  const user3 = 'Caitlin';
  const group3 = "Caitlin-Team";
  const camera3 = "Caitlin-camera";
  let id;
  let id3;
  let recordingTime;
  let mostRecentTime;
  const singleTestRegion = [
    {
      region: "0",
      points: [
        { x: 0.99, y: 0.66 },
        { x: 0.80, y: 0.83 },
        { x: 0.58, y: 0.18 },
        { x: 0.32, y: 0.14 },
        { x: 0.56, y: 0.71 },
      ]
    },
  ];

  const multipleTestRegions = [
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

  before(() => {
    cy.testCreateUserAndGroup(user1, group1).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group1).id;
      templateExpectedCypressRecording.groupName = getTestName(group1);
      templateExpectedStation.groupId = getCreds(group1).id;
      templateExpectedStation.groupName = getTestName(group1);
    });

    recordingTime = new Date(
      new Date().setDate(new Date().getDate() + 1)
    );

    cy.apiDeviceAdd(camera1, group1).then((deviceID) => {
      let location = TestGetLocation(1);
      id = deviceID; 
      cy.testUploadRecording(camera1, {
        ...location,
        time: recordingTime,
        noTracks: true,
      }).then(() => {
        recordingTime = new Date(
          new Date().setDate(new Date().getDate() + 2)
        );

        location = TestGetLocation(2);
        cy.testUploadRecording(camera1, {
          ...location,
          time: recordingTime,
          noTracks: true,
        });
      });
      id = deviceID;
    });
  });

  it("Set, retrieve, and validate a single mask region for the latest device location", () => {
    let getResponse;
    mostRecentTime = new Date(
      new Date().setDate(new Date().getDate() + 5)
    );
    cy.log("Time: ", mostRecentTime.toISOString().toString());
    
    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath(`devices/${id}/mask-regions`),
        body: {
          "maskRegions": [
            singleTestRegion
          ]
        },
      },
      user1
    );
    
    const params = new URLSearchParams();
    params.append("at-time", mostRecentTime.toISOString().toString());

    const queryString = params.toString();
    const apiUrl = v1ApiPath(`devices/${id}/mask-regions`);

    makeAuthorizedRequest(
      {
        method: "GET",
        url: `${apiUrl}?${queryString}`,
      },
      user1
    ).then((response) => {
      getResponse = response.body;
      const postRegionPoints = singleTestRegion;
      cy.log("Post: ", postRegionPoints);
      const getRegionPoints = getResponse[0];
      cy.log("Get: ", getRegionPoints);
      expect(postRegionPoints).to.deep.equal(getRegionPoints);
    });
  });

  it("Set, retrieve, and validate multiple mask regions for the latest device location", () => {
    let getResponse;
    mostRecentTime = new Date(
      new Date().setDate(new Date().getDate() + 5)
    );
    cy.log("Time: ", mostRecentTime.toISOString().toString());
    
    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath(`devices/${id}/mask-regions`),
        body: {
          "maskRegions": [
            multipleTestRegions
          ]
        },
      },
      user1
    );
    
    const params = new URLSearchParams();
    params.append("at-time", mostRecentTime.toISOString().toString());

    const queryString = params.toString();
    const apiUrl = v1ApiPath(`devices/${id}/mask-regions`);

    makeAuthorizedRequest(
      {
        method: "GET",
        url: `${apiUrl}?${queryString}`,
      },
      user1
    ).then((response) => {
      getResponse = response.body;
      const postRegionPoints = multipleTestRegions;
      cy.log("Post: ", postRegionPoints);
      const getRegionPoints = getResponse[0];
      cy.log("Get: ", getRegionPoints);
      expect(postRegionPoints).to.deep.equal(getRegionPoints);
    });
    });

  it("Retrieve a mask region for a historical device location", () => {
    cy.log("Time: ", recordingTime.toISOString().toString());
    
    const params = new URLSearchParams();
    params.append("at-time", recordingTime.toISOString().toString());

    const queryString = params.toString();
    const apiUrl = v1ApiPath(`devices/${id}/mask-regions`);

    makeAuthorizedRequest(
      {
        method: "GET",
        url: `${apiUrl}?${queryString}`,
      },
      user1
    ).then((response) => {
      expect(response.status).to.equal(200);
    });
  });

  it("Attempt to set a single mask region for a device that has no location", () => {
    //create a deviceHistory entry with no location
    cy.testCreateUserAndGroup(user2, group2).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group2).id;
      templateExpectedCypressRecording.groupName = getTestName(group2);
      templateExpectedStation.groupId = getCreds(group2).id;
      templateExpectedStation.groupName = getTestName(group2);
    });

    cy.apiDeviceAdd(camera2, group2).then((deviceID) => {
      mostRecentTime = new Date(
        new Date().setDate(new Date().getDate() + 5)
      );
      makeAuthorizedRequest(
        {
          method: "POST",
          url: v1ApiPath(`devices/${deviceID}/mask-regions`, deviceID),
          body: {
            "maskRegions": [
              singleTestRegion
            ]
          },
          failOnStatusCode: false
        },
        user2
      ).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.messages[0]).to.equal(
          "No device history settings entry found to add mask regions"
        );
      });
    });
  });

  it("Check setting a mask region preserves other existing settings in DeviceSettings", () => {

    cy.testCreateUserAndGroup(user3, group3).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group3).id;
      templateExpectedCypressRecording.groupName = getTestName(group3);
      templateExpectedStation.groupId = getCreds(group3).id;
      templateExpectedStation.groupName = getTestName(group3);
    });

    let currentTime = new Date(
      new Date().setDate(new Date().getDate())
    );

    cy.apiDeviceAdd(camera3, group3).then((deviceID) => {
      const location = TestGetLocation(1);
      id3 = deviceID; 
      cy.testUploadRecording(camera3, {
        ...location,
        time: currentTime,
        noTracks: true,
      });

      id3 = deviceID;
      cy.log("ID3 is: ", id3);
    }).then(() => {
      currentTime = new Date(
        new Date().setDate(new Date().getDate() + 1)
      );
  
      const params = new URLSearchParams();
      params.append("at-time", currentTime.toISOString().toString());
      const queryString = params.toString();
      let apiUrl = v1ApiPath(`devices/${id3}/reference-image`);
  
      makeAuthorizedRequest(
        {
          method: "POST",
          url: `${apiUrl}?${queryString}`,
        },
        user3
      );

      makeAuthorizedRequest(
        {
          method: "POST",
          url: v1ApiPath(`devices/${id3}/mask-regions`),
          body: {
            "maskRegions": [
              singleTestRegion
            ]
          },
        },
        user3
      );
      apiUrl = v1ApiPath(`devices/${id3}/settings`);

      makeAuthorizedRequest(
        {
          method: "GET",
          url: `${apiUrl}?${queryString}`,
        },
        user3
      ).then((response) => {
        const maskRegionsExist = response.body.hasOwnProperty('maskRegions');
        const referenceImagePOVExist = response.body.hasOwnProperty('referenceImagePOV');
        const referenceImagePOVFileSizeExist = response.body.hasOwnProperty('referenceImagePOVFileSize');
      
        expect(maskRegionsExist).to.be.true;
        expect(referenceImagePOVExist).to.be.true;
        expect(referenceImagePOVFileSizeExist).to.be.true;
      });
    });
  });
});
