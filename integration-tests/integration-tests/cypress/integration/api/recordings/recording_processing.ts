/// <reference path="../../../support/index.d.ts" />
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import {
  ApiAlertConditions,
  ApiRecordingSet,
  ApiRecordingForProcessing,
} from "@commands/types";
import { getCreds } from "@commands/server";

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
import { createExpectedAlert } from "@commands/api/alerts";
import { createExpectedEvent } from "@commands/api/events";

describe("Recordings - processing tests", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate IDs
  const EXCLUDE_IDS = [
    ".tracks[].tags[].trackId",
    ".tracks[].tags[].id",
    ".tracks[].id",
    ".id",
  ];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey", ".updatedAt", ".id"];

  const templateExpectedThermalRecording: ApiThermalRecordingResponse = {
    deviceId: 0,
    deviceName: "",
    groupName: "",
    tags: [],
    tracks: [],
    id: 892972,
    rawMimeType: "application/x-cptv",
    processingState: RecordingProcessingState.Finished,
    duration: 16.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: { lat: -45.29115, lng: 169.30845 },
    type: RecordingType.ThermalRaw,
    additionalMetadata: { algorithm: 31143, previewSecs: 5, totalFrames: 141 },
    groupId: 246,
    comment: "This is a comment",
    processing: false,
  };

  const templateExpectedAudioRecording: ApiAudioRecordingResponse = {
    additionalMetadata: {} as any,
    airplaneModeOn: false,
    batteryCharging: "CHARGING",
    batteryLevel: 99,
    comment: "This is a comment",
    deviceId: 0,
    deviceName: "",
    duration: 16.6666666666667,
    groupId: 246,
    groupName: "",
    id: 892972,
    location: { lat: -43.53345, lng: 172.64745 },
    processing: false,
    processingState: RecordingProcessingState.Finished,
    rawMimeType: "application/x-cptv",
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    relativeToDusk: 100,
    tags: [],
    tracks: [],
    type: RecordingType.Audio,
    version: "99",
  };

  const templateExpectedProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: RecordingType.ThermalRaw,
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawMimeType: "application/x-cptv",
    fileKey: null,
    fileMimeType: null,
    processingState: "xxx",
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
    updatedAt: "xxx",
  };

  const templateExpectedAudioProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: RecordingType.Audio,
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawMimeType: "video/mp4",
    fileKey: null,
    fileMimeType: null,
    processingState: "xxx",
    processingMeta: null,
    GroupId: NOT_NULL,
    DeviceId: NOT_NULL,
    StationId: null,
    recordingDateTime: "2021-01-01T01:01:01.018Z",
    duration: 60,
    location: null,
    hasAlert: false,
    processingStartTime: NOT_NULL_STRING,
    processingEndTime: null,
    processing: true,
    updatedAt: "",
  };

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
    metadata: {},
    comment: "This is a comment",
    //    processingState: RecordingProcessingState.Analyse,
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
    comment: "A comment",
    //    processingState: RecordingProcessingState.Analyse,
  };

  const POSSUM_ALERT: ApiAlertConditions[] = [
    { tag: "possum", automatic: true },
  ];

  //TODO: These tests will not currently work unless we have SU access as we need to be able to delete any
  //recordings that are in analyse state that do not belong to us.  This can be removed once
  //the analyse.test state has been implemented.  All analyse states in this test suite except the
  //first test below can then be changed to analyse.test
  if (Cypress.env("running_in_a_dev_environment") == true) {
    before(() => {
      //Create a group with 2 devices, admin user
      cy.testCreateUserGroupAndDevice("rpGroupAdmin", "rpGroup", "rpCamera1");
      cy.apiDeviceAdd("rpCamera1b", "rpGroup");

      //Add an alert to the 2nd device
      cy.apiAlertAdd(
        "rpGroupAdmin",
        "rpAlert1b",
        POSSUM_ALERT,
        "rpCamera1b",
        0
      );

      //Create a 2nd group with device and admin
      cy.testCreateUserGroupAndDevice("rpGroup2Admin", "rpGroup2", "rpCamera2");

      //Sign is as superuser so we have their JWT
      cy.apiSignInAs(null, null, superuser, suPassword);
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
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        RecordingProcessingState.Tracking
      );
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.Audio,
        RecordingProcessingState.Tracking
      );
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        RecordingProcessingState.ToMp3
      );
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.Audio,
        RecordingProcessingState.ToMp3
      );
    });

    it("Check default state for uploaded thermal recording is tracking", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      delete recording1.processingState;
      let expectedRecording1: ApiThermalRecordingResponse;
      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rpCamera1",
        recording1,
        "oneframe.cptv",
        "rpRecording1"
      ).then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );

        cy.log("Check recording status is 'tracking'");
        expectedRecording1.processingState = RecordingProcessingState.Tracking;
        expectedRecording1.processing = false;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );
      });
    });

    it("Uploaded recording passes through correct processing steps", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      let expectedRecording1: ApiThermalRecordingResponse;
      let expectedRecording1b: ApiThermalRecordingResponse;
      let expectedRecording1c: ApiThermalRecordingResponse;
      let expectedRecording1d: ApiThermalRecordingResponse;
      let expectedRecording1e: ApiThermalRecordingResponse;
      let expectedProcessing1: ApiRecordingForProcessing;
      let expectedProcessing1c: ApiRecordingForProcessing;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rpCamera1",
        recording1,
        "oneframe.cptv",
        "rpRecording1"
      ).then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );
        expectedProcessing1 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording1",
          recording1
        );

        cy.log("Check recording status is 'tracking'");
        expectedRecording1.processingState = RecordingProcessingState.Tracking;
        expectedRecording1.processing = false;
        expectedProcessing1.processingState = RecordingProcessingState.Tracking;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );

        cy.log("Send for processing (tracking)");
        expectedProcessing1.processingStartTime = NOT_NULL_STRING;
        expectedProcessing1.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Tracking,
          "rpRecording1",
          expectedProcessing1,
          EXCLUDE_KEYS
        );

        cy.log("Check status (tracking, processing)");
        expectedRecording1b = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );
        expectedRecording1b.processingState = RecordingProcessingState.Tracking;
        expectedRecording1b.processing = true;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1b,
          EXCLUDE_IDS
        );

        cy.log("Mark tracking as done");
        cy.processingApiPut("rpRecording1", true, {}, undefined);

        cy.log("Check recording status is 'analyse'");
        expectedRecording1c = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );
        expectedRecording1c.processingState =
          RecordingProcessingState.AnalyseThermal;
        expectedRecording1c.processing = false;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1c,
          EXCLUDE_IDS
        );

        cy.log("Send for processing (analyse)");
        expectedProcessing1c = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording1",
          recording1
        );
        expectedProcessing1c.processingStartTime = NOT_NULL_STRING;
        expectedProcessing1c.updatedAt = NOT_NULL_STRING;
        expectedProcessing1c.processingState =
          RecordingProcessingState.AnalyseThermal;
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Analyse,
          "rpRecording1",
          expectedProcessing1c,
          EXCLUDE_KEYS
        );

        cy.log("Check status (analyse)");
        expectedRecording1d = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );
        expectedRecording1d.processingState =
          RecordingProcessingState.AnalyseThermal;
        expectedRecording1d.processing = true;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1d,
          EXCLUDE_IDS
        );

        cy.log("Mark processing as done");
        cy.processingApiPut("rpRecording1", true, {}, undefined);

        cy.log("Check status (FINISHED)");
        expectedRecording1e = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );
        expectedRecording1e.processingState = RecordingProcessingState.Finished;
        expectedRecording1e.processing = false;
        expectedRecording1e.tracks = [];
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1e,
          EXCLUDE_IDS
        );

        cy.log("Check status (FINISHED)");
      });
    });

    it("Multiple recordings are processed in 'oldest first' order (tracking)", () => {
      const recording3 = TestCreateRecordingData(templateRecording);
      const recording4 = TestCreateRecordingData(templateRecording);
      const recording5 = TestCreateRecordingData(templateRecording);
      recording3.recordingDateTime = "2020-01-01T00:03:00.000Z";
      recording4.recordingDateTime = "2021-01-01T00:03:00.000Z";
      recording5.recordingDateTime = "2020-01-01T00:04:00.000Z";
      cy.apiRecordingAdd(
        "rpCamera1",
        recording3,
        "oneframe.cptv",
        "rpRecording3"
      ).then(() => {
        cy.apiRecordingAdd(
          "rpCamera1",
          recording4,
          "oneframe.cptv",
          "rpRecording4"
        ).then(() => {
          cy.apiRecordingAdd(
            "rpCamera1",
            recording5,
            "oneframe.cptv",
            "rpRecording5"
          ).then(() => {
            const expectedProcessing3 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording3",
              recording3
            );
            expectedProcessing3.processingState =
              RecordingProcessingState.Tracking;
            const expectedProcessing4 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording4",
              recording4
            );
            expectedProcessing4.processingState =
              RecordingProcessingState.Tracking;

            const expectedProcessing5 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording5",
              recording5
            );
            expectedProcessing5.processingState =
              RecordingProcessingState.Tracking;

            cy.log(
              "Check recordings ordered by recordingDateTime (3,5,4) for TRACKING"
            );
            cy.processingApiCheck(
              RecordingType.ThermalRaw,
              RecordingProcessingState.Tracking,
              "rpRecording3",
              expectedProcessing3,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              RecordingType.ThermalRaw,
              RecordingProcessingState.Tracking,
              "rpRecording5",
              expectedProcessing5,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              RecordingType.ThermalRaw,
              RecordingProcessingState.Tracking,
              "rpRecording4",
              expectedProcessing4,
              EXCLUDE_KEYS
            );

            cy.log("mark as done (tracking->analyse)");
            cy.processingApiPut("rpRecording3", true, {}, undefined);
            cy.processingApiPut("rpRecording4", true, {}, undefined);
            cy.processingApiPut("rpRecording5", true, {}, undefined).then(
              () => {
                expectedProcessing3.processingState =
                  RecordingProcessingState.AnalyseThermal;
                expectedProcessing4.processingState =
                  RecordingProcessingState.AnalyseThermal;
                expectedProcessing5.processingState =
                  RecordingProcessingState.AnalyseThermal;

                cy.log(
                  "Check recordings ordered by recordingDateTime (3,5,4) for ANALYSE"
                );
                cy.processingApiCheck(
                  RecordingType.ThermalRaw,
                  RecordingProcessingState.Analyse,
                  "rpRecording3",
                  expectedProcessing3,
                  EXCLUDE_KEYS
                );
                cy.processingApiCheck(
                  RecordingType.ThermalRaw,
                  RecordingProcessingState.Analyse,
                  "rpRecording5",
                  expectedProcessing5,
                  EXCLUDE_KEYS
                );
                cy.processingApiCheck(
                  RecordingType.ThermalRaw,
                  RecordingProcessingState.Analyse,
                  "rpRecording4",
                  expectedProcessing4,
                  EXCLUDE_KEYS
                );
              }
            );
          });
        });
      });
    });

    it("Process recordings for device with animal-alerts before recordings from devices without", () => {
      //camera1 has no alerts, camera1b has 1 alert
      const recording6 = TestCreateRecordingData(templateRecording);
      const recording7 = TestCreateRecordingData(templateRecording);
      const recording8 = TestCreateRecordingData(templateRecording);
      const recording9 = TestCreateRecordingData(templateRecording);
      recording6.recordingDateTime = "2021-01-01T00:09:00.000Z";
      recording7.recordingDateTime = "2021-01-01T00:08:00.000Z";
      recording8.recordingDateTime = "2021-01-01T00:07:00.000Z";
      recording9.recordingDateTime = "2021-01-01T00:06:00.000Z";
      cy.apiRecordingAdd(
        "rpCamera1",
        recording6,
        "oneframe.cptv",
        "rpRecording6"
      ).then(() => {
        cy.apiRecordingAdd(
          "rpCamera1b",
          recording7,
          "oneframe.cptv",
          "rpRecording7"
        ).then(() => {
          cy.apiRecordingAdd(
            "rpCamera1",
            recording8,
            "oneframe.cptv",
            "rpRecording8"
          ).then(() => {
            cy.apiRecordingAdd(
              "rpCamera1b",
              recording9,
              "oneframe.cptv",
              "rpRecording9"
            ).then(() => {
              const expectedProcessing6 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording6",
                recording6
              );
              expectedProcessing6.processingState =
                RecordingProcessingState.Tracking;
              const expectedProcessing7 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording7",
                recording7
              );
              expectedProcessing7.hasAlert = true;
              expectedProcessing7.processingState =
                RecordingProcessingState.Tracking;
              const expectedProcessing8 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording8",
                recording8
              );
              expectedProcessing8.processingState =
                RecordingProcessingState.Tracking;
              const expectedProcessing9 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording9",
                recording9
              );
              expectedProcessing9.hasAlert = true;
              expectedProcessing9.processingState =
                RecordingProcessingState.Tracking;

              cy.log(
                "Check recordings ordered by alerts first, oldest first (9,7,8,6)"
              );
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Tracking,
                "rpRecording9",
                expectedProcessing9,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Tracking,
                "rpRecording7",
                expectedProcessing7,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Tracking,
                "rpRecording9",
                expectedProcessing8,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Tracking,
                "rpRecording6",
                expectedProcessing6,
                EXCLUDE_KEYS
              );
            });
          });
        });
      });
    });

    it("Process thermalRaw and audio recordings in separate queues", () => {
      const recording10 = TestCreateRecordingData(templateRecording);
      const recording11 = TestCreateRecordingData(templateAudioRecording);
      const recording12 = TestCreateRecordingData(templateRecording);
      const recording13 = TestCreateRecordingData(templateAudioRecording);
      recording10.recordingDateTime = "2021-01-01T00:09:00.000Z";
      recording11.recordingDateTime = "2021-01-01T00:08:00.000Z";
      recording12.recordingDateTime = "2021-01-01T00:07:00.000Z";
      recording13.recordingDateTime = "2021-01-01T00:06:00.000Z";
      recording10.processingState = RecordingProcessingState.Analyse;
      recording11.processingState = RecordingProcessingState.Analyse;
      recording12.processingState = RecordingProcessingState.Analyse;
      recording13.processingState = RecordingProcessingState.Analyse;
      cy.apiRecordingAdd(
        "rpCamera1",
        recording10,
        "oneframe.cptv",
        "rpRecording10"
      ).then(() => {
        cy.apiRecordingAdd(
          "rpCamera1",
          recording11,
          "60sec-audio.mp4",
          "rpRecording11"
        ).then(() => {
          cy.apiRecordingAdd(
            "rpCamera1",
            recording12,
            "oneframe.cptv",
            "rpRecording12"
          ).then(() => {
            cy.apiRecordingAdd(
              "rpCamera1",
              recording13,
              "60sec-audio.mp4",
              "rpRecording13"
            ).then(() => {
              const expectedProcessing10 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording10",
                recording10
              );
              expectedProcessing10.processingState =
                RecordingProcessingState.Analyse;
              const expectedProcessing11 = TestCreateExpectedProcessingData(
                templateExpectedAudioProcessing,
                "rpRecording11",
                recording11
              );
              expectedProcessing11.processingState =
                RecordingProcessingState.Analyse;
              const expectedProcessing12 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording12",
                recording12
              );
              expectedProcessing12.processingState =
                RecordingProcessingState.Analyse;
              const expectedProcessing13 = TestCreateExpectedProcessingData(
                templateExpectedAudioProcessing,
                "rpRecording13",
                recording13
              );
              expectedProcessing13.processingState =
                RecordingProcessingState.Analyse;

              cy.log(
                "Check recordings ordered by oldest first with audio and thermal in different queues"
              );
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Analyse,
                "rpRecording12",
                expectedProcessing12,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Analyse,
                "rpRecording10",
                expectedProcessing10,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                RecordingType.Audio,
                RecordingProcessingState.Analyse,
                "rpRecording13",
                expectedProcessing13,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                RecordingType.Audio,
                RecordingProcessingState.Analyse,
                "rpRecording11",
                expectedProcessing11,
                EXCLUDE_KEYS
              );
            });
          });
        });
      });
    });

    it("Tracking stage can add tracks and analyse stage can add tags to the recording", () => {
      const recording18 = TestCreateRecordingData(templateRecording);
      cy.apiRecordingAdd(
        "rpCamera1",
        recording18,
        "oneframe.cptv",
        "rpRecording18"
      ).then(() => {
        const expectedProcessing18 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording18",
          recording18
        );
        expectedProcessing18.processingState =
          RecordingProcessingState.Tracking;
        const expectedRecording18 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording18",
          "rpCamera1",
          "rpGroup",
          null,
          recording18
        );
        expectedRecording18.processingState = RecordingProcessingState.Tracking;
        expectedRecording18.processing = true;

        cy.log("Send for processing");
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Tracking,
          "rpRecording18",
          expectedProcessing18,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rpTrack18",
              "rpRecording18",
              { start_s: 1, end_s: 4 },
              algorithmId
            );

            cy.log("Check tracks added to recording");
            expectedRecording18.processing = true;
            expectedRecording18.processingState =
              RecordingProcessingState.Tracking;
            expectedRecording18.tracks = [
              {
                tags: [],
                start: 1,
                end: 4,
                id: 1,
                positions: [],
              },
            ];
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording18",
              expectedRecording18,
              EXCLUDE_IDS
            ).then(() => {
              expectedProcessing18.processingState =
                RecordingProcessingState.AnalyseThermal;
              cy.log("Complete tracking");
              cy.processingApiPut("rpRecording18", true, {}, undefined);

              cy.log("Start analyse");
              cy.processingApiCheck(
                RecordingType.ThermalRaw,
                RecordingProcessingState.Analyse,
                "rpRecording18",
                expectedProcessing18,
                EXCLUDE_KEYS
              );

              expectedRecording18.processing = true;
              expectedRecording18.processingState =
                RecordingProcessingState.AnalyseThermal;

              cy.log("Check tags added to recording/track");
              expectedRecording18.tracks = [
                {
                  tags: [
                    {
                      what: "possum",
                      automatic: true,
                      trackId: getCreds("rpTrack18").id,
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

              cy.processingApiTracksTagsPost(
                "rpTrack18",
                "rpRecording18",
                "possum",
                0.9,
                { name: "master" }
              );
              cy.apiRecordingCheck(
                "rpGroupAdmin",
                "rpRecording18",
                expectedRecording18,
                EXCLUDE_IDS
              ).then(() => {
                cy.log("set processing to done and recheck tracks");
                cy.processingApiPut("rpRecording18", true, {}, undefined);
                expectedRecording18.processing = false;
                expectedRecording18.processingState =
                  RecordingProcessingState.Finished;
                cy.apiRecordingCheck(
                  "rpGroupAdmin",
                  "rpRecording18",
                  expectedRecording18,
                  EXCLUDE_IDS
                );
              });
            });
          }
        );
      });
    });

    it("Tracking stage can delete tracks and tags from the recording", () => {
      const recording19 = TestCreateRecordingData(templateRecording);
      cy.apiRecordingAdd(
        "rpCamera1",
        recording19,
        "oneframe.cptv",
        "rpRecording19"
      ).then(() => {
        const expectedProcessing19 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording19",
          recording19
        );
        expectedProcessing19.processingState =
          RecordingProcessingState.Tracking;
        const expectedRecording19 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording19",
          "rpCamera1",
          "rpGroup",
          null,
          recording19
        );

        cy.log("Send for processing");
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Tracking,
          "rpRecording19",
          expectedProcessing19,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rpTrack19",
              "rpRecording19",
              { start_s: 1, end_s: 4 },
              algorithmId
            );

            cy.log("Check tracks added to recording");
            expectedRecording19.processing = true;
            expectedRecording19.processingState =
              RecordingProcessingState.Tracking;
            expectedRecording19.tracks = [
              {
                tags: [],
                start: 1,
                end: 4,
                id: 1,
                positions: [],
              },
            ];
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording19",
              expectedRecording19,
              EXCLUDE_IDS
            ).then(() => {
              cy.log("Check tags added to recording/track");
              expectedRecording19.tracks = [
                {
                  tags: [
                    {
                      what: "possum",
                      automatic: true,
                      trackId: getCreds("rpTrack19").id,
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
              cy.processingApiTracksTagsPost(
                "rpTrack19",
                "rpRecording19",
                "possum",
                0.9,
                { name: "master" }
              );
              cy.apiRecordingCheck(
                "rpGroupAdmin",
                "rpRecording19",
                expectedRecording19,
                EXCLUDE_IDS
              ).then(() => {
                cy.log("Delete the track and check tracks deleted");
                cy.processingApiTracksDelete("rpRecording19");
                expectedRecording19.tracks = [];
                cy.apiRecordingCheck(
                  "rpGroupAdmin",
                  "rpRecording19",
                  expectedRecording19,
                  EXCLUDE_IDS
                ).then(() => {
                  cy.log("set processing to done and recheck tracks");
                  cy.processingApiPut("rpRecording19", true, {}, undefined);
                  expectedRecording19.processing = false;
                  expectedRecording19.processingState =
                    RecordingProcessingState.AnalyseThermal;
                  cy.apiRecordingCheck(
                    "rpGroupAdmin",
                    "rpRecording19",
                    expectedRecording19,
                    EXCLUDE_IDS
                  );
                });
              });
            });
          }
        );
      });
    });

    //This is a single test to check that alerts are triggered by processing
    //Full tests of the alerts logic are done through the recording upload API
    //TODO: Work out why this test does not generate an alert - it should!!!
    it.skip("Alert when desired animal is detected by processing", () => {
      //Note: camera 1b has an alert for possums
      const recording20 = TestCreateRecordingData(templateRecording);
      cy.apiRecordingAdd(
        "rpCamera1b",
        recording20,
        "oneframe.cptv",
        "rpRecording20"
      ).then(() => {
        const expectedAlert20 = createExpectedAlert(
          "rpAlert1b",
          0,
          POSSUM_ALERT,
          true,
          "rpGroupAdmin",
          "rpCamera1b"
        );
        const expectedEvent20 = createExpectedEvent(
          "rpCamera1b",
          "rpRecording20",
          "rpAlert1b"
        );

        const expectedProcessing20 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording20",
          recording20
        );
        expectedProcessing20.processingState =
          RecordingProcessingState.Tracking;
        expectedProcessing20.hasAlert = true;

        cy.log("Send for processing and check is flagges as hasAlert");
        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Analyse,
          "rpRecording20",
          expectedProcessing20,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost({ "tracking-format": 42 }).then(
          (algorithmId) => {
            cy.processingApiTracksPost(
              "rpTrack20",
              "rpRecording20",
              { start_s: 1, end_s: 4 },
              algorithmId
            );

            cy.log("Add tags");
            cy.processingApiTracksTagsPost(
              "rpTrack20",
              "rpRecording20",
              "possum",
              0.9,
              { name: "master" }
            ).then(() => {
              cy.log("set processing to done and recheck tracks");
              cy.processingApiPut(
                "rpRecording20",
                true,
                {},

                undefined
              ).then(() => {
                cy.log("Check an event was generated");
                cy.apiAlertCheck("rpGroupAdmin", "rpCamera1b", expectedAlert20);
                cy.testEventsCheckAgainstExpected(
                  "rpGroupAdmin",
                  "rpCamera1b",
                  expectedEvent20
                );
              });
            });
          }
        );
      });
    });

    //TODO: Issue 96 - updates of location fail (time out)
    it("Test other metadata can be set by processing", () => {
      const fieldUpdates = {
        rawMimeType: "application/test",
        fileMimeType: "application/test2",
        duration: 20,
        recordingDateTime: "2020-01-01T00:00:00.000Z",
        relativeToDawn: 1000,
        relativeToDusk: -1000,
        version: "346",
        batteryLevel: 87,
        batteryCharging: "CHARGING",
        airplaneModeOn: true,
        type: RecordingType.Audio,
        comment: "This is a new comment",
        // add newFields, change algorithm, set previewSecs to null, leave totalFrames unchanged
        additionalMetadata: {
          newField: "newValue",
          newField2: "newValue2",
          algorithm: 99999,
          previewSecs: null,
        },
        location: [-46.29115, 170.30845],
      };
      //top level recording data
      const recording17 = TestCreateRecordingData(templateRecording);
      cy.apiRecordingAdd(
        "rpCamera1",
        recording17,
        "oneframe.cptv",
        "rpRecording17"
      ).then(() => {
        const expectedProcessing17 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording17",
          recording17
        );
        expectedProcessing17.processingState =
          RecordingProcessingState.Tracking;
        const expectedRecording17 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rpRecording17",
          "rpCamera1",
          "rpGroup",
          null,
          recording17
        );
        expectedRecording17.processingState =
          RecordingProcessingState.AnalyseThermal;
        expectedRecording17.processing = false;
        expectedRecording17.rawMimeType = "application/test";
        expectedRecording17.fileMimeType = "application/test2";
        expectedRecording17.duration = 20;
        expectedRecording17.recordingDateTime = "2020-01-01T00:00:00.000Z";
        expectedRecording17.relativeToDawn = 1000;
        expectedRecording17.relativeToDusk = -1000;
        expectedRecording17.version = "346";
        expectedRecording17.batteryLevel = 87;
        expectedRecording17.batteryCharging = "CHARGING";
        expectedRecording17.airplaneModeOn = true;
        expectedRecording17.type = RecordingType.Audio;
        expectedRecording17.comment = "This is a new comment";
        expectedRecording17.location = {
          lat: -46.29115,
          lng: 170.30845,
        };
        expectedRecording17.additionalMetadata = {
          newField: "newValue",
          newField2: "newValue2",
          algorithm: 99999,
          totalFrames: 141,
          previewSecs: null,
        } as any;

        cy.processingApiCheck(
          RecordingType.ThermalRaw,
          RecordingProcessingState.Tracking,
          "rpRecording17",
          expectedProcessing17,
          EXCLUDE_KEYS
        );
        cy.processingApiPut(
          "rpRecording17",
          true,
          { fieldUpdates: fieldUpdates },

          undefined
        );
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording17",
          expectedRecording17,
          EXCLUDE_IDS
        );
      });
    });

    it("No files to process handled correctly", () => {
      cy.processingApiCheck(
        RecordingType.ThermalRaw,
        RecordingProcessingState.Analyse,
        "",
        undefined,
        EXCLUDE_KEYS
      );
      cy.processingApiCheck(
        RecordingType.Audio,
        RecordingProcessingState.Analyse,
        "",
        undefined,
        EXCLUDE_KEYS
      );
    });

    it("Audio recordings follow correct workflow", () => {
      const recording21 = TestCreateRecordingData(templateAudioRecording);
      let expectedRecording21: ApiAudioRecordingResponse;
      let expectedRecording21b: ApiAudioRecordingResponse;
      let expectedRecording21c: ApiAudioRecordingResponse;
      let expectedProcessing21: ApiRecordingForProcessing;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rpCamera1",
        recording21,
        "60sec-audio.mp4",
        "rpRecording21"
      ).then(() => {
        expectedRecording21 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rpRecording21",
          "rpCamera1",
          "rpGroup",
          null,
          recording21
        );
        expectedProcessing21 = TestCreateExpectedProcessingData(
          templateExpectedAudioProcessing,
          "rpRecording21",
          recording21
        );
        expectedProcessing21.processingState = RecordingProcessingState.ToMp3;

        cy.log("Check recording status is 'toMp3'");
        expectedRecording21.processingState = RecordingProcessingState.ToMp3;
        expectedRecording21.rawMimeType = "video/mp4";
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording21",
          expectedRecording21,
          EXCLUDE_IDS
        );

        cy.log("Send for processing (toMp3)");
        expectedProcessing21.processingState = RecordingProcessingState.ToMp3;
        expectedProcessing21.processingStartTime = NOT_NULL_STRING;
        expectedProcessing21.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          RecordingType.Audio,
          RecordingProcessingState.ToMp3,
          "rpRecording21",
          expectedProcessing21,
          EXCLUDE_KEYS
        ).then(() => {
          cy.log("Check status");
          expectedRecording21b = TestCreateExpectedRecordingData(
            templateExpectedAudioRecording,
            "rpRecording21",
            "rpCamera1",
            "rpGroup",
            null,
            recording21
          );
          expectedRecording21b.processingState = RecordingProcessingState.ToMp3;
          expectedRecording21b.processing = true;
          expectedRecording21b.rawMimeType = "video/mp4";
          cy.apiRecordingCheck(
            "rpGroupAdmin",
            "rpRecording21",
            expectedRecording21b,
            EXCLUDE_IDS
          );

          cy.log("Mark processing as done");
          cy.processingApiPut("rpRecording21", true, {}, undefined).then(() => {
            cy.log("Check recording status is 'analyse'");
            expectedRecording21.processingState =
              RecordingProcessingState.Analyse;
            expectedRecording21.rawMimeType = "video/mp4";
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording21",
              expectedRecording21,
              EXCLUDE_IDS
            );

            cy.log("Send for processing (analyse)");
            expectedProcessing21.processingStartTime = NOT_NULL_STRING;
            expectedProcessing21.updatedAt = NOT_NULL_STRING;
            expectedProcessing21.processingState =
              RecordingProcessingState.Analyse;
            cy.processingApiCheck(
              RecordingType.Audio,
              RecordingProcessingState.Analyse,
              "rpRecording21",
              expectedProcessing21,
              EXCLUDE_KEYS
            ).then(() => {
              cy.log("Check status");
              expectedRecording21b = TestCreateExpectedRecordingData(
                templateExpectedAudioRecording,
                "rpRecording21",
                "rpCamera1",
                "rpGroup",
                null,
                recording21
              );
              expectedRecording21b.processingState =
                RecordingProcessingState.Analyse;
              expectedRecording21b.processing = true;
              expectedRecording21b.rawMimeType = "video/mp4";
              cy.apiRecordingCheck(
                "rpGroupAdmin",
                "rpRecording21",
                expectedRecording21b,
                EXCLUDE_IDS
              );

              cy.log("Mark processing as done");
              cy.processingApiPut("rpRecording21", true, {}, undefined).then(
                () => {
                  cy.log("Check status (FINISHED)");
                  expectedRecording21c = TestCreateExpectedRecordingData(
                    templateExpectedAudioRecording,
                    "rpRecording21",
                    "rpCamera1",
                    "rpGroup",
                    null,
                    recording21
                  );
                  expectedRecording21c.processingState =
                    RecordingProcessingState.Finished;
                  expectedRecording21c.processing = false;
                  expectedRecording21c.rawMimeType = "video/mp4";
                  expectedRecording21c.tracks = [];
                  cy.apiRecordingCheck(
                    "rpGroupAdmin",
                    "rpRecording21",
                    expectedRecording21c,
                    EXCLUDE_IDS
                  );
                }
              );
            });
          });
        });
      });
    });

    it("Recordings in other states not picked up for processing", () => {
      const recording14 = TestCreateRecordingData(templateRecording);
      recording14.processingState = RecordingProcessingState.Finished;
      const recording15 = TestCreateRecordingData(templateRecording);
      recording15.processingState = RecordingProcessingState.Corrupt;
      const recording16 = TestCreateRecordingData(templateRecording);
      recording16.processingState = RecordingProcessingState.AnalyseFailed;
      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rpCamera1",
        recording14,
        "oneframe.cptv",
        "rpRecording14"
      ).then(() => {
        cy.apiRecordingAdd(
          "rpCamera1",
          recording15,
          "oneframe.cptv",
          "rpRecording15"
        ).then(() => {
          cy.apiRecordingAdd(
            "rpCamera1",
            recording16,
            "oneframe.cptv",
            "rpRecording16"
          ).then(() => {
            cy.log(
              "Check none of above (non-'analyze') recordings are picked up for processing"
            );
            cy.processingApiCheck(
              RecordingType.ThermalRaw,
              RecordingProcessingState.Analyse,
              "",
              undefined,
              EXCLUDE_KEYS
            );
          });
        });
      });
    });
  } else {
    it.skip("NOTE: Processing tests skipped superuser disabled in environment variables", () => {});
  }
});
