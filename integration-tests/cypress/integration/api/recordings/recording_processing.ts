/// <reference path="../../../support/index.d.ts" />
import {
  //  HTTP_Unprocessable,
  //  HTTP_BadRequest,
  //HTTP_Forbidden,
  //  HTTP_OK200,
  NOT_NULL,
  superuser,
  suPassword,
} from "../../../commands/constants";

//TODO: workaround for issue 81 - imprecise locations by default.  Remove when fixed.
const EXCLUDE_IDS = [
  ".Tracks[].TrackTags[].TrackId",
  ".Tracks[].id",
  ".location.coordinates",
];
const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];
import {
  ApiRecordingReturned,
  ApiRecordingSet,
  ApiRecordingForProcessing,
} from "../../../commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
  TestCreateExpectedProcessingData,
} from "../../../commands/api/recording-tests";

const templateExpectedRecording: ApiRecordingReturned = {
  id: 892972,
  // TODO: Issue 87.  Filehash missing on returned values
  // fileHash: null,
  rawMimeType: "application/x-cptv",
  fileMimeType: null,
  processingState: "FINISHED",
  duration: 16.6666666666667,
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
  location: { type: "Point", coordinates: [-45.29115, 169.30845] },
  hasAlert: false,
  processingStartTime: NOT_NULL,
  processingEndTime: null,
  processing: true,
  updatedAt: NOT_NULL,
};

const templateExpectedAudioProcessing: ApiRecordingForProcessing = {
  id: 475,
  type: "audio",
  jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
  rawFileKey: "raw/2021/09/07/4d08a991-27e8-49c0-8c5a-fcf1031a42b8",
  //TODO: Issue ## -hould this be audio/mpeg
  rawMimeType: "video/mp4",
  fileKey: null,
  fileMimeType: null,
  processingState: "analyse",
  processingMeta: null,
  GroupId: 66,
  DeviceId: 99,
  StationId: null,
  recordingDateTime: "2021-07-17T20:13:17.248Z",
  duration: 60,
  location: { type: "Point", coordinates: [-43.53345, 172.64745] },
  hasAlert: false,
  processingStartTime: NOT_NULL,
  processingEndTime: null,
  processing: true,
  updatedAt: NOT_NULL,
};

const templateRecording: ApiRecordingSet = {
  type: "thermalRaw",
  fileHash: null,
  duration: 15.6666666666667,
  recordingDateTime: "2021-07-17T20:13:17.248Z",
  location: [-45.29115, 169.30845],
  version: "345",
  relativeToDawn: null,
  relativeToDusk: null,
  batteryCharging: null,
  batteryLevel: null,
  airplaneModeOn: null,
  additionalMetadata: {
    algorithm: 31143,
    previewSecs: 5,
    totalFrames: 141,
  },
  metadata: {},
  comment: "This is a comment",
  processingState: "analyse",
};

const templateAudioRecording: ApiRecordingSet = {
  type: "audio",
  fileHash: null,
  duration: 60,
  recordingDateTime: "2021-08-24T01:35:00.000Z",
  relativeToDawn: null,
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
  comment: null,
  processingState: "analyse",
};

describe("Recordings - processing tests", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("rpGroupAdmin", "rpGroup", "rpCamera1");
    cy.apiDeviceAdd("rpCamera1b", "rpGroup");
    cy.apiAlertAdd(
      "rpGroupAdmin",
      "rpAlert1b",
      [{ tag: "possum", automatic: true }],
      "rpCamera1b"
    );

    cy.testCreateUserGroupAndDevice("rpGroup2Admin", "rpGroup2", "rpCamera2");

    cy.apiSignInAs(null, null, superuser, suPassword);
  });

  beforeEach(() => {
    cy.testDeleteRecordingsInState(superuser, "thermalRaw", "analyse");
    cy.testDeleteRecordingsInState(superuser, "audio", "analyse");
  });

  it("Check default state for uploaded recording is analyse", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    delete recording1.processingState;
    let expectedRecording1: ApiRecordingReturned;
    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rpCamera1",
      recording1,
      "oneframe.cptv",
      "rpRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpRecording1",
        "rpCamera1",
        "rpGroup",
        null,
        recording1
      );

      cy.log("Check recording status is 'analyse'");
      expectedRecording1.processingState = "analyse";
      expectedRecording1.processing = null;
      cy.apiRecordingCheck(
        "rpGroupAdmin",
        "rpRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });
  });

  //TODO: To be written once the current changes to processing are implemented
  it("Uploaded recording passes through correct processing steps", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiRecordingReturned;
    let expectedRecording1b: ApiRecordingReturned;
    let expectedRecording1c: ApiRecordingReturned;
    let expectedProcessing1: ApiRecordingForProcessing;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rpCamera1",
      recording1,
      "oneframe.cptv",
      "rpRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpRecording1",
        "rpCamera1",
        "rpGroup",
        null,
        recording1
      );
      expectedProcessing1 = TestCreateExpectedProcessingData(
        templateExpectedProcessing,
        "rpRecording1",
        "rpCamera1",
        "rpGroup",
        null,
        recording1
      );

      cy.log("Check recording status is 'analyse'");
      expectedRecording1.processingState = "analyse";
      expectedRecording1.processing = null;
      cy.apiRecordingCheck(
        "rpGroupAdmin",
        "rpRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );

      cy.log("Send for processing (tracking)");
      expectedProcessing1.processingStartTime = NOT_NULL;
      expectedProcessing1.updatedAt = NOT_NULL;
      cy.processingApiCheck(
        "thermalRaw",
        "analyse",
        expectedProcessing1,
        EXCLUDE_KEYS
      );

      cy.log("Check status");
      expectedRecording1b = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpRecording1",
        "rpCamera1",
        "rpGroup",
        null,
        recording1
      );
      expectedRecording1b.processingState = "analyse";
      expectedRecording1b.processing = true;
      cy.apiRecordingCheck(
        "rpGroupAdmin",
        "rpRecording1",
        expectedRecording1b,
        EXCLUDE_IDS
      );

      cy.log("Mark processing as done");
      cy.processingApiPost("rpRecording1", true, {}, true, undefined);

      cy.log("Check status (FINISHED)");
      expectedRecording1c = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpRecording1",
        "rpCamera1",
        "rpGroup",
        null,
        recording1
      );
      expectedRecording1c.processingState = "FINISHED";
      expectedRecording1c.processing = false;
      expectedRecording1c.Tracks = [];
      cy.apiRecordingCheck(
        "rpGroupAdmin",
        "rpRecording1",
        expectedRecording1c,
        EXCLUDE_IDS
      );

      cy.log("Check status (FINISHED)");
    });
  });

  it("Multiple recordings are procesed in 'oldest first' order", () => {
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
            "rpCamera1",
            "rpGroup",
            null,
            recording3
          );
          const expectedProcessing4 = TestCreateExpectedProcessingData(
            templateExpectedProcessing,
            "rpRecording4",
            "rpCamera1",
            "rpGroup",
            null,
            recording4
          );
          const expectedProcessing5 = TestCreateExpectedProcessingData(
            templateExpectedProcessing,
            "rpRecording5",
            "rpCamera1",
            "rpGroup",
            null,
            recording5
          );

          cy.log("Check recordings ordered by recordingDateTime (3,5,4)");
          cy.processingApiCheck(
            "thermalRaw",
            "analyse",
            expectedProcessing3,
            EXCLUDE_KEYS
          );
          cy.processingApiCheck(
            "thermalRaw",
            "analyse",
            expectedProcessing5,
            EXCLUDE_KEYS
          );
          cy.processingApiCheck(
            "thermalRaw",
            "analyse",
            expectedProcessing4,
            EXCLUDE_KEYS
          );

          //TODO: repeat for each stage of processing
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
              "rpCamera1",
              "rpGroup",
              null,
              recording6
            );
            const expectedProcessing7 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording7",
              "rpCamera1b",
              "rpGroup",
              null,
              recording7
            );
            expectedProcessing7.hasAlert = true;
            const expectedProcessing8 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording8",
              "rpCamera1",
              "rpGroup",
              null,
              recording8
            );
            const expectedProcessing9 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording9",
              "rpCamera1b",
              "rpGroup",
              null,
              recording9
            );
            expectedProcessing9.hasAlert = true;

            cy.log(
              "Check recordings ordered by alerts first, oldest first (9,7,8,6)"
            );
            cy.processingApiCheck(
              "thermalRaw",
              "analyse",
              expectedProcessing9,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              "thermalRaw",
              "analyse",
              expectedProcessing7,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              "thermalRaw",
              "analyse",
              expectedProcessing8,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              "thermalRaw",
              "analyse",
              expectedProcessing6,
              EXCLUDE_KEYS
            );

            //TODO: repeat for each stage of processing
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
              "rpCamera1",
              "rpGroup",
              null,
              recording10
            );
            const expectedProcessing11 = TestCreateExpectedProcessingData(
              templateExpectedAudioProcessing,
              "rpRecording11",
              "rpCamera1",
              "rpGroup",
              null,
              recording11
            );
            const expectedProcessing12 = TestCreateExpectedProcessingData(
              templateExpectedProcessing,
              "rpRecording12",
              "rpCamera1",
              "rpGroup",
              null,
              recording12
            );
            const expectedProcessing13 = TestCreateExpectedProcessingData(
              templateExpectedAudioProcessing,
              "rpRecording13",
              "rpCamera1",
              "rpGroup",
              null,
              recording13
            );

            cy.log(
              "Check recordings ordered by oldest first with audio and thermal in different queues"
            );
            cy.processingApiCheck(
              "thermalRaw",
              "analyse",
              expectedProcessing12,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              "thermalRaw",
              "analyse",
              expectedProcessing10,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              "audio",
              "analyse",
              expectedProcessing13,
              EXCLUDE_KEYS
            );
            cy.processingApiCheck(
              "audio",
              "analyse",
              expectedProcessing11,
              EXCLUDE_KEYS
            );

            //TODO: repeat for each stage of processing once GP's changes are integrated
          });
        });
      });
    });
  });

  //This is a single test to check that alerts are triggered by processing
  //Full tests of the alerts logic are done through the recoring upload API
  it.skip("Alert when desired animal is detected by processing", () => {});

  it.skip("Tracking stage can add tracks to the recording", () => {});

  it.skip("Processing stage can add tags to the recording", () => {});

  it.skip("Test other metadata can be set by processing", () => {
    //top level recording data
    //additionalMetadata
    //Location -> stationId
  });

  it("No files to process handled correctly", () => {
    cy.processingApiCheck("thermalRaw", "analyse", undefined, EXCLUDE_KEYS);
    cy.processingApiCheck("audio", "analyse", undefined, EXCLUDE_KEYS);
  });

  it.skip("Audio recordings follow correct workflow", () => {});

  it("Recordings in other states not picked up for preocessing", () => {
    const recording14 = TestCreateRecordingData(templateRecording);
    recording14.processingState = "FINIHED";
    const recording15 = TestCreateRecordingData(templateRecording);
    recording15.processingState = "CORRUPT";
    const recording16 = TestCreateRecordingData(templateRecording);
    recording16.processingState = "analyse.failed";
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
            "thermalRaw",
            "analyse",
            undefined,
            EXCLUDE_KEYS
          );
        });
      });
    });
  });
});
