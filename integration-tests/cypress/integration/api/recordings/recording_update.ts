/// <reference path="../../../support/index.d.ts" />

import { ApiRecordingSet } from "@commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState } from "@typedefs/api/consts";
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
  EXCLUDE_IDS,
} from "@commands/constants";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";

describe("Update recordings", () => {
  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );

  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );

  // Allowed update fields defined in
  // jsonSchemas/api/recording/ApiRecordingUpdateRequest.schema.json
  // (location, comment and additionalMetadata)
  const fieldUpdates = {
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
        "ruGroupMember",
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
        "ruGroupMember",
        "ruRecording06",
        expectedRecording06,
        EXCLUDE_IDS
      );
    });
  });
});

function updateExpected(expectedRecording: any) {
  expectedRecording.processingState = RecordingProcessingState.Finished;
  expectedRecording.comment = "This is a new comment";
  expectedRecording.location = {
    lat: -46.29115,
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
