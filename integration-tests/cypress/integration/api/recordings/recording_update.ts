/// <reference path="../../../support/index.d.ts" />
import {
  // HTTP_Unprocessable,
  // HTTP_BadRequest,
  // HTTP_Unprocessable,
  // HTTP_Forbidden,
  // HTTP_OK200,
  NOT_NULL
} from "../../../commands/constants";

import { ApiRecordingReturned, ApiRecordingSet } from "../../../commands/types";

import { getCreds } from "../../../commands/server";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "../../../commands/api/recording-tests";

const templateExpectedRecording: ApiRecordingReturned = {
  id: 892972,
  rawMimeType: "application/x-cptv",
  fileMimeType: null,
  processingState: "FINISHED",
  duration: 15.6666666666667,
  recordingDateTime: "2021-07-17T20:13:17.248Z",
  relativeToDawn: null,
  relativeToDusk: null,
  location: { type: "Point", coordinates: [-45.29115, 169.30845] },
  version: "345",
  batteryLevel: null,
  batteryCharging: null,
  airplaneModeOn: null,
  type: "thermalRaw",
  additionalMetadata: { algorithm: 31143, previewSecs: 5, totalFrames: 141 },
  GroupId: 246,
  StationId: 25,
  comment: "This is a comment",
  processing: null,
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

const recording1 = TestCreateRecordingData(templateRecording);
let expectedRecording1: ApiRecordingReturned;

describe("Update recordings", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("ruGroupAdmin", "ruGroup", "ruCamera1");
    cy.apiDeviceAdd("ruCamera1b", "ruGroup");
    cy.apiUserAdd("ruGroupMember");
    cy.apiUserAdd("ruDeviceAdmin");
    cy.apiUserAdd("ruDeviceMember");
    cy.apiGroupUserAdd("ruGroupAdmin", "ruGroupMember", "ruGroup", true);
    cy.apiDeviceUserAdd("ruGroupAdmin", "ruDeviceAdmin", "ruCamera1", true);
    cy.apiDeviceUserAdd("ruGroupAdmin", "ruDeviceMember", "ruCamera1", true);

    cy.testCreateUserGroupAndDevice("ruGroup2Admin", "ruGroup2", "ruCamera2");

  });

  it.skip("Group admin can update recording", () => {});

  it.skip("Group member can update recording", () => {});
  
  it.skip("Device admin can update recording", () => {});
    
  it.skip("Device member can update recording", () => {});
  
  it.skip("Non member cannot update recording", () => {});
    
  it.skip("Can handle no matching recording", () => {});

  it.skip("Can update all supported parameters", () => {});

  it.skip("Candles unsupported parameters and values correctly", () => {});


});

