/// <reference path="../../../support/index.d.ts" />

import { ApiRecordingSet, ApiRecordingForProcessing } from "@commands/types";

import {
  TestCreateExpectedProcessingData,
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { getCreds } from "@commands/server";
import { NOT_NULL_STRING, EXCLUDE_IDS } from "@commands/constants";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_PROCESSING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";

describe("Recording thumbnails", () => {
  const superuser = getCreds("superuser")["email"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];

  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );

  // template thermal recording with no tracks - force into Analyse state to do thumbnail generation
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );
  templateRecording.processingState = RecordingProcessingState.Analyse;
  templateRecording.metadata.tracks = [];

  const templateExpectedProcessing: ApiRecordingForProcessing = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_PROCESSING)
  );
  templateExpectedProcessing.processingState = RecordingProcessingState.Analyse;
  templateExpectedProcessing.updatedAt = NOT_NULL_STRING;

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

      //Second group with admin and member
      cy.testCreateUserGroupAndDevice("rtGroup2Admin", "rtGroup2", "rtCamera2");

      cy.apiSignInAs(null, superuser, suPassword);
    });

    beforeEach(() => {
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        RecordingProcessingState.Analyse
      );
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.Audio,
        RecordingProcessingState.Analyse
      );
    });

    it("Thumbnail generated as expected without track thumbnails", () => {
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
          recording01,
          false
        );

        cy.log("Send for processing");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.Analyse,
          "rtRecording01",
          expectedProcessing01,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost(superuser, {
          "tracking-format": 42,
        }).then((algorithmId) => {
          cy.processingApiTracksPost(
            superuser,
            "rtTrack01",
            "rtRecording01",
            { start_s: 1, end_s: 4 },
            algorithmId
          );
          cy.log("Add tags");
          cy.processingApiTracksTagsPost(
            superuser,
            "rtTrack01",
            "rtRecording01",
            "possum",
            0.9,
            { name: "Master" }
          ).then(() => {
            expectedRecording01.tracks = [
              {
                tags: [
                  {
                    what: "possum",
                    path: "all",
                    automatic: true,
                    trackId: getCreds("rtTrack01").id,
                    confidence: 0.9,
                    data: { name: "Master" },
                    id: -1,
                  },
                ],
                start: 1,
                end: 4,
                id: 1,
                //                  positions: [],
                // TODO enable after merge
                filtered: false,
                automatic: true,
              },
            ];

            cy.log("set processing to done and recheck tracks");
            cy.processingApiPut(
              superuser,
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
                      frame_number: 2,
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
              frame_number: 2,
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
              HttpStatusCode.Ok,
              { type: "PNG" }
            );
          });
        });
      });
    });

    it("Thumbnail tracks generated as expected", () => {
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
          recording01,
          false
        );

        cy.log("Send for processing");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.Analyse,
          "rtRecording01",
          expectedProcessing01,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost(superuser, {
          "tracking-format": 42,
        }).then((algorithmId) => {
          cy.processingApiTracksPost(
            superuser,
            "rtTrack01",
            "rtRecording01",
            {
              start_s: 1,
              end_s: 4,
              thumbnail: {
                region: {
                  x: 20,
                  y: 60,
                  mass: 682,
                  blank: false,
                  width: 10,
                  height: 5,
                  frame_number: 1,
                  pixel_variance: 0,
                },
                contours: 1,
                median_diff: 2,
                score: 5,
              },
            },
            algorithmId
          );
          cy.log("Add tags");
          cy.processingApiTracksTagsPost(
            superuser,
            "rtTrack01",
            "rtRecording01",
            "possum",
            0.9,
            { name: "Master" }
          ).then(() => {
            expectedRecording01.tracks = [
              {
                tags: [
                  {
                    what: "possum",
                    path: "all",
                    automatic: true,
                    trackId: getCreds("rtTrack01").id,
                    confidence: 0.9,
                    data: { name: "Master" },
                    id: -1,
                  },
                ],
                start: 1,
                end: 4,
                id: 1,
                //                  positions: [],
                // TODO enable after merge
                filtered: false,
                automatic: true,
              },
            ];

            cy.log("set processing to done and recheck tracks");
            cy.processingApiPut(
              superuser,
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
                      frame_number: 2,
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
              frame_number: 2,
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
              HttpStatusCode.Ok,
              { type: "PNG" }
            );

            cy.log("Check track thumbnail available");
            cy.apiRecordingThumbnailCheck(
              "rtGroupAdmin",
              "rtRecording01",
              HttpStatusCode.Ok,
              { type: "PNG" },
              "rtTrack01"
            );
          });
        });
      });
    });

    //The remaining tests depend on test 1. Bad practice - but hard to avoid. Sorry!
    it("Group member can query device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtGroupMember",
        "rtRecording01",
        HttpStatusCode.Ok,
        { type: "PNG" }
      );
    });

    // NOTE - Anyone can read a thumbnail. This is by design so that thumbnails can be embedded in emails.
    // We consider thumbnails to be okay to leak, but can revisit this decision if needed.
    it.skip("Non member cannot view device's thumbnail", () => {
      cy.apiRecordingThumbnailCheck(
        "rtGroup2Admin",
        "rtRecording01",
        HttpStatusCode.Forbidden
      );
    });

    it("Can handle no returned matches", () => {
      cy.apiRecordingThumbnailCheck(
        "rtGroup2Admin",
        "999999",
        HttpStatusCode.Forbidden,
        {
          useRawRecordingId: true,
        }
      );
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
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.Analyse,
          "rtRecording02",
          expectedProcessing02,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost(superuser, {
          "tracking-format": 42,
        }).then((algorithmId) => {
          cy.processingApiTracksPost(
            superuser,
            "rtTrack02",
            "rtRecording02",
            { start_s: 1, end_s: 4 },
            algorithmId
          );
          cy.log("Add tags");
          cy.processingApiTracksTagsPost(
            superuser,
            "rtTrack02",
            "rtRecording02",
            "possum",
            0.9,
            { name: "Master" }
          ).then(() => {
            expectedRecording02.tracks = [
              {
                tags: [
                  {
                    what: "possum",
                    path: "all",
                    automatic: true,
                    trackId: getCreds("rtTrack02").id,
                    confidence: 0.9,
                    data: { name: "Master" },
                    id: -1,
                  },
                ],
                start: 1,
                end: 4,
                id: 1,
                //                  positions: [],
                // TODO: enable after merge
                filtered: false,
                automatic: true,
              },
            ];

            cy.log("set processing to done and recheck tracks");
            cy.processingApiPut(
              superuser,
              "rtRecording02",
              true,
              {},
              undefined
            );

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
              HttpStatusCode.BadRequest,
              { message: "No thumbnail exists" }
            );
          });
        });
      });
    });
  } else {
    it.skip("NOTE: Thumbnail generation tests skipped superuser disabled in environment variables", () => {});
  }
});
