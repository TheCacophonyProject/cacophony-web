/// <reference path="../../../support/index.d.ts" />
import {
  NOT_NULL_STRING,
  EXCLUDE_IDS,
} from "@commands/constants";

import { getCreds } from "@commands/server";

import {
  ApiAlertConditions,
  ApiRecordingSet,
  ApiRecordingForProcessing,
} from "@commands/types";

import {
  TestCreateExpectedProcessingData,
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import {
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import {HttpStatusCode, RecordingProcessingState, RecordingType} from "@typedefs/api/consts";
import {
  TEMPLATE_AUDIO_RECORDING,
  TEMPLATE_AUDIO_RECORDING_PROCESSING,
  TEMPLATE_AUDIO_RECORDING_RESPONSE,
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_PROCESSING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";

import { createExpectedAlert } from "@commands/api/alerts";
import { createExpectedEvent } from "@commands/api/events";

describe("Recordings - reprocessing tests", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];

  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );

  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );

  const templateExpectedProcessing: ApiRecordingForProcessing = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_PROCESSING)
  );
  templateExpectedProcessing.processingState =
    RecordingProcessingState.Reprocess;

  const templateExpectedAudioRecording: ApiAudioRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_RESPONSE)
  );
  const templateExpectedAudioProcessing: ApiRecordingForProcessing = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_PROCESSING)
  );
  templateExpectedAudioProcessing.processingState =
    RecordingProcessingState.Reprocess;
  const templateAudioRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING)
  );

  const POSSUM_ALERT: ApiAlertConditions[] = [
    { tag: "possum", automatic: true },
  ];

  //TODO: These tests will not currently work unless we have SU access as we need to be able to delete any
  //recordings that are in analyse state that do not belong to us.  This can be removed once
  //the analyse.test state has been implemented.  All analyse/reprocess/FINISHED states in this test suite
  //can then be changed to ###.test
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(() => {
      //Create group1 with 2 devices, admin and member
      cy.testCreateUserGroupAndDevice(
        "rrpGroupAdmin",
        "rrpGroup",
        "rrpCamera1"
      );
      cy.apiDeviceAdd("rrpCamera1b", "rrpGroup");
      cy.apiUserAdd("rrpGroupMember");
      cy.apiGroupUserAdd("rrpGroupAdmin", "rrpGroupMember", "rrpGroup", true);

      //Alert on device1
      cy.apiAlertAdd(
        "rrpGroupAdmin",
        "rrpAlert1b",
        [{ tag: "possum", automatic: true }],
        "rrpCamera1b",
        0
      );

      //Group2 with device and admin
      cy.testCreateUserGroupAndDevice(
        "rrpGroup2Admin",
        "rrpGroup2",
        "rrpCamera2"
      );

      //Sign in superuser so that their credentials are available
      cy.apiSignInAs(null, null, superuser, suPassword);
    });

    beforeEach(() => {
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        "analyse.test"
      );
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.Audio,
        "analyse.test"
      );
      //TODO: API nees to implemnt a .test stream so we can avoid trashing (and picking up) analyse and reprocess files
      //from other users
      //cy.testDeleteRecordingsInState(superuser, RecordingType.ThermalRaw, "reprocess.test");
      //cy.testDeleteRecordingsInState(superuser, RecordingType.Audio, "reprocess.test");
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        RecordingProcessingState.Reprocess
      ); //remove
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.Audio,
        RecordingProcessingState.Reprocess
      ); //remove
    });

    it("Can reprocess a single recording", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      recording1.processingState = RecordingProcessingState.Finished;
      let expectedRecording1: ApiThermalRecordingResponse;
      let expectedRecording2: ApiThermalRecordingResponse;
      let expectedRecording3: ApiThermalRecordingResponse;
      let expectedRecording4: ApiThermalRecordingResponse;
      let expectedProcessing1: ApiRecordingForProcessing;
      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording1,
        "oneframe.cptv",
        "rrpRecording1"
      ).then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording1",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        cy.log("Check recording");
        expectedRecording1.processingState = RecordingProcessingState.Finished;
        expectedRecording1.processing = false;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );

        cy.log("Mark for reprocessing");
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording1").id]);

        cy.log("Check recording status - original tags deleted");
        expectedRecording2 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording1",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording2.processingState = RecordingProcessingState.Reprocess;
        expectedRecording2.processing = false;
        expectedRecording2.tracks[0].tags = [];
        expectedRecording2.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording1",
          expectedRecording2,
          EXCLUDE_IDS
        );

        cy.log("pick up for processing");
        expectedProcessing1 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rrpRecording1",
          recording1
        );
        expectedProcessing1.processingStartTime = NOT_NULL_STRING;
        expectedProcessing1.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Reprocess,
          "rrpRecording1",
          expectedProcessing1,
          EXCLUDE_KEYS
        );

        cy.log("Check recording status is now 'reprocess'");
        expectedRecording3 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording1",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording3.processingState = RecordingProcessingState.Reprocess;
        expectedRecording3.processing = true;
        expectedRecording3.tracks[0].tags = [];
        expectedRecording3.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording1",
          expectedRecording3,
          EXCLUDE_IDS
        );

        cy.log("Mark as done");
        cy.processingApiPut("rrpRecording1", true, {}, undefined);

        cy.log("Check recording status is now FINISHED");
        expectedRecording4 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording1",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording4.processingState = RecordingProcessingState.Finished;
        expectedRecording4.processing = false;
        expectedRecording4.tracks[0].tags = [];
        expectedRecording4.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording1",
          expectedRecording4,
          EXCLUDE_IDS
        );
      });
    });

    it("Group admin can request reprocess", () => {
      const recording5 = TestCreateRecordingData(templateRecording);
      recording5.processingState = RecordingProcessingState.Finished;
      let expectedRecording5: ApiThermalRecordingResponse;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording5,
        "oneframe.cptv",
        "rrpRecording5"
      ).then(() => {
        expectedRecording5 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording5",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording5
        );

        cy.log("Check admin can mark for reprocessing");
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording5").id]);

        cy.log("Check recording is in reprocess, with existing tracks cleared");
        expectedRecording5.processingState = RecordingProcessingState.Reprocess;
        expectedRecording5.processing = false;
        expectedRecording5.tracks[0].tags = [];
        expectedRecording5.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording5",
          expectedRecording5,
          EXCLUDE_IDS
        );
      });
    });

    it("Group member can request reprocess", () => {
      const recording6 = TestCreateRecordingData(templateRecording);
      recording6.processingState = RecordingProcessingState.Finished;
      let expectedRecording6: ApiThermalRecordingResponse;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording6,
        "oneframe.cptv",
        "rrpRecording6"
      ).then(() => {
        expectedRecording6 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording6",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording6
        );

        cy.log("Check group member can mark for reprocessing");
        cy.apiReprocess("rrpGroupMember", [getCreds("rrpRecording6").id]);

        cy.log("Check recording is in reprocess, with existing tracks cleared");
        expectedRecording6.processingState = RecordingProcessingState.Reprocess;
        expectedRecording6.processing = false;
        expectedRecording6.tracks[0].tags = [];
        expectedRecording6.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rrpGroupMember",
          "rrpRecording6",
          expectedRecording6,
          EXCLUDE_IDS
        );
      });
    });

    it("Non members cannot request reprocess", () => {
      const recording9 = TestCreateRecordingData(templateRecording);
      recording9.processingState = RecordingProcessingState.Finished;
      let expectedRecording9: ApiThermalRecordingResponse;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording9,
        "oneframe.cptv",
        "rrpRecording9"
      ).then(() => {
        expectedRecording9 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording9",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording9
        );

        cy.log("Check non-member cannot mark for reprocessing");
        cy.apiReprocess(
          "rrpGroup2Admin",
          [getCreds("rrpRecording9").id],
          HttpStatusCode.Forbidden
        );

        cy.log("Check recording is in FINISHED, with existing tracks intact");
        expectedRecording9.processingState = RecordingProcessingState.Finished;
        cy.apiRecordingCheck(
          "rrpGroupMember",
          "rrpRecording9",
          expectedRecording9,
          EXCLUDE_IDS
        );
      });
    });

    it("Failed reprocess requests handled correctly", () => {
      const recording10 = TestCreateRecordingData(templateRecording);
      recording10.processingState = RecordingProcessingState.Finished;
      let expectedRecording10: ApiThermalRecordingResponse;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording10,
        "oneframe.cptv",
        "rrpRecording10"
      ).then(() => {
        expectedRecording10 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording10",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording10
        );

        cy.log("Check cannot mark non-existent recording for reprocessing");
        cy.apiReprocess("rrpGroupAdmin", [999999], HttpStatusCode.Forbidden);

        cy.log(
          "Check mix of valid and invalid recordings are rejected correctly"
        );
        cy.apiReprocess(
          "rrpGroupAdmin",
          [999999, getCreds("rrpRecording10").id],
          HttpStatusCode.Forbidden
        );

        cy.log("Check that recordingIds array must be well formed");
        cy.apiReprocess(
          "rrpGroupAdmin",
          ["foo", "bar", 1] as unknown as number[],
          HttpStatusCode.Unprocessable
        );
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording10").id]);
        cy.log(
          "Check valid recording is in reprocess, with existing tracks cleared"
        );
        expectedRecording10.processingState =
          RecordingProcessingState.Reprocess;
        expectedRecording10.processing = false;
        expectedRecording10.tracks[0].tags = [];
        expectedRecording10.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rrpGroupMember",
          "rrpRecording10",
          expectedRecording10,
          EXCLUDE_IDS
        );
      });
    });

    it("Reprocessing an audio recording", () => {
      const recording1 = TestCreateRecordingData(templateAudioRecording);
      recording1.processingState = RecordingProcessingState.Finished;
      let expectedRecording1: ApiAudioRecordingResponse;
      let expectedRecording2: ApiAudioRecordingResponse;
      let expectedRecording3: ApiAudioRecordingResponse;
      let expectedRecording4: ApiAudioRecordingResponse;
      let expectedProcessing1: ApiRecordingForProcessing;
      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording1,
        "60sec-audio.mp4",
        "rrpRecording11"
      ).then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rrpRecording11",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );

        cy.log("Check recording");
        expectedRecording1.processingState = RecordingProcessingState.Finished;
        expectedRecording1.processing = false;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording11",
          expectedRecording1,
          EXCLUDE_IDS
        );

        cy.log("Mark for reprocessing");
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording11").id]);

        cy.log("Check recording status - original track, tags deleted");
        expectedRecording2 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rrpRecording11",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording2.processingState = RecordingProcessingState.Reprocess;
        expectedRecording2.processing = false;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording11",
          expectedRecording2,
          EXCLUDE_IDS
        );

        cy.log("pick up for processing");
        expectedProcessing1 = TestCreateExpectedProcessingData(
          templateExpectedAudioProcessing,
          "rrpRecording11",
          recording1
        );
        expectedProcessing1.processingStartTime = NOT_NULL_STRING;
        expectedProcessing1.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          RecordingType.Audio,
          RecordingProcessingState.Reprocess,
          "rrpRecording11",
          expectedProcessing1,
          EXCLUDE_KEYS
        );

        cy.log("Check recording status is now 'reprocess'");
        expectedRecording3 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rrpRecording11",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording3.processingState = RecordingProcessingState.Reprocess;
        expectedRecording3.processing = true;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording11",
          expectedRecording3,
          EXCLUDE_IDS
        );

        cy.log("Mark as done");
        cy.processingApiPut("rrpRecording11", true, {}, undefined);

        cy.log("Check recording status is now FINISHED");
        expectedRecording4 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rrpRecording11",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording4.processingState = RecordingProcessingState.Finished;
        expectedRecording4.processing = false;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording11",
          expectedRecording4,
          EXCLUDE_IDS
        );
      });
    });

    it("Reprocessing adds tracks, tracktags, tags correctly", () => {
      //redording with no initial tracks
      const recording18 = TestCreateRecordingData(templateRecording);
      recording18.processingState = RecordingProcessingState.Finished;
      recording18.metadata.tracks = [];
      let expectedRecording18: ApiThermalRecordingResponse;
      let expectedProcessing18: ApiRecordingForProcessing;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording18,
        "oneframe.cptv",
        "rrpRecording18"
      ).then(() => {
        expectedRecording18 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording18",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording18
        );

        cy.log("Check admin can mark for reprocessing");
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording18").id]);

        cy.log("Send for processing");
        expectedProcessing18 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rrpRecording18",
          recording18
        );
        expectedProcessing18.processingStartTime = NOT_NULL_STRING;
        expectedProcessing18.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Reprocess,
          "rrpRecording18",
          expectedProcessing18,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rrpTrack18",
              "rrpRecording18",
              { start_s: 1, end_s: 4 },
              algorithmId
            );

            cy.log("Check tracks added to recording");
            expectedRecording18.processing = true;
            expectedRecording18.processingState =
              RecordingProcessingState.Reprocess;
            expectedRecording18.tracks = [
              {
                tags: [],
                start: 1,
                end: 4,
                id: 1,
                //                positions: [],
                // TODO enable after merge
                filtered: true,
                automatic: true,
              },
            ];
            cy.apiRecordingCheck(
              "rrpGroupAdmin",
              "rrpRecording18",
              expectedRecording18,
              EXCLUDE_IDS
            ).then(() => {
              cy.log("Check tags added to recording/track");
              expectedRecording18.tracks = [
                {
                  tags: [
                    {
                      what: "possum",
                      automatic: true,
                      trackId: getCreds("rrpTrack18").id,
                      confidence: 0.9,
                      data: { name: "Master" },
                      id: -1,
                    },
                  ],
                  start: 1,
                  end: 4,
                  id: 1,
                  //                positions: [],
                  // TODO enable after merge
                  filtered: false,
                  automatic: true,
                },
              ];

              cy.processingApiTracksTagsPost(
                "rrpTrack18",
                "rrpRecording18",
                "possum",
                0.9,
                { name: "Master" }
              );
              cy.apiRecordingCheck(
                "rrpGroupAdmin",
                "rrpRecording18",
                expectedRecording18,
                EXCLUDE_IDS
              ).then(() => {
                cy.log("set processing to done and recheck tracks");
                cy.processingApiPut("rrpRecording18", true, {}, undefined);
                expectedRecording18.processing = false;
                expectedRecording18.processingState =
                  RecordingProcessingState.Finished;
                cy.apiRecordingCheck(
                  "rrpGroupAdmin",
                  "rrpRecording18",
                  expectedRecording18,
                  EXCLUDE_IDS
                );
              });
            });
          }
        );
      });
    });

    //TODO: Issue 106: Reprocess does not generate an alert.  Should it?
    it.skip("Reprocessing triggers alert", () => {
      //Note: camera 1b has an alert for possums
      const recording20 = TestCreateRecordingData(templateRecording);
      recording20.processingState = RecordingProcessingState.Finished;
      cy.apiRecordingAdd(
        "rrpCamera1b",
        recording20,
        "oneframe.cptv",
        "rrpRecording20"
      ).then(() => {
        const expectedAlert20 = createExpectedAlert(
          "rrpAlert1b",
          0,
          POSSUM_ALERT,
          true,
          "rrpGroupAdmin",
          "rrpCamera1b"
        );
        const expectedEvent20 = createExpectedEvent(
          "rrpCamera1b",
          "rrpRecording20",
          "rrpAlert1b"
        );

        const expectedProcessing20 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rrpRecording20",
          recording20
        );
        expectedProcessing20.processingState =
          RecordingProcessingState.Reprocess;
        expectedProcessing20.hasAlert = true;

        cy.log("Check admin can mark for reprocessing");
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording20").id]);

        cy.log("Send for reprocessing and check is flagged as hasAlert");
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Reprocess,
          "rrpRecording20",
          expectedProcessing20,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rrpTrack20",
              "rrpRecording20",
              { start_s: 1, end_s: 4 },
              algorithmId
            );

            cy.log("Add tags");
            cy.processingApiTracksTagsPost(
              "rrpTrack20",
              "rrpRecording20",
              "possum",
              0.9,
              {
                name: "Master",
                clarity: 1,
                raw_tag: "possum",
                model_used: "Inc3",
                predictions: [],
                classify_time: 1.2,
                prediction_frames: [],
                all_class_confidences: { possum: 1 },
              }
            ).then(() => {
              cy.log("set processing to done and recheck tracks");
              cy.processingApiPut("rrpRecording20", true, {}, undefined).then(
                () => {
                  cy.log("Check an event was generated");
                  cy.apiAlertCheck(
                    "rrpGroupAdmin",
                    "rrpCamera1b",
                    expectedAlert20
                  );
                  cy.testEventsCheckAgainstExpected(
                    "rrpGroupAdmin",
                    "rrpCamera1b",
                    expectedEvent20
                  );
                }
              );
            });
          }
        );
      });
    });
  } else {
    it.skip(
      "NOTE: reprocess tests disables as environment variables have superuser access disabled"
    );
  }
});
