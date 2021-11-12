/// <reference path="../../../support/index.d.ts" />

import { ApiRecordingSet, ApiRecordingForProcessing } from "@commands/types";

import {
  TestCreateExpectedProcessingData,
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { getCreds } from "@commands/server";
import {
  HTTP_BadRequest,
  HTTP_Forbidden,
  HTTP_OK200,
  NOT_NULL,
} from "@commands/constants";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

describe("Recording thumbnails", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];

  //Do not validate IDs
  const EXCLUDE_IDS = [
    ".tracks[].tags[].trackId",
    ".tracks[].tags[].id",
    ".tracks[].id",
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
    recordingDateTime: "0121-07-17T01:13:17.248Z",
    location: { lat: -45, lng: 169 },
    type: RecordingType.ThermalRaw,
    additionalMetadata: { algorithm: 31144, previewSecs: 6, totalFrames: 142 },
    groupId: 246,
    comment: "This is a comment",
    processing: false,
  };

  const templateRecording: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 40,
    recordingDateTime: "0121-01-01T00:00:00.000Z",
    location: [-45, 169],
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
    type: RecordingType.ThermalRaw,
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawMimeType: "application/x-cptv",
    fileKey: null,
    fileMimeType: null,
    processingState: "analyse",
    processingMeta: null,
    GroupId: NOT_NULL,
    DeviceId: NOT_NULL,
    StationId: null,
    recordingDateTime: "2021-01-01T01:01:01.018Z",
    duration: 16.6666666666667,
    location: null,
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
              expectedRecording01.tracks = [
                {
                  tags: [
                    {
                      what: "possum",
                      automatic: true,
                      trackId: getCreds("rtTrack01").id,
                      confidence: 0.9,
                      data: { name: "master" },
                      id: -1,
                    },
                  ],
                  start: 1,
                  end: 4,
                  id: 1,
                  positions: [],
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
    // NOTE - This is by design so that thumbnails can be embedded in emails.
    //  We consider thumbnails to be okay to leak, but can revisit this decision if needed.
    it.skip("Non member cannot view device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtGroup2Admin",
        "rtRecording01",
        HTTP_Forbidden
      );
    });

    it("Can handle no returned matches", () => {
      cy.apiRecordingThumbnailCheck("rtGroup2Admin", "999999", HTTP_Forbidden, {
        useRawRecordingId: true,
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
              expectedRecording02.tracks = [
                {
                  tags: [
                    {
                      what: "possum",
                      automatic: true,
                      trackId: getCreds("rtTrack02").id,
                      confidence: 0.9,
                      data: { name: "master" },
                      id: -1,
                    },
                  ],
                  start: 1,
                  end: 4,
                  id: 1,
                  positions: [],
                },
              ];

              cy.log("set processing to done and recheck tracks");
              cy.processingApiPut("rtRecording02", true, {}, undefined);

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
