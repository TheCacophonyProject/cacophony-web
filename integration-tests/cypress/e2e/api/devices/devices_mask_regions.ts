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

  before(() => {
    cy.testCreateUserAndGroup(user1, group1).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group1).id;
      templateExpectedCypressRecording.groupName = getTestName(group1);
      templateExpectedStation.groupId = getCreds(group1).id;
      templateExpectedStation.groupName = getTestName(group1);
    });
  });

  it.only("Set a device location, then add and retrieve a mask region on that device", () => {
    const recordingTime = new Date(
      new Date().setDate(new Date().getDate() + 1)
    );
    const location = TestGetLocation(1);
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    let id; 
    expectedStation1.location = location;
    expectedStation1.activeAt = recordingTime.toISOString();
    expectedStation1.lastThermalRecordingTime = recordingTime.toISOString();
    cy.apiDeviceAdd(camera1, group1).then((deviceID) => {
      id = deviceID; 
      cy.log("Here's the ID: ", id);
      cy.log("Add a recording and check new station is created");
      cy.testUploadRecording(camera1, {
        ...location,
        time: recordingTime,
        noTracks: true,
      })
        .thenCheckStationIsNew(user1)
        .then((station: TestNameAndId) => {
          cy.log("Check station created correctly");
          cy.apiStationCheck(user1, station.name, expectedStation1);
          cy.log("ID is: ", id);
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
              url: v1ApiPath(`devices/${id}/mask-regions`),
              body: {
                "maskRegions": [
                  testRegions
                ]
              },
            },
            user1
            );

            const params = new URLSearchParams();
            params.append("at-time", recordingTime.toISOString());
            makeAuthorizedRequest(
              {
                method: "GET",
                url: v1ApiPath(`devices/${id}/mask-regions`, id),
              },
              user1
            ).then((response) => {
              // getResponse = response.body.maskRegions;
              // const postRegionPoints = testRegions;
              // cy.log("Post: ", postRegionPoints);
              // const getRegionPoints = getResponse[0];
              // cy.log("Get: ", getRegionPoints);
              // expect(postRegionPoints).to.deep.equal(getRegionPoints);
            });
        });
    });
  });

  it("Set, retrieve, and validate a single mask region for the latest device location", () => {
    const id = getCreds(camera1).id;
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

    // cy.log("Id is: ", id);
    // makeAuthorizedRequest(
    //   {
    //     method: "POST",
    //     url: v1ApiPath(`devices/${id}/mask-regions`, id),
    //     body: {
    //       "maskRegions": [
    //         testRegions
    //       ]
    //     },
    //   },
    //   user2
    // );

    // makeAuthorizedRequest(
    //   {
    //     method: "GET",
    //     url: v1ApiPath(`devices/${id}/mask-regions`, id),
    //   },
    //   user2
    // ).then((response) => {
    //   getResponse = response.body.maskRegions;
    //   const postRegionPoints = testRegions;
    //   const getRegionPoints = getResponse[0];
    //   expect(postRegionPoints).to.deep.equal(getRegionPoints);
    // });
  });

  // it("Set, retrieve, and validate a single mask region for the latest device location", () => {
  //   const id = getCreds(camera2).id;
  //   let getResponse;
  //   const testRegions = [
  //     {
  //       region: "0",
  //       points: [
  //         { x: 0.99, y: 0.66 },
  //         { x: 0.80, y: 0.83 },
  //         { x: 0.58, y: 0.18 },
  //         { x: 0.3, y: 0.1 },
  //         { x: 0.5, y: 0.7 },
  //         { x: 0.8, y: 0.4 },
  //         { x: 0.9, y: 0.3 },
  //         { x: 0.1, y: 0.02 },
  //         { x: 0.12, y: 0.3}
  //       ]
  //     },
  //   ];
  //   makeAuthorizedRequest(
  //     {
  //       method: "POST",
  //       url: v1ApiPath(`devices/${id}/mask-regions`, id),
  //       body: {
  //         "maskRegions": [
  //           testRegions
  //         ]
  //       },
  //     },
  //     user2
  //     );

  //     makeAuthorizedRequest(
  //       {
  //         method: "GET",
  //         url: v1ApiPath(`devices/${id}/mask-regions`, id),
  //       },
  //       user2
  //     ).then((response) => {
  //       getResponse = response.body.maskRegions;
  //       const postRegionPoints = testRegions;
  //       const getRegionPoints = getResponse[0];
  //       expect(postRegionPoints).to.deep.equal(getRegionPoints);
  //     });
  // });

  it("Set, retrieve, and validate multiple mask regions for the latest device location", () => {
    const id = getCreds(camera1).id;
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
      user1
      );

      makeAuthorizedRequest(
        {
          method: "GET",
          url: v1ApiPath(`devices/${id}/mask-regions`, id),
        },
        user1
      ).then((response) => {
        getResponse = response.body.maskRegions;
        const postRegionPoints = testRegions;
        const getRegionPoints = getResponse[0];
        expect(postRegionPoints).to.deep.equal(getRegionPoints);
      });
  });
});
