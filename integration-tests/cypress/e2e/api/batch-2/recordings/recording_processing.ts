import { NOT_NULL_STRING, EXCLUDE_IDS } from "@commands/constants";
import {
  TEMPLATE_AUDIO_RECORDING_RESPONSE,
  TEMPLATE_AUDIO_RECORDING,
  TEMPLATE_AUDIO_RECORDING_PROCESSING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
  TEMPLATE_THERMAL_RECORDING_PROCESSING,
  TEMPLATE_THERMAL_RECORDING,
} from "@commands/dataTemplate";

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

//Also do not check recording ID in this test suite
const EXCLUDE_ALL_IDS = EXCLUDE_IDS.concat([".id"]);

describe("Recordings - processing tests", () => {
  const superuser = getCreds("superuser")["email"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate keys
  const EXCLUDE_KEYS = [
    ".jobKey",
    ".rawFileKey",
    ".updatedAt",
    ".id",
    ".metadataSource",
  ];

  const templateExpectedThermalRecording: ApiThermalRecordingResponse =
    JSON.parse(JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE));
  const templateExpectedAudioRecording: ApiAudioRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_RESPONSE)
  );
  const templateExpectedProcessing: ApiRecordingForProcessing = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_PROCESSING)
  );
  const templateExpectedAudioProcessing: ApiRecordingForProcessing = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_PROCESSING)
  );
  //Template thermal recording with no tracks (we will add them as part of the test)
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );
  delete templateRecording.metadata.metadata_source;
  delete templateRecording.processingState;
  delete templateRecording.metadata.tracks;

  //use standard audio recording template - inject it at ToMp3 state
  const templateAudioRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING)
  );
  templateAudioRecording.processingState = RecordingProcessingState.Analyse;

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
      cy.apiDeviceAlertAdd(
        "rpGroupAdmin",
        "rpAlert1b",
        POSSUM_ALERT,
        "rpCamera1b",
        0
      );

      //Create a 2nd group with device and admin
      cy.testCreateUserGroupAndDevice("rpGroup2Admin", "rpGroup2", "rpCamera2");

      //Sign is as superuser so we have their JWT
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
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        RecordingProcessingState.TrackAndAnalyse
      );
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.Audio,
        RecordingProcessingState.TrackAndAnalyse
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
        expectedRecording1.processingState =
          RecordingProcessingState.TrackAndAnalyse;
        expectedRecording1.processing = false;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1,
          EXCLUDE_ALL_IDS
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
        expectedRecording1.processingState =
          RecordingProcessingState.TrackAndAnalyse;
        expectedRecording1.processing = false;
        expectedProcessing1.processingState =
          RecordingProcessingState.TrackAndAnalyse;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1,
          EXCLUDE_ALL_IDS
        );

        cy.log("Send for processing (tracking)");
        expectedProcessing1.processingStartTime = NOT_NULL_STRING;
        expectedProcessing1.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.TrackAndAnalyse,
          "rpRecording1",
          expectedProcessing1,
          EXCLUDE_KEYS
        );

        cy.log("Check status (TrackAndAnalyse, processing)");
        expectedRecording1b = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording1",
          "rpCamera1",
          "rpGroup",
          null,
          recording1
        );
        expectedRecording1b.processingState =
          RecordingProcessingState.TrackAndAnalyse;
        expectedRecording1b.processing = true;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording1",
          expectedRecording1b,
          EXCLUDE_ALL_IDS
        );

        cy.log("Mark tracking as done");
        cy.processingApiPut(superuser, "rpRecording1", true, {}, undefined);

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
          EXCLUDE_ALL_IDS
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
              RecordingProcessingState.TrackAndAnalyse;
            const expectedProcessing4 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording4",
              recording4
            );
            expectedProcessing4.processingState =
              RecordingProcessingState.TrackAndAnalyse;

            const expectedProcessing5 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording5",
              recording5
            );
            expectedProcessing5.processingState =
              RecordingProcessingState.TrackAndAnalyse;

            cy.log(
              "Check recordings ordered by recordingDateTime (3,5,4) for TRACKING"
            );
            cy.processingApiCheck(
              superuser,
              RecordingType.ThermalRaw,
              RecordingProcessingState.TrackAndAnalyse,
              "rpRecording3",
              expectedProcessing3,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              superuser,
              RecordingType.ThermalRaw,
              RecordingProcessingState.TrackAndAnalyse,
              "rpRecording5",
              expectedProcessing5,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              superuser,
              RecordingType.ThermalRaw,
              RecordingProcessingState.TrackAndAnalyse,
              "rpRecording4",
              expectedProcessing4,
              EXCLUDE_KEYS
            );

            cy.log("mark as done (tracking->analyse)");
            cy.processingApiPut(superuser, "rpRecording3", true, {}, undefined);
            cy.processingApiPut(superuser, "rpRecording4", true, {}, undefined);
            cy.processingApiPut(superuser, "rpRecording5", true, {}, undefined);
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
                RecordingProcessingState.TrackAndAnalyse;
              const expectedProcessing7 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording7",
                recording7
              );
              expectedProcessing7.hasAlert = true;
              expectedProcessing7.processingState =
                RecordingProcessingState.TrackAndAnalyse;
              const expectedProcessing8 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording8",
                recording8
              );
              expectedProcessing8.processingState =
                RecordingProcessingState.TrackAndAnalyse;
              const expectedProcessing9 = TestCreateExpectedProcessingData(
                templateExpectedProcessing,
                "rpRecording9",
                recording9
              );
              expectedProcessing9.hasAlert = true;
              expectedProcessing9.processingState =
                RecordingProcessingState.TrackAndAnalyse;

              cy.log(
                "Check recordings ordered by alerts first, oldest first (9,7,8,6)"
              );
              cy.processingApiCheck(
                superuser,
                RecordingType.ThermalRaw,
                RecordingProcessingState.TrackAndAnalyse,
                "rpRecording9",
                expectedProcessing9,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                superuser,
                RecordingType.ThermalRaw,
                RecordingProcessingState.TrackAndAnalyse,
                "rpRecording7",
                expectedProcessing7,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                superuser,
                RecordingType.ThermalRaw,
                RecordingProcessingState.TrackAndAnalyse,
                "rpRecording9",
                expectedProcessing8,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                superuser,
                RecordingType.ThermalRaw,
                RecordingProcessingState.TrackAndAnalyse,
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
          "60sec-audio.m4a",
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
              "60sec-audio.m4a",
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
                superuser,
                RecordingType.ThermalRaw,
                RecordingProcessingState.Analyse,
                "rpRecording12",
                expectedProcessing12,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                superuser,
                RecordingType.ThermalRaw,
                RecordingProcessingState.Analyse,
                "rpRecording10",
                expectedProcessing10,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                superuser,
                RecordingType.Audio,
                RecordingProcessingState.Analyse,
                "rpRecording13",
                expectedProcessing13,
                EXCLUDE_KEYS
              );
              cy.processingApiCheck(
                superuser,
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
          RecordingProcessingState.TrackAndAnalyse;
        const expectedRecording18 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording18",
          "rpCamera1",
          "rpGroup",
          null,
          recording18
        );
        expectedRecording18.processingState =
          RecordingProcessingState.TrackAndAnalyse;
        expectedRecording18.processing = true;

        cy.log("Send for processing");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.TrackAndAnalyse,
          "rpRecording18",
          expectedProcessing18,
          EXCLUDE_KEYS
        );
        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost(superuser, {
          "tracking-format": 42,
          model_name: "Master",
        }).then((algorithmId) => {
          cy.processingApiTracksPost(
            superuser,
            "rpTrack18",
            "rpRecording18",
            { start_s: 1, end_s: 4 },
            algorithmId
          );

          cy.processingApiTracksTagsPost(
            superuser,
            "rpTrack18",
            "rpRecording18",
            "possum",
            0.9,
            { name: "Master" }
          ).then(() => {
            cy.log("Check tracks added to recording");
            expectedRecording18.tracks = [
              {
                tags: [
                  {
                    what: "possum",
                    path: "all",
                    automatic: true,
                    trackId: getCreds("rpTrack18").id,
                    confidence: 0.9,
                    model: "Master",
                    id: -1,
                  },
                ],
                start: 1,
                end: 4,
                id: 1,
                filtered: false,
              },
            ];

            expectedRecording18.processingState =
              RecordingProcessingState.Finished;
            expectedRecording18.processing = false;
            cy.log("Complete tracking");
            cy.processingApiPut(
              superuser,
              "rpRecording18",
              true,
              {},
              undefined
            );
            cy.log("Check tags added to recording/track");
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording18",
              expectedRecording18,
              EXCLUDE_ALL_IDS
            );
          });
        });
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
          RecordingProcessingState.TrackAndAnalyse;
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
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.TrackAndAnalyse,
          "rpRecording19",
          expectedProcessing19,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost(superuser, {
          "tracking-format": 42,
          model_name: "Master",
        }).then((algorithmId) => {
          cy.processingApiTracksPost(
            superuser,
            "rpTrack19",
            "rpRecording19",
            { start_s: 1, end_s: 4 },
            algorithmId
          );
          cy.processingApiTracksTagsPost(
            superuser,
            "rpTrack19",
            "rpRecording19",
            "possum",
            0.9,
            { name: "Master" }
          ).then(() => {
            cy.log("Check tracks added to recording");
            expectedRecording19.processing = true;

            expectedRecording19.processingState =
              RecordingProcessingState.TrackAndAnalyse;
            expectedRecording19.tracks = [
              {
                tags: [
                  {
                    what: "possum",
                    path: "all",
                    automatic: true,
                    trackId: getCreds("rpTrack19").id,
                    confidence: 0.9,
                    model: "Master",
                    id: -1,
                  },
                ],
                start: 1,
                end: 4,
                id: 1,
                //              positions: [],
                // TODO enable after merge
                filtered: false,
              },
            ];
            cy.log("Check tags added to recording/track");
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording19",
              expectedRecording19,
              EXCLUDE_ALL_IDS
            ).then(() => {
              cy.log("Delete the track and check tracks deleted");
              cy.processingApiTracksDelete(superuser, "rpRecording19");
              expectedRecording19.tracks = [];
              cy.apiRecordingCheck(
                "rpGroupAdmin",
                "rpRecording19",
                expectedRecording19,
                EXCLUDE_ALL_IDS
              ).then(() => {
                cy.log("set processing to done and recheck tracks");
                cy.processingApiPut(
                  superuser,
                  "rpRecording19",
                  true,
                  {},
                  undefined
                );
                expectedRecording19.processing = false;
                expectedRecording19.processingState =
                  RecordingProcessingState.Finished;
                cy.apiRecordingCheck(
                  "rpGroupAdmin",
                  "rpRecording19",
                  expectedRecording19,
                  EXCLUDE_ALL_IDS
                );
              });
            });
          });
        });
      });
    });

    //This is a single test to check that alerts are triggered by processing
    //Full tests of the alerts logic are done through the recording upload API
    it("Alert when desired animal is detected by processing", () => {
      //Note: camera 1b has an alert for possums
      const recording20 = TestCreateRecordingData(templateRecording);
      // Make the recording recent, so that it will alert
      recording20.recordingDateTime = new Date().toISOString();
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
          true
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
          RecordingProcessingState.TrackAndAnalyse;
        expectedProcessing20.hasAlert = true;

        cy.log("Send for processing and check is flagged as hasAlert");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.TrackAndAnalyse,
          "rpRecording20",
          expectedProcessing20,
          EXCLUDE_KEYS
        );

        cy.log("Look up algorithm and then post tracks");
        cy.processingApiAlgorithmPost(superuser, {
          "tracking-format": 42,
        }).then((algorithmId) => {
          cy.processingApiTracksPost(
            superuser,
            "rpTrack20",
            "rpRecording20",
            { start_s: 1, end_s: 4 },
            algorithmId
          );

          cy.log("Add tags");
          cy.processingApiTracksTagsPost(
            superuser,
            "rpTrack20",
            "rpRecording20",
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
            cy.processingApiPut(
              superuser,
              "rpRecording20",
              true,
              {},
              undefined
            ).then(() => {
              cy.log("Check an event was generated");
              cy.apiDeviceAlertCheck(
                "rpGroupAdmin",
                "rpCamera1b",
                expectedAlert20
              );
              cy.testEventsCheckAgainstExpected(
                "rpGroupAdmin",
                "rpCamera1b",
                expectedEvent20
              );
            });
          });
        });
      });
    });

    it("Test other metadata can be set by processing", () => {
      //this test uploads a thermal and changes it to and audio type what is this testing??
      // TODO
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
        cacophonyIndex: [
          { end_s: 21, begin_s: 1, index_percent: 81.8 },
          { end_s: 41, begin_s: 21, index_percent: 78.1 },
          { end_s: 61, begin_s: 41, index_percent: 72.6 },
        ],

        type: RecordingType.Audio,
        comment: "This is a new comment",
        // add newFields, change algorithm, set previewSecs to null, leave totalFrames unchanged
        additionalMetadata: {
          newField: "newValue",
          newField2: "newValue2",
          algorithm: 99999,
          previewSecs: null,
        },
      };
      //NOTE: location no longer supported

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
          RecordingProcessingState.TrackAndAnalyse;
        const expectedRecording17 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rpRecording17",
          "rpCamera1",
          "rpGroup",
          null,
          recording17
        );
        expectedRecording17.processingState =
          RecordingProcessingState.TrackAndAnalyse;
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
        expectedRecording17.cacophonyIndex = [
          { end_s: 21, begin_s: 1, index_percent: 81.8 },
          { end_s: 41, begin_s: 21, index_percent: 78.1 },
          { end_s: 61, begin_s: 41, index_percent: 72.6 },
        ];
        expectedRecording17.additionalMetadata = {
          newField: "newValue",
          newField2: "newValue2",
          algorithm: 99999,
          totalFrames: 4,
          previewSecs: null,
        } as any;

        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.TrackAndAnalyse,
          "rpRecording17",
          expectedProcessing17,
          EXCLUDE_KEYS
        );
        cy.processingApiPut(
          superuser,
          "rpRecording17",
          true,
          { fieldUpdates: fieldUpdates },

          undefined
        );
        expectedRecording17.processingState = RecordingProcessingState.Finished;
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording17",
          expectedRecording17,
          EXCLUDE_ALL_IDS
        );
      });
    });

    it("No files to process handled correctly", () => {
      cy.processingApiCheck(
        superuser,
        RecordingType.ThermalRaw,
        RecordingProcessingState.Analyse,
        "",
        undefined,
        EXCLUDE_KEYS
      );
      cy.processingApiCheck(
        superuser,
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
        "60sec-audio.m4a",
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
        expectedProcessing21.processingState = RecordingProcessingState.Analyse;

        cy.log("Check recording status is 'Analyse'");
        expectedRecording21.processingState = RecordingProcessingState.Analyse;
        expectedRecording21.rawMimeType = "audio/mp4";
        cy.apiRecordingCheck(
          "rpGroupAdmin",
          "rpRecording21",
          expectedRecording21,
          EXCLUDE_ALL_IDS
        );

        cy.log("Send for processing (Analyse)");
        expectedProcessing21.processingState = RecordingProcessingState.Analyse;
        expectedProcessing21.processingStartTime = NOT_NULL_STRING;
        expectedProcessing21.updatedAt = NOT_NULL_STRING;
        cy.processingApiCheck(
          superuser,
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
          expectedRecording21b.rawMimeType = "audio/mp4";
          cy.apiRecordingCheck(
            "rpGroupAdmin",
            "rpRecording21",
            expectedRecording21b,
            EXCLUDE_ALL_IDS
          );

          cy.log("Mark processing as done");
          cy.processingApiPut(
            superuser,
            "rpRecording21",
            true,
            {},
            undefined
          ).then(() => {
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
            expectedRecording21c.rawMimeType = "audio/mp4";
            expectedRecording21c.tracks = [];
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording21",
              expectedRecording21c,
              EXCLUDE_ALL_IDS
            );
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
              superuser,
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

    it("Recording not reprocessed automatically (not stale) if processing time <30 minutes", () => {
      cy.log(
        "Add recording with processing=true, processinmgState='analyse' and processingStartTime=29.minutes.ago"
      );
      const recording22 = TestCreateRecordingData(templateRecording);
      recording22.processingState = RecordingProcessingState.AnalyseThermal;

      cy.apiRecordingAdd(
        "rpCamera1",
        recording22,
        "oneframe.cptv",
        "rpRecording22"
      ).then(() => {
        const expectedProcessing22 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording22",
          recording22
        );
        expectedProcessing22.processingState =
          RecordingProcessingState.AnalyseThermal;
        const expectedRecording22 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording22",
          "rpCamera1",
          "rpGroup",
          null,
          recording22
        );
        expectedRecording22.processing = true;
        expectedRecording22.processingState =
          RecordingProcessingState.AnalyseThermal;

        cy.log("Call getOneForProcessing to pick up this recording");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.AnalyseThermal,
          "rpRecording22",
          expectedProcessing22,
          EXCLUDE_KEYS
        ).then(() => {
          cy.log(
            "Update the recording setting currentStartTime to 29 minutes ago"
          );
          const fieldUpdates = {
            processingState: RecordingProcessingState.AnalyseThermal,
            processing: true,
            currentStateStartTime: new Date(
              new Date().getTime() - 29 * 60 * 1000
            ).toISOString(),
          };
          cy.processingApiPut(
            superuser,
            "rpRecording22",
            true,
            { fieldUpdates: fieldUpdates },
            undefined
          );

          cy.apiRecordingCheck(
            "rpGroupAdmin",
            "rpRecording22",
            expectedRecording22,
            EXCLUDE_ALL_IDS
          );

          cy.log(
            "Call getOneForProcessing and verify recording NOT picked up for processing"
          );
          cy.processingApiCheck(
            superuser,
            RecordingType.ThermalRaw,
            RecordingProcessingState.AnalyseThermal,
            "",
            undefined,
            EXCLUDE_KEYS
          );
        });
      });
    });

    it("Stale recording reprocessed automatically if processing time >30 minutes", () => {
      cy.log(
        "Add recording with processing=true, processinmgState='analyse' and processingStartTime=30.minutes.ago"
      );
      const recording23 = TestCreateRecordingData(templateRecording);
      recording23.processingState = RecordingProcessingState.AnalyseThermal;

      cy.apiRecordingAdd(
        "rpCamera1",
        recording23,
        "oneframe.cptv",
        "rpRecording23"
      ).then(() => {
        const expectedProcessing23 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording23",
          recording23
        );
        expectedProcessing23.processingState =
          RecordingProcessingState.AnalyseThermal;
        const expectedRecording23 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording23",
          "rpCamera1",
          "rpGroup",
          null,
          recording23
        );
        expectedRecording23.processing = true;
        expectedRecording23.processingState =
          RecordingProcessingState.AnalyseThermal;

        cy.log("Call getOneForProcessing to pick up this recording");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.AnalyseThermal,
          "rpRecording23",
          expectedProcessing23,
          EXCLUDE_KEYS
        ).then(() => {
          cy.log(
            "Update the recording setting currentStartTime to 30 minutes ago"
          );

          const fieldUpdates = {
            processingState: RecordingProcessingState.AnalyseThermal,
            processing: true,
            currentStateStartTime: new Date(
              new Date().getTime() - 30 * 60 * 1000
            ).toISOString(),
          };

          cy.processingApiPut(
            superuser,
            "rpRecording23",
            true,
            { fieldUpdates: fieldUpdates },
            undefined
          );

          cy.apiRecordingCheck(
            "rpGroupAdmin",
            "rpRecording23",
            expectedRecording23,
            EXCLUDE_ALL_IDS
          );

          cy.log(
            "Call getOneForProcessing and verify recording IS picked up for processing and marked as failedCount=1"
          );
          expectedProcessing23.processingFailedCount = 1;
          cy.processingApiCheck(
            superuser,
            RecordingType.ThermalRaw,
            RecordingProcessingState.AnalyseThermal,
            "rpRecording23",
            expectedProcessing23,
            EXCLUDE_KEYS
          );

          cy.log("Mark processing as done");
          cy.processingApiPut(
            superuser,
            "rpRecording23",
            true,
            {},
            undefined
          ).then(() => {
            cy.log("Check recording status (FINISHED)");
            const expectedRecording23c = TestCreateExpectedRecordingData(
              templateExpectedThermalRecording,
              "rpRecording23",
              "rpCamera1",
              "rpGroup",
              null,
              recording23
            );
            expectedRecording23c.processingState =
              RecordingProcessingState.Finished;
            expectedRecording23c.processing = false;
            expectedRecording23c.rawMimeType = "audio/mp4";
            expectedRecording23c.tracks = [];
            cy.apiRecordingCheck(
              "rpGroupAdmin",
              "rpRecording23",
              expectedRecording23c,
              EXCLUDE_ALL_IDS
            );
          });
        });
      });
    });

    it.skip("Stale recording reprocessed ONCE only", () => {
      cy.log(
        "Add recording with processing=true, processinmgState='analyse' and processingStartTime=30.minutes.ago"
      );
      const recording24 = TestCreateRecordingData(templateRecording);
      recording24.processingState = RecordingProcessingState.AnalyseThermal;

      cy.apiRecordingAdd(
        "rpCamera1",
        recording24,
        "oneframe.cptv",
        "rpRecording24"
      ).then(() => {
        const expectedProcessing24 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording24",
          recording24
        );
        expectedProcessing24.processingState =
          RecordingProcessingState.AnalyseThermal;
        const expectedRecording24 = TestCreateExpectedRecordingData(
          templateExpectedThermalRecording,
          "rpRecording24",
          "rpCamera1",
          "rpGroup",
          null,
          recording24
        );
        expectedRecording24.processing = true;
        expectedRecording24.processingState =
          RecordingProcessingState.AnalyseThermal;

        cy.log("Call getOneForProcessing to pick up this recording");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.AnalyseThermal,
          "rpRecording24",
          expectedProcessing24,
          EXCLUDE_KEYS
        ).then(() => {
          cy.log(
            "Update the recording setting currentStartTime to 30 minutes ago"
          );

          const fieldUpdates = {
            processingState: RecordingProcessingState.AnalyseThermal,
            processing: true,
            currentStateStartTime: new Date(
              new Date().getTime() - 30 * 60 * 1000
            ).toISOString(),
          };

          cy.processingApiPut(
            superuser,
            "rpRecording24",
            true,
            { fieldUpdates: fieldUpdates },
            undefined
          );

          cy.apiRecordingCheck(
            "rpGroupAdmin",
            "rpRecording24",
            expectedRecording24,
            EXCLUDE_ALL_IDS
          );

          cy.log(
            "Call getOneForProcessing and verify recording IS picked up for processing and marked as failedCount=1"
          );
          expectedProcessing24.processingFailedCount = 1;
          cy.processingApiCheck(
            superuser,
            RecordingType.ThermalRaw,
            RecordingProcessingState.AnalyseThermal,
            "rpRecording24",
            expectedProcessing24,
            EXCLUDE_KEYS
          ).then(() => {
            cy.log(
              "Update the recording setting currentStartTime to 30 minutes ago"
            );
            (fieldUpdates as any).processingFailedCount = 1;
            cy.processingApiPut(
              superuser,
              "rpRecording24",
              true,
              { fieldUpdates: fieldUpdates },
              undefined
            );
            cy.log(
              "Call getOneForProcessing and verify recording IS NOT picked up for processing again"
            );
            cy.processingApiCheck(
              superuser,
              RecordingType.ThermalRaw,
              RecordingProcessingState.AnalyseThermal,
              "rpRecording24",
              undefined,
              EXCLUDE_KEYS
            );
          });
        });
      });
    });

    it("Fresh (unprocessed) recordings processed before stale (stuck in processing) recordings, even if newer", () => {
      // Step 1 ===============================
      cy.log(
        "Add recording with processing=true, processingState='analyse' and processingStartTime=30.minutes.ago"
      );
      const recording25 = TestCreateRecordingData(templateRecording);
      recording25.processingState = RecordingProcessingState.AnalyseThermal;
      recording25.recordingDateTime = "2020-01-01T00:00:00.000Z";

      cy.apiRecordingAdd(
        "rpCamera1",
        recording25,
        "oneframe.cptv",
        "rpRecording25"
      ).then(() => {
        const expectedProcessing25 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rpRecording25",
          recording25
        );
        expectedProcessing25.processingState =
          RecordingProcessingState.AnalyseThermal;

        cy.log("Call getOneForProcessing to pick up this recording");
        cy.processingApiCheck(
          superuser,
          RecordingType.ThermalRaw,
          RecordingProcessingState.AnalyseThermal,
          "rpRecording25",
          expectedProcessing25,
          EXCLUDE_KEYS
        ).then(() => {
          cy.log(
            "Update the recording setting currentStartTime to 30 minutes ago"
          );

          const fieldUpdates = {
            processingState: RecordingProcessingState.AnalyseThermal,
            processing: true,
            currentStateStartTime: new Date(
              new Date().getTime() - 30 * 60 * 1000
            ).toISOString(),
          };

          cy.processingApiPut(
            superuser,
            "rpRecording25",
            true,
            { fieldUpdates: fieldUpdates },
            undefined
          );
          expectedProcessing25.processingFailedCount = 1;

          // Step 2 ===============================
          cy.log("Add new recording with more recent timestamp");
          const recording25b = TestCreateRecordingData(templateRecording);
          recording25b.processingState =
            RecordingProcessingState.AnalyseThermal;
          recording25b.recordingDateTime = "2022-02-02T00:00:00.000Z";

          cy.apiRecordingAdd(
            "rpCamera1",
            recording25b,
            "oneframe.cptv",
            "rpRecording25b"
          ).then(() => {
            const expectedProcessing25b = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording25b",
              recording25b
            );
            expectedProcessing25b.processingState =
              RecordingProcessingState.AnalyseThermal;

            // Step 3 ========================================
            cy.log(
              "Call getOneForProcessing and verify new recording picked up for processing before stale recording"
            );
            cy.processingApiCheck(
              superuser,
              RecordingType.ThermalRaw,
              RecordingProcessingState.AnalyseThermal,
              "rpRecording25b",
              expectedProcessing25b,
              EXCLUDE_KEYS
            );

            // Step 4 ========================================
            cy.log(
              "Call getOneForProcessing and verify stale recording picked up for processing"
            );
            cy.processingApiCheck(
              superuser,
              RecordingType.ThermalRaw,
              RecordingProcessingState.AnalyseThermal,
              "rpRecording25",
              expectedProcessing25,
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
