/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_BadRequest,
  // HTTP_Unprocessable,
  HTTP_Forbidden,
  HTTP_OK200,
  NOT_NULL,
} from "../../../commands/constants";

import {
  ApiRecordingReturned,
  ApiRecordingSet,
  ApiRecordingForProcessing,
} from "../../../commands/types";

import { getCreds } from "../../../commands/server";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
  TestCreateExpectedProcessingData,
} from "../../../commands/api/recording-tests";

describe("Recording thumbnails", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];

  //Do not validate IDs
  //TODO: Issue 81 - enable checking of location once location inaccuracy issue is fixed
  const EXCLUDE_IDS = [
    ".Tracks[].TrackTags[].TrackId",
    ".Tracks[].id",
    ".location.coordinates",
  ];
  
  const templateExpectedRecording: ApiRecordingReturned = {
    id: 892972,
    rawMimeType: "application/x-cptv",
    fileMimeType: null,
    processingState: "FINISHED",
    duration: 15.6666666666667,
    recordingDateTime: "0121-07-17T01:13:17.248Z",
    relativeToDawn: null,
    relativeToDusk: null,
    location: { type: "Point", coordinates: [-45, 169] },
    version: "345",
    batteryLevel: null,
    batteryCharging: null,
    airplaneModeOn: null,
    type: "thermalRaw",
    additionalMetadata: { algorithm: 31144, previewSecs: 6, totalFrames: 142 },
    GroupId: 246,
    StationId: 25,
    comment: "This is a comment",
    processing: false,
  };
  
  const templateRecording: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 40,
    recordingDateTime: "0121-01-01T00:00:00.000Z",
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
      tracks: [],
    },
    comment: "This is a comment2",
    processingState: "analyse",
  };
  
  const templateExpectedProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: "thermalRaw",
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "raw/2021/09/07/4d08a991-27e8-49c0-8c5a-fcf1031a42b8",
    rawMimeType: "application/x-cptv",
    fileKey: null,
    fileMimeType: null,
    processingState: "analyse",
    processingMeta: null,
    GroupId: 66,
    DeviceId: 99,
    StationId: null,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    duration: 15.6666666666667,
    location: { type: "Point", coordinates: [-45, 169] },
    hasAlert: false,
    processingStartTime: NOT_NULL,
    processingEndTime: null,
    processing: true,
    updatedAt: NOT_NULL,
  };
 
  //TODO: These tests will not currently work unless we have SU access as we need to be able to delete any
  //recordings that are in analyse state that do not belong to us.  This can be removed once
  //the analyse.test state has been implemented.  All analyse states in this test suite 
  //can then be changed to analyse.test
  if (Cypress.env("running_in_a_dev_environment") == true) {

    before(() => {
      //Create group1 with 2 devices, admin and member
      cy.testCreateUserGroupAndDevice("rtGroupAdmin", "rtGroup", "rtCamera1");
      cy.apiDeviceAdd("rtCamera1b", "rtGroup");
      cy.apiUserAdd("rtGroupMember");
      cy.apiGroupUserAdd("rtGroupAdmin", "rtGroupMember", "rtGroup", true);
  
      //Device1 admin and member
      cy.apiUserAdd("rtDeviceAdmin");
      cy.apiUserAdd("rtDeviceMember");
      cy.apiDeviceUserAdd("rtGroupAdmin", "rtDeviceAdmin", "rtCamera1", true);
      cy.apiDeviceUserAdd("rtGroupAdmin", "rtDeviceMember", "rtCamera1", true);
  
      //Second group with admin and member
      cy.testCreateUserGroupAndDevice("rtGroup2Admin", "rtGroup2", "rtCamera2");
  
      cy.apiSignInAs(null, null, superuser, suPassword);
    });
  
    beforeEach(() => {
      cy.testDeleteRecordingsInState(superuser, "thermalRaw", "analyse");
      cy.testDeleteRecordingsInState(superuser, "audio", "analyse");
    });
  
    it("Thumbnail generated as expected", () => {
      const recording01 = TestCreateRecordingData(templateRecording);
      cy.apiRecordingAdd(
        "rtCamera1",
        recording01,
        "oneframe.cptv",
        "rtRecording01"
      ).then(() => {
        const expectedProcessing01 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rtRecording01",
          "rtCamera1",
          "rtGroup",
          null,
          recording01
        );
        const expectedRecording01 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rtRecording01",
          "rtCamera1",
          "rtGroup",
          null,
          recording01
        );
  
        cy.log("Send for processing");
        cy.processingApiCheck(
          "thermalRaw",
          "analyse",
          "rtRecording01",
          expectedProcessing01,
          EXCLUDE_KEYS
        );
  
        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rtTrack01",
              "rtRecording01",
              { start_s: 1, end_s: 4 },
              algorithmId
            );
            cy.log("Add tags");
            cy.processingApiTracksTagsPost(
              "rtTrack01",
              "rtRecording01",
              "possum",
              0.9,
              { name: "master" }
            ).then(() => {
              expectedRecording01.Tracks = [
                {
                  TrackTags: [
                    {
                      what: "possum",
                      automatic: true,
                      TrackId: getCreds("rtTrack01").id,
                      confidence: 0.9,
                      UserId: null,
                      data: "master",
                      User: null,
                    },
                  ],
                  data: { start_s: 1, end_s: 4 },
                  id: 1,
                },
              ];
  
              cy.log("set processing to done and recheck tracks");
              cy.processingApiPut(
                "rtRecording01",
                true,
                {
                  fieldUpdates: {
                    additionalMetadata: {
                      thumbnail_region: {
                        x: 5,
                        y: 46,
                        mass: 682,
                        blank: false,
                        width: 39,
                        height: 32,
                        frame_number: 57,
                        pixel_variance: 0,
                      },
                    },
                  },
                },
                true,
                undefined
              );
  
              cy.log("Check thumbnail data present");
              expectedRecording01.additionalMetadata["thumbnail_region"] = {
                x: 5,
                y: 46,
                mass: 682,
                blank: false,
                width: 39,
                height: 32,
                frame_number: 57,
                pixel_variance: 0,
              };
              cy.apiRecordingCheck(
                "rtGroupAdmin",
                "rtRecording01",
                expectedRecording01,
                EXCLUDE_IDS
              );
  
              cy.log("Check thumbnail available");
              cy.apiRecordingThumbnailCheck(
                "rtGroupAdmin",
                "rtRecording01",
                HTTP_OK200,
                { type: "PNG" }
              );
            });
          }
        );
      });
    });
  
    //The remaining tests depend on test 1. Bad practice - but hard to avoid. Sorry!
    it("Group member can query device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtGroupMember",
        "rtRecording01",
        HTTP_OK200,
        { type: "PNG" }
      );
    });
  
    it("Device admin can query device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtDeviceAdmin",
        "rtRecording01",
        HTTP_OK200,
        { type: "PNG" }
      );
    });
  
    it("Device member can query device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtDeviceMember",
        "rtRecording01",
        HTTP_OK200,
        { type: "PNG" }
      );
    });
  
    //TODO: FAIL - Issue 97 - anyone can retrieve a thumbnail
    it.skip("Non member cannot view device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtGroup2Admin",
        "rtRecording01",
        HTTP_Forbidden
      );
    });
  
    it("Can handle no returned matches", () => {
      cy.apiRecordingThumbnailCheck("rtGroup2Admin", "999999", HTTP_BadRequest, {
        useRawRecordingId: true,
        message: "Failed to get recording.",
      });
    });
  
    it("Thumbnail generator can handle recording with no thumbnail data", () => {
      const recording02 = TestCreateRecordingData(templateRecording);
      cy.apiRecordingAdd(
        "rtCamera1",
        recording02,
        "oneframe.cptv",
        "rtRecording02"
      ).then(() => {
        const expectedProcessing02 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rtRecording02",
          "rtCamera1",
          "rtGroup",
          null,
          recording02
        );
        const expectedRecording02 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rtRecording02",
          "rtCamera1",
          "rtGroup",
          null,
          recording02
        );
  
        cy.log("Send for processing");
        cy.processingApiCheck(
          "thermalRaw",
          "analyse",
          "rtRecording02",
          expectedProcessing02,
          EXCLUDE_KEYS
        );
  
        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rtTrack02",
              "rtRecording02",
              { start_s: 1, end_s: 4 },
              algorithmId
            );
            cy.log("Add tags");
            cy.processingApiTracksTagsPost(
              "rtTrack02",
              "rtRecording02",
              "possum",
              0.9,
              { name: "master" }
            ).then(() => {
              expectedRecording02.Tracks = [
                {
                  TrackTags: [
                    {
                      what: "possum",
                      automatic: true,
                      TrackId: getCreds("rtTrack02").id,
                      confidence: 0.9,
                      UserId: null,
                      data: "master",
                      User: null,
                    },
                  ],
                  data: { start_s: 1, end_s: 4 },
                  id: 1,
                },
              ];
  
              cy.log("set processing to done and recheck tracks");
              cy.processingApiPut("rtRecording02", true, {}, true, undefined);
  
              cy.log("Check no thumbnail data present");
              cy.apiRecordingCheck(
                "rtGroupAdmin",
                "rtRecording02",
                expectedRecording02,
                EXCLUDE_IDS
              );
  
              cy.log("Check thumbnail not available");
              cy.apiRecordingThumbnailCheck(
                "rtGroupAdmin",
                "rtRecording02",
                HTTP_BadRequest,
                { message: "No thumbnail exists" }
              );
            });
          }
        );
      });
    });
  } else {
     it.skip("NOTE: Thumbnail generation tests skipped superuser diabled in environment variables", () => {});
  }
});
