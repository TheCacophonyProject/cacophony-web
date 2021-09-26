/// <reference path="../../../support/index.d.ts" />
import {
  // HTTP_Unprocessable,
  HTTP_BadRequest,
  // HTTP_Unprocessable,
  // HTTP_Forbidden,
  HTTP_OK200,
  NOT_NULL,
  superuser,
  suPassword
} from "../../../commands/constants";

import { ApiRecordingNeedsTagReturned, ApiRecordingSet } from "../../../commands/types";

import { getCreds } from "../../../commands/server";

import {
  TestCreateExpectedNeedsTagData,
  TestCreateRecordingData,
} from "../../../commands/api/recording-tests";

const templateExpectedRecording: ApiRecordingNeedsTagReturned = {
  DeviceId: 49,
  RecordingId: 34,
  duration: 40,
  fileSize: 1,
  recordingJWT: NOT_NULL,
  tagJWT: NOT_NULL,
  tracks: []
};

const templateRecording: ApiRecordingSet = {
  type: "thermalRaw",
  fileHash: null,
  duration: 40,
  recordingDateTime: "2021-01-01T00:00:00.000Z",
  location: [-45, 169],
  version: "346",
  batteryCharging: null,
  batteryLevel: null,
  airplaneModeOn: null,
  additionalMetadata: {
    algorithm: 31144,
    previewSecs: 6,
    totalFrames: 142,
  },
  metadata: {
    algorithm: { model_name: "master" },
    tracks: [{ start_s: 1, end_s: 3, confident_tag: "possum", confidence: 0.8 }],
  },
  comment: "This is a comment2",
  processingState: "FINSIHED",
};

let dev_env=false;
let doNotValidate=true;

const recording1 = TestCreateRecordingData(templateRecording);
let expectedRecording1: ApiRecordingNeedsTagReturned;


describe("Recording needs-tag (power-tagger)", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("rntGroupAdmin", "rntGroup", "rntCamera1");
    cy.apiDeviceAdd("rntCamera1b", "rntGroup");
    cy.apiUserAdd("rntNonMember");

    cy.testCreateUserGroupAndDevice("rntGroup2Admin", "rntGroup2", "rntCamera2");

    if (Cypress.env("test_using_default_superuser") == true) {
      dev_env=true;
      doNotValidate=false;
      cy.apiSignInAs(null, null, superuser, suPassword);
    } else {
      doNotValidate=true;
      cy.log("Warning: validating returned returned data presence but not parameter values");
      cy.log("Enable test_using_default_superuser to allow value checks (only on dev)");
    }
  });

  beforeEach(() => {
    if (dev_env==true) {
      cy.testDeleteRecordingsInState(superuser, "thermalRaw", undefined);
      cy.testDeleteRecordingsInState(superuser, "audio", undefined);
    }
  });

  it("Non-member can view a recording", () => { 
    cy.log("Add a recording in group1");
    cy.apiRecordingAdd("rntCamera1", recording1, undefined, "rntRecording1").then(() => {
      expectedRecording1 = TestCreateExpectedNeedsTagData( templateExpectedRecording, "rntRecording1", "rntCamera1", recording1);
      cy.log("Verify non-member can view this recording");
      cy.apiRecordingNeedsTagCheck("rntNonMember",undefined,[expectedRecording1],[],HTTP_OK200,{doNotValidate: doNotValidate});
    });
  });

  it("Does not return recordings not needing tagging", () => {
    cy.log("Add a recording in group1");
      cy.apiRecordingAdd("rntCamera1", recording1, undefined, "rntRecording2").then(() => {
        cy.log("Add a user tag to theis recording");
        cy.testUserTagRecording(getCreds("rntRecording2").id,0,"rntGroupAdmin", "possum").then(() => {

          cy.log("Verify this recording not returned");
          cy.apiRecordingNeedsTagCheck("rntNonMember",undefined,[]);
      });      
    });
  });

  //TODO: Isssue 100 - test fails, returns a recording with all 0's / blanks when no recording available 
  //TODO: apiRecordingNeedsTagCheck has a workaround which needs removing when this is fixed
  if (Cypress.env("test_using_default_superuser") == true) {
    it.skip("Can handle no returned matches", () => {
      cy.log("Verify non-member can view this recording");
      cy.apiRecordingNeedsTagCheck("rntNonMember",undefined,[]);
    }); 
  } else {
    it.skip("Can handle no returned matches", () => {});
  }


  //No sensitive parameters present to validate obfuscation (e.g. location, usernames), so test disabled
  it.skip("Data is obfuscated to hide any sensitive information", () => {});

  //TODO: Issue 101 - returns only specified device, rather than preferring that device
  it.skip("Bias towards supplied deviceId works as expected", () => {
    let expectedRecording3: ApiRecordingNeedsTagReturned;
    let expectedRecording3b: ApiRecordingNeedsTagReturned;
    let expectedRecording4: ApiRecordingNeedsTagReturned;
    cy.log("Add a recording in group1");
    cy.apiRecordingAdd("rntCamera1", recording1, undefined, "rntRecording3").then(() => {
      expectedRecording3 = TestCreateExpectedNeedsTagData( templateExpectedRecording, "rntRecording3", "rntCamera1", recording1);

      cy.apiRecordingAdd("rntCamera1b", recording1, undefined, "rntRecording3b").then(() => {
        expectedRecording3b = TestCreateExpectedNeedsTagData( templateExpectedRecording, "rntRecording3b", "rntCamera1b", recording1);

        cy.apiRecordingAdd("rntCamera2", recording1, undefined, "rntRecording4").then(() => {
        expectedRecording4 = TestCreateExpectedNeedsTagData( templateExpectedRecording, "rntRecording4", "rntCamera2", recording1);

          cy.log("Request recording specifying preferred device, verify preferred is returned");
          cy.apiRecordingNeedsTagCheck("rntNonMember","rntCamera1b", [expectedRecording3b],[],HTTP_OK200,{doNotValidate: doNotValidate});

          cy.log("Tag preferred recording");
          cy.testUserTagRecording(getCreds("rntRecording3b").id,0,"rntGroupAdmin", "possum").then(() => {

            cy.log("Now check non-preferred device is returned now preferred has no untagged recordings");
            cy.apiRecordingNeedsTagCheck("rntNonMember","rntCamera1b", [expectedRecording3, expectedRecording4],[],HTTP_OK200,{doNotValidate: doNotValidate});
          });
        });
      });
    });
  
  });

  //TODO: No validation - bad device id just ignored
  it.skip("Invalid parameters handled correctly", () => {
    cy.log("Invalid device");
    cy.apiRecordingNeedsTagCheck("rntNonMember","999999", [],[],HTTP_BadRequest,{useRawDeviceId: true});
  });

});

