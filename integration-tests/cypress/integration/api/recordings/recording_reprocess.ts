/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
  NOT_NULL,
  NOT_NULL_STRING,
} from "@commands/constants";

import { getCreds } from "@commands/server";

import { ApiRecordingSet, ApiRecordingForProcessing } from "@commands/types";

import {
  TestCreateExpectedProcessingData,
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import {
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

describe("Recordings - reprocessing tests", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate IDs
  const EXCLUDE_IDS = [
    ".tracks[].tags[].trackId",
    ".tracks[].tags[].id",
    ".tracks[].id",
  ];

  //TODO: workaround for issue 88. Remove rawMimeType from exclude list once fixed
  const EXCLUDE_IDS_AND_MIME = [
    ".tracks[].tags[].trackId",
    ".tracks[].tags[].id",
    ".tracks[].id",
    ".rawMimeType",
  ];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];

  const templateRecording: ApiRecordingSet = {
    type: RecordingType.ThermalRaw,
    fileHash: null,
    duration: 15.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: [-45.29115, 169.30845],
    additionalMetadata: {
      algorithm: 31143,
      previewSecs: 5,
      totalFrames: 141,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [], //{ start_s: 2, end_s: 5, predictions: [{confident_tag: "cat", confidence: 0.9, model_id: 1}] }
    },
    comment: "This is a comment",
    processingState: RecordingProcessingState.Finished,
  };

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

  const templateExpectedProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: RecordingType.ThermalRaw,
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawMimeType: "application/x-cptv",
    fileKey: null,
    fileMimeType: null,
    processingState: RecordingProcessingState.Reprocess,
    processingMeta: null,
    GroupId: NOT_NULL,
    DeviceId: NOT_NULL,
    StationId: null,
    recordingDateTime: "2021-01-01T01:01:01.018Z",
    duration: 16.6666666666667,
    location: null,
    hasAlert: false,
    processingStartTime: NOT_NULL_STRING,
    processingEndTime: null,
    processing: true,
    updatedAt: NOT_NULL_STRING,
  };

  const templateExpectedAudioRecording: ApiAudioRecordingResponse = {
    id: 204771,
    type: RecordingType.Audio,
    rawMimeType: "audio/mp4",
    //rawMimeType: "video/mp4",
    processingState: RecordingProcessingState.Finished,
    duration: 60,
    recordingDateTime: "2021-08-24T01:35:00.000Z",
    relativeToDusk: -17219,
    location: { lat: -43.53345, lng: 172.64745 },
    version: "1.8.1",
    batteryLevel: 87,
    batteryCharging: "DISCHARGING",
    airplaneModeOn: false,
    additionalMetadata: {
      normal: "0",
      "SIM IMEI": "990006964660319",
      analysis: {
        cacophony_index: [
          { end_s: 20, begin_s: 0, index_percent: 80.8 },
          { end_s: 40, begin_s: 20, index_percent: 77.1 },
          { end_s: 60, begin_s: 40, index_percent: 71.6 },
        ],
        species_identify: [],
        cacophony_index_version: "2020-01-20_A",
        processing_time_seconds: 50.7,
        species_identify_version: "2021-02-01",
      },
      "SIM state": "SIM_STATE_READY",
      "Auto Update": false,
      "Flight Mode": false,
      "Phone model": "SM-G900V",
      amplification: 1.0721460589601806,
      SimOperatorName: "Verizon",
      "Android API Level": 23,
      "Phone manufacturer": "samsung",
      "App has root access": false,
    },
    groupId: 389,
    groupName: "mattb-audio",
    tags: [],
    tracks: [],
    deviceName: "mattb-s5",
    deviceId: 2023,
  };

  const templateExpectedAudioProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: RecordingType.Audio,
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawMimeType: "video/mp4",
    fileKey: null,
    fileMimeType: null,
    processingState: RecordingProcessingState.Reprocess,
    processingMeta: null,
    GroupId: NOT_NULL,
    DeviceId: NOT_NULL,
    StationId: null,
    recordingDateTime: "2021-01-01T01:01:01.018Z",
    duration: 16.6666666666667,
    location: null,
    hasAlert: false,
    processingStartTime: NOT_NULL_STRING,
    processingEndTime: null,
    processing: true,
    updatedAt: NOT_NULL_STRING,
  };

  const templateAudioRecording: ApiRecordingSet = {
    type: RecordingType.Audio,
    fileHash: null,
    duration: 60,
    recordingDateTime: "2021-08-24T01:35:00.000Z",
    relativeToDusk: -17219,
    location: [-43.53345, 172.64745],
    version: "1.8.1",
    batteryCharging: "DISCHARGING",
    batteryLevel: 87,
    airplaneModeOn: false,
    additionalMetadata: {
      normal: "0",
      "SIM IMEI": "990006964660319",
      analysis: {
        cacophony_index: [
          { end_s: 20, begin_s: 0, index_percent: 80.8 },
          { end_s: 40, begin_s: 20, index_percent: 77.1 },
          { end_s: 60, begin_s: 40, index_percent: 71.6 },
        ],
        species_identify: [],
        cacophony_index_version: "2020-01-20_A",
        processing_time_seconds: 50.7,
        species_identify_version: "2021-02-01",
      },
      "SIM state": "SIM_STATE_READY",
      "Auto Update": false,
      "Flight Mode": false,
      "Phone model": "SM-G900V",
      amplification: 1.0721460589601806,
      SimOperatorName: "Verizon",
      "Android API Level": 23,
      "Phone manufacturer": "samsung",
      "App has root access": false,
    },
    processingState: RecordingProcessingState.Finished,
  };

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
        "rrpCamera1b"
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

    //TODO: test to be updated when new processing workflow implemented
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

        cy.log("Check recording status - original track, tags deleted");
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
        expectedRecording2.tracks = [];
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
        expectedRecording3.tracks = [];
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
        expectedRecording4.tracks = [];
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
        expectedRecording5.tracks = [];
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
        expectedRecording6.tracks = [];
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
          HTTP_Forbidden
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
        cy.apiReprocess("rrpGroupAdmin", [999999], HTTP_Forbidden);

        cy.log(
          "Check mix of valid and invalid recordings are rejected correctly"
        );
        cy.apiReprocess(
          "rrpGroupAdmin",
          [999999, getCreds("rrpRecording10").id],
          HTTP_Forbidden
        );

        cy.log("Check that recordingIds array must be well formed");
        cy.apiReprocess(
          "rrpGroupAdmin",
          ["foo", "bar", 1] as unknown as number[],
          HTTP_Unprocessable
        );
        cy.apiReprocess("rrpGroupAdmin", [getCreds("rrpRecording10").id]);
        cy.log(
          "Check valid recording is in reprocess, with existing tracks cleared"
        );
        expectedRecording10.processingState =
          RecordingProcessingState.Reprocess;
        expectedRecording10.processing = false;
        expectedRecording10.tracks = [];
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
          EXCLUDE_IDS_AND_MIME
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
          EXCLUDE_IDS_AND_MIME
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
          EXCLUDE_IDS_AND_MIME
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
          EXCLUDE_IDS_AND_MIME
        );
      });
    });

    it("Reprocessing adds tracks, tracktags, tags correctly", () => {
      const recording18 = TestCreateRecordingData(templateRecording);
      recording18.processingState = RecordingProcessingState.Finished;
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
                positions: [],
                filtered: false,
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
                      data: { name: "master" },
                      id: -1,
                    },
                  ],
                  start: 1,
                  end: 4,
                  id: 1,
                  positions: [],
                  filtered: false,
                },
              ];

              cy.processingApiTracksTagsPost(
                "rrpTrack18",
                "rrpRecording18",
                "possum",
                0.9,
                { name: "master" }
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

    //TODO: blocked as we can't get alerts to generate in processing tests
    it.skip("Reprocessing does / doesn't? trigger new alerts", () => {});
  } else {
    it.skip(
      "NOTE: reprocess tests disables as environment variables have superuser access disabled"
    );
  }
});
