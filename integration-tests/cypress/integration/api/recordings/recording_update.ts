/// <reference path="../../../support/index.d.ts" />

import { ApiRecordingSet } from "@commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";
import { HTTP_Forbidden, HTTP_Unprocessable } from "@commands/constants";

describe("Update recordings", () => {
  //Do not validate IDs
  const EXCLUDE_IDS = [
    ".tracks[].tags[].trackId",
    ".tracks[].tags[].id",
    ".tracks[].id",
    ".location",
  ];

  const templateExpectedRecording: ApiThermalRecordingResponse = {
    deviceId: 0,
    deviceName: "",
    groupName: "",
    tags: [],
    tracks: [],
    id: 892972,
    rawMimeType: "application/x-cptv",
    processingState: RecordingProcessingState.Finished,
    duration: 15.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: { lat: -45.29115, lng: 169.30845 },
    type: RecordingType.ThermalRaw,
    additionalMetadata: { algorithm: 31143, previewSecs: 5, totalFrames: 141 },
    groupId: 246,
    comment: "This is a comment",
    processing: false,
  };

  const templateRecording: ApiRecordingSet = {
    type: RecordingType.ThermalRaw,
    fileHash: null,
    duration: 40,
    recordingDateTime: "2021-01-01T00:00:00.000Z",
    location: [-45.00045, 169.00065],
    additionalMetadata: {
      algorithm: 31144,
      previewSecs: 6,
      totalFrames: 142,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [
        {
          start_s: 1,
          end_s: 3,
          predictions: [
            { confident_tag: "possum", confidence: 0.8, model_id: 1 },
          ],
        },
      ],
    },
    comment: "This is a comment2",
    processingState: RecordingProcessingState.Finished,
  };

  //TODO: Issue 98 - only comments and additional metadata succeed at update
  //location causes server error
  //all others rejected with bad request
  const fieldUpdates = {
    //rawMimeType: "application/test",
    //fileMimeType: "application/test2",
    //duration: 20,
    //recordingDateTime: "2020-01-01T00:00:00.000Z",
    //relativeToDawn: 1000,
    //relativeToDusk: -1000,
    //version: "346",
    //batteryLevel: 87,
    //batteryCharging: "CHARGING",
    //airplaneModeOn: true,
    //type: RecordingType.Audio
    comment: "This is a new comment",
    // add newFields, change algorithm, set previewSecs to null, leave totalFrames unchanged
    additionalMetadata: {
      newField: "newValue",
      newField2: "newValue2",
      algorithm: 99999,
      previewSecs: null,
    },
    location: [-46.29115, 170.30835],
  };

  before(() => {
    //Create group1, admin and 2 devices
    cy.testCreateUserGroupAndDevice("ruGroupAdmin", "ruGroup", "ruCamera1");
    cy.apiDeviceAdd("ruCamera1b", "ruGroup");
    cy.apiUserAdd("ruGroupMember");
    cy.apiGroupUserAdd("ruGroupAdmin", "ruGroupMember", "ruGroup", true);

    //Device1 admin and member
    cy.apiUserAdd("ruDeviceAdmin");
    cy.apiUserAdd("ruDeviceMember");
    cy.apiDeviceUserAdd("ruGroupAdmin", "ruDeviceAdmin", "ruCamera1", true);
    cy.apiDeviceUserAdd("ruGroupAdmin", "ruDeviceMember", "ruCamera1", true);

    //Second group with admin and device
    cy.testCreateUserGroupAndDevice("ruGroup2Admin", "ruGroup2", "ruCamera2");
  });

  it("Group admin can update recording", () => {
    const recording01 = TestCreateRecordingData(templateRecording);
    cy.apiRecordingAdd(
      "ruCamera1",
      recording01,
      "oneframe.cptv",
      "ruRecording01"
    ).then(() => {
      let expectedRecording01 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "ruRecording01",
        "ruCamera1",
        "ruGroup",
        null,
        recording01
      );
      cy.log("Check recording prior to update");
      cy.apiRecordingCheck(
        "ruGroupAdmin",
        "ruRecording01",
        expectedRecording01,
        EXCLUDE_IDS
      ).then(() => {
        cy.log("Update recording");
        cy.apiRecordingUpdate("ruGroupAdmin", "ruRecording01", fieldUpdates);
        expectedRecording01 = updateExpected(expectedRecording01);

        cy.log("Check recording after update");
        cy.apiRecordingCheck(
          "ruGroupAdmin",
          "ruRecording01",
          expectedRecording01,
          EXCLUDE_IDS
        );
      });
    });
  });

  it("Group member can update recording", () => {
    const recording02 = TestCreateRecordingData(templateRecording);
    cy.apiRecordingAdd(
      "ruCamera1",
      recording02,
      "oneframe.cptv",
      "ruRecording02"
    ).then(() => {
      let expectedRecording02 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "ruRecording02",
        "ruCamera1",
        "ruGroup",
        null,
        recording02
      );
      cy.log("Check recording prior to update");
      cy.apiRecordingCheck(
        "ruGroupMember",
        "ruRecording02",
        expectedRecording02,
        EXCLUDE_IDS
      ).then(() => {
        cy.log("Update recording");
        cy.apiRecordingUpdate("ruGroupMember", "ruRecording02", fieldUpdates);
        expectedRecording02 = updateExpected(expectedRecording02);

        cy.log("Check recording after update");
        cy.apiRecordingCheck(
          "ruGroupMember",
          "ruRecording02",
          expectedRecording02,
          EXCLUDE_IDS
        );
      });
    });
  });

  it("Device admin can update recording", () => {
    const recording03 = TestCreateRecordingData(templateRecording);
    cy.apiRecordingAdd(
      "ruCamera1",
      recording03,
      "oneframe.cptv",
      "ruRecording03"
    ).then(() => {
      let expectedRecording03 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "ruRecording03",
        "ruCamera1",
        "ruGroup",
        null,
        recording03
      );
      cy.log("Check recording prior to update");
      cy.apiRecordingCheck(
        "ruDeviceAdmin",
        "ruRecording03",
        expectedRecording03,
        EXCLUDE_IDS
      ).then(() => {
        cy.log("Update recording");
        cy.apiRecordingUpdate("ruDeviceAdmin", "ruRecording03", fieldUpdates);
        expectedRecording03 = updateExpected(expectedRecording03);

        cy.log("Check recording after update");
        cy.apiRecordingCheck(
          "ruDeviceAdmin",
          "ruRecording03",
          expectedRecording03,
          EXCLUDE_IDS
        );
      });
    });
  });

  it("Device member can update recording", () => {
    const recording04 = TestCreateRecordingData(templateRecording);
    cy.apiRecordingAdd(
      "ruCamera1",
      recording04,
      "oneframe.cptv",
      "ruRecording04"
    ).then(() => {
      let expectedRecording04 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "ruRecording04",
        "ruCamera1",
        "ruGroup",
        null,
        recording04
      );
      cy.log("Check recording prior to update");
      cy.apiRecordingCheck(
        "ruDeviceMember",
        "ruRecording04",
        expectedRecording04,
        EXCLUDE_IDS
      ).then(() => {
        cy.log("Update recording");
        cy.apiRecordingUpdate("ruDeviceMember", "ruRecording04", fieldUpdates);
        expectedRecording04 = updateExpected(expectedRecording04);

        cy.log("Check recording after update");
        cy.apiRecordingCheck(
          "ruDeviceMember",
          "ruRecording04",
          expectedRecording04,
          EXCLUDE_IDS
        );
      });
    });
  });

  it("Non member cannot update recording", () => {
    const recording05 = TestCreateRecordingData(templateRecording);
    cy.apiRecordingAdd(
      "ruCamera1",
      recording05,
      "oneframe.cptv",
      "ruRecording05"
    ).then(() => {
      const expectedRecording05 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "ruRecording05",
        "ruCamera1",
        "ruGroup",
        null,
        recording05
      );
      cy.log("Attempt to update recording");
      cy.apiRecordingUpdate(
        "ruGroup2Admin",
        "ruRecording05",
        fieldUpdates,
        HTTP_Forbidden
      );

      cy.log("Check recording not updated");
      cy.apiRecordingCheck(
        "ruDeviceMember",
        "ruRecording05",
        expectedRecording05,
        EXCLUDE_IDS
      );
    });
  });

  it("Can handle no matching recording", () => {
    cy.apiRecordingUpdate(
      "ruGroupAdmin",
      "99999",
      fieldUpdates,
      HTTP_Forbidden,
      { useRawRecordingId: true }
    );
  });

  it("Handles unsupported parameters and values correctly", () => {
    const recording06 = TestCreateRecordingData(templateRecording);
    cy.apiRecordingAdd(
      "ruCamera1",
      recording06,
      "oneframe.cptv",
      "ruRecording06"
    ).then(() => {
      const expectedRecording06 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "ruRecording06",
        "ruCamera1",
        "ruGroup",
        null,
        recording06
      );
      cy.log("Attempt to update invalid field");
      cy.apiRecordingUpdate(
        "ruGroupAdmin",
        "ruRecording06",
        { badField: "hello" },
        HTTP_Unprocessable
      );
      cy.log("Attempt to update field with invalid value");
      cy.apiRecordingUpdate(
        "ruGroupAdmin",
        "ruRecording06",
        { additionalMetadata: "badValue" },
        HTTP_Unprocessable
      );

      cy.log("Check recording not updated");
      cy.apiRecordingCheck(
        "ruDeviceMember",
        "ruRecording06",
        expectedRecording06,
        EXCLUDE_IDS
      );
    });
  });
});

//TODO: Issue 98 - mosty parameters appear unsupported. Commented out - remove from here if we will never support them
function updateExpected(expectedRecording: any) {
  expectedRecording.processingState = RecordingProcessingState.Finished;
  //expectedRecording.processing = false;
  //expectedRecording.rawMimeType= "application/test";
  //expectedRecording.fileMimeType= "application/test2";
  //expectedRecording.duration= 20;
  //expectedRecording.recordingDateTime= "2020-01-01T00:00:00.000Z";
  //expectedRecording.relativeToDawn= 1000;
  //expectedRecording.relativeToDusk= -1000;
  //expectedRecording.version= "346";
  //expectedRecording.batteryLevel= 87;
  //expectedRecording.batteryCharging= "CHARGING";
  //expectedRecording.airplaneModeOn= true;
  //expectedRecording.type= RecordingType.Audio;
  expectedRecording.comment = "This is a new comment";
  expectedRecording.location = {
    lat: -46.29105,
    lng: 170.30835,
  };
  //expectedRecording.additionalMetadata={newField: "newValue", newField2: "newValue2", algorithm: 99999, totalFrames: 141, previewSecs: null};
  //TODO: Issue 99 behaviour here and in fileProcessing inconsistent.  fileProcessing merges additionalMetedata here we replace it
  expectedRecording.additionalMetadata = {
    newField: "newValue",
    newField2: "newValue2",
    algorithm: 99999,
    previewSecs: null,
  };
  return expectedRecording;
}
