/// <reference path="../../../support/index.d.ts" />
import {
  // HTTP_Unprocessable,
  // HTTP_BadRequest,
  // HTTP_Unprocessable,
  // HTTP_Forbidden,
  // HTTP_OK200,
  NOT_NULL,
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
    tracks: [
      { start_s: 1, end_s: 3, confident_tag: "possum", confidence: 0.8 },
    ],
  },
  comment: "This is a comment2",
  processingState: "FINSIHED",
};

const recording1 = TestCreateRecordingData(templateRecording);
let expectedRecording1: ApiRecordingReturned;

describe("Recording thumbnails", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("rtGroupAdmin", "rtGroup", "rtCamera1");
    cy.apiDeviceAdd("rtCamera1b", "rtGroup");
    cy.apiUserAdd("rtGroupMember");
    cy.apiUserAdd("rtDeviceAdmin");
    cy.apiUserAdd("rtDeviceMember");
    cy.apiGroupUserAdd("rtGroupAdmin", "rtGroupMember", "rtGroup", true);
    cy.apiDeviceUserAdd("rtGroupAdmin", "rtDeviceAdmin", "rtCamera1", true);
    cy.apiDeviceUserAdd("rtGroupAdmin", "rtDeviceMember", "rtCamera1", true);

    cy.testCreateUserGroupAndDevice("rtGroup2Admin", "rtGroup2", "rtCamera2");
  });

  it.skip("Thumbnail generated as expected", () => {
    cy.apiRecordingAdd("rtCamera1", recording1, undefined, "rtRecording1").then(
      () => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rtRecording1",
          "rtCamera1",
          "rtGroup",
          null,
          recording1
        );
      }
    );

    //Pick up for tracking /api/fileProcessing

    //Tracking done (with thumbnail location)

    //Check thumbnail data in recording
    //TODO: Write apiRecordingThumbnailGet wrapper

    //Get thumbnail
  });

  it.skip("Group admin can view device's thumbnail", () => {});

  it.skip("Group member can query device's thumbnail", () => {});

  it.skip("Device admin can query device's thumbnail", () => {});

  it.skip("Device member can query device's thumbnail", () => {});

  it.skip("Non member cannot view devices thumbnail", () => {});

  it.skip("Can handle no returned matches", () => {});

  it.skip("Thumbnail generator can handle recording with no thumbnail data", () => {});

  it.skip("Get thumbnail can handle recording with no thumbnail file", () => {});
});
