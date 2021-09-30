/// <reference path="../../../support/index.d.ts" />
import {
  NOT_NULL,
  HTTP_Forbidden,
  HTTP_Unprocessable,
} from "@commands/constants";

import { getCreds } from "@commands/server";

import {
  ApiRecordingReturned,
  ApiRecordingSet,
  ApiRecordingForProcessing,
} from "@commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
  TestCreateExpectedProcessingData,
} from "@commands/api/recording-tests";

describe("Recordings - reprocessing tests", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate IDs
  //TODO: workaround for issue 81 - imprecise locations by default.  Remove when fixed.
  const EXCLUDE_IDS = [
    ".Tracks[].TrackTags[].TrackId",
    ".Tracks[].id",
    ".location.coordinates",
  ];

  //TODO: workaround for issue 88. Remove rawMimeType from exclude list once fixed
  //TODO: workaround for issue 81 - imprecise locations by default.  Remove when fixed.
  const EXCLUDE_IDS_AND_MIME = [
    ".Tracks[].TrackTags[].TrackId",
    ".Tracks[].id",
    ".location.coordinates",
    ".rawMimeType",
  ];

  //Do not validate keys
  const EXCLUDE_KEYS = [".jobKey", ".rawFileKey"];

  const templateRecording: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 15.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: [-45.29115, 169.30845],
    version: "345",
    batteryCharging: null,
    batteryLevel: null,
    airplaneModeOn: null,
    additionalMetadata: {
      algorithm: 31143,
      previewSecs: 5,
      totalFrames: 141,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [{ start_s: 2, end_s: 5, confident_tag: "cat", confidence: 0.9 }],
    },
    comment: "This is a comment",
    processingState: "FINISHED",
  };

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

  const templateExpectedProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: "thermalRaw",
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "rrpw/2021/09/07/4d08a991-27e8-49c0-8c5a-fcf1031a42b8",
    rawMimeType: "application/x-cptv",
    fileKey: null,
    fileMimeType: null,
    processingState: "analyse.test",
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

  const templateExpectedAudioRecording: ApiRecordingReturned = {
    // TODO: Issue 87.  Filehash missing on returned values
    // fileHash: null,
    id: 204771,
    rawMimeType: "audio/mp4",
    //rawMimeType: "video/mp4",
    fileMimeType: null,
    processingState: "FINISHED",
    duration: 60,
    recordingDateTime: "2021-08-24T01:35:00.000Z",
    relativeToDawn: null,
    relativeToDusk: -17219,
    location: { type: "Point", coordinates: [-43.53345, 172.64745] },
    version: "1.8.1",
    batteryLevel: 87,
    batteryCharging: "DISCHARGING",
    airplaneModeOn: false,
    type: "audio",
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
    GroupId: 389,
    StationId: null,
    comment: null,
    processing: null,
    Group: { groupname: "mattb-audio" },
    Station: null,
    Tags: [],
    Tracks: [],
    Device: { devicename: "mattb-s5", id: 2023 },
  };

  const templateExpectedAudioProcessing: ApiRecordingForProcessing = {
    id: 475,
    type: "audio",
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "rrpw/2021/09/07/4d08a991-27e8-49c0-8c5a-fcf1031a42b8",
    rawMimeType: "video/mp4",
    fileKey: null,
    fileMimeType: null,
    processingState: "analyse.test",
    processingMeta: null,
    GroupId: 66,
    DeviceId: 99,
    StationId: null,
    recordingDateTime: "2021-08-24T01:35:00.000Z",
    duration: 60,
    location: { type: "Point", coordinates: [-43.53345, 172.64745] },
    hasAlert: false,
    processingStartTime: NOT_NULL,
    processingEndTime: null,
    processing: true,
    updatedAt: NOT_NULL,
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
    processingState: "FINISHED",
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

      //Device1 admin and member
      cy.apiUserAdd("rrpDeviceAdmin");
      cy.apiUserAdd("rrpDeviceMember");
      cy.apiDeviceUserAdd(
        "rrpGroupAdmin",
        "rrpDeviceAdmin",
        "rrpCamera1",
        true
      );
      cy.apiDeviceUserAdd(
        "rrpGroupAdmin",
        "rrpDeviceMember",
        "rrpCamera1",
        true
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
      cy.testDeleteRecordingsInState(superuser, "thermalRaw", "analyse.test");
      cy.testDeleteRecordingsInState(superuser, "audio", "analyse.test");
      //TODO: API nees to implemnt a .test stream so we can avoid trashing (and picking up) analyse and reprocess files
      //from other users
      //cy.testDeleteRecordingsInState(superuser, "thermalRaw", "reprocess.test");
      //cy.testDeleteRecordingsInState(superuser, "audio", "reprocess.test");
      cy.testDeleteRecordingsInState(superuser, "thermalRaw", "reprocess"); //remove
      cy.testDeleteRecordingsInState(superuser, "audio", "reprocess"); //remove
    });

    //TODO: test to be updated when new processing workflow implemented
    it("Can reprocess a single recording", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      recording1.processingState = "FINISHED";
      let expectedRecording1: ApiRecordingReturned;
      let expectedRecording2: ApiRecordingReturned;
      let expectedRecording3: ApiRecordingReturned;
      let expectedRecording4: ApiRecordingReturned;
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
        expectedRecording1.processingState = "FINISHED";
        expectedRecording1.processing = null;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );

        cy.log("Mark for reprocessing");
        cy.apiReprocess(
          "rrpGroupAdmin",
          [getCreds("rrpRecording1").id],
          [getCreds("rrpRecording1").id]
        );

        cy.log("Check recording status - original track, tags deleted");
        expectedRecording2 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording1",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording2.processingState = "reprocess";
        expectedRecording2.processing = false;
        expectedRecording2.Tracks = [];
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
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedProcessing1.processingStartTime = NOT_NULL;
        expectedProcessing1.processingState = "reprocess";
        expectedProcessing1.updatedAt = NOT_NULL;
        cy.processingApiCheck(
          "thermalRaw",
          "reprocess",
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
        expectedRecording3.processingState = "reprocess";
        expectedRecording3.processing = true;
        expectedRecording3.Tracks = [];
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording1",
          expectedRecording3,
          EXCLUDE_IDS
        );

        cy.log("Mark as done");
        cy.processingApiPut("rrpRecording1", true, {}, true, undefined);

        cy.log("Check recording status is now FINISHED");
        expectedRecording4 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording1",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording4.processingState = "FINISHED";
        expectedRecording4.processing = false;
        expectedRecording4.Tracks = [];
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
      recording5.processingState = "FINISHED";
      let expectedRecording5: ApiRecordingReturned;

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
        cy.apiReprocess(
          "rrpGroupAdmin",
          [getCreds("rrpRecording5").id],
          [getCreds("rrpRecording5").id]
        );

        cy.log("Check recording is in reprocess, with existing tracks cleared");
        expectedRecording5.processingState = "reprocess";
        expectedRecording5.processing = false;
        expectedRecording5.Tracks = [];
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
      recording6.processingState = "FINISHED";
      let expectedRecording6: ApiRecordingReturned;

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
        cy.apiReprocess(
          "rrpGroupMember",
          [getCreds("rrpRecording6").id],
          [getCreds("rrpRecording6").id]
        );

        cy.log("Check recording is in reprocess, with existing tracks cleared");
        expectedRecording6.processingState = "reprocess";
        expectedRecording6.processing = false;
        expectedRecording6.Tracks = [];
        cy.apiRecordingCheck(
          "rrpGroupMember",
          "rrpRecording6",
          expectedRecording6,
          EXCLUDE_IDS
        );
      });
    });

    it("Device admin can request reprocess", () => {
      const recording7 = TestCreateRecordingData(templateRecording);
      recording7.processingState = "FINISHED";
      let expectedRecording7: ApiRecordingReturned;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording7,
        "oneframe.cptv",
        "rrpRecording7"
      ).then(() => {
        expectedRecording7 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording7",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording7
        );

        cy.log("Check admin can mark for reprocessing");
        cy.apiReprocess(
          "rrpDeviceAdmin",
          [getCreds("rrpRecording7").id],
          [getCreds("rrpRecording7").id]
        );

        cy.log("Check recording is in reprocess, with existing tracks cleared");
        expectedRecording7.processingState = "reprocess";
        expectedRecording7.processing = false;
        expectedRecording7.Tracks = [];
        cy.apiRecordingCheck(
          "rrpDeviceAdmin",
          "rrpRecording7",
          expectedRecording7,
          EXCLUDE_IDS
        );
      });
    });

    it("Device member can request reprocess", () => {
      const recording8 = TestCreateRecordingData(templateRecording);
      recording8.processingState = "FINISHED";
      let expectedRecording8: ApiRecordingReturned;

      cy.log("Add recording as device");
      cy.apiRecordingAdd(
        "rrpCamera1",
        recording8,
        "oneframe.cptv",
        "rrpRecording8"
      ).then(() => {
        expectedRecording8 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rrpRecording8",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording8
        );

        cy.log("Check group member can mark for reprocessing");
        cy.apiReprocess(
          "rrpDeviceMember",
          [getCreds("rrpRecording8").id],
          [getCreds("rrpRecording8").id]
        );

        cy.log("Check recording is in reprocess, with existing tracks cleared");
        expectedRecording8.processingState = "reprocess";
        expectedRecording8.processing = false;
        expectedRecording8.Tracks = [];
        cy.apiRecordingCheck(
          "rrpDeviceMember",
          "rrpRecording8",
          expectedRecording8,
          EXCLUDE_IDS
        );
      });
    });

    it("Non members cannot request reprocess", () => {
      const recording9 = TestCreateRecordingData(templateRecording);
      recording9.processingState = "FINISHED";
      let expectedRecording9: ApiRecordingReturned;

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
          undefined,
          HTTP_Forbidden
        );

        cy.log("Check recording is in FINISHED, with existing tracks intact");
        expectedRecording9.processingState = "FINISHED";
        cy.apiRecordingCheck(
          "rrpDeviceMember",
          "rrpRecording9",
          expectedRecording9,
          EXCLUDE_IDS
        );
      });
    });

  it("Failed reprocess requests handled correctly", () => {
    const recording10 = TestCreateRecordingData(templateRecording);
    recording10.processingState = "FINISHED";
    let expectedRecording10: ApiRecordingReturned;

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
        cy.log(
          "Check valid recording is in reprocess, with existing tracks cleared"
        );
        expectedRecording10.processingState = "reprocess";
        expectedRecording10.processing = false;
        expectedRecording10.Tracks = [];
        cy.apiRecordingCheck(
          "rrpDeviceMember",
          "rrpRecording10",
          expectedRecording10,
          EXCLUDE_IDS
        );
      });
    });

    it("Reprocessing an audio recording", () => {
      const recording1 = TestCreateRecordingData(templateAudioRecording);
      recording1.processingState = "FINISHED";
      let expectedRecording1: ApiRecordingReturned;
      let expectedRecording2: ApiRecordingReturned;
      let expectedRecording3: ApiRecordingReturned;
      let expectedRecording4: ApiRecordingReturned;
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
        expectedRecording1.processingState = "FINISHED";
        expectedRecording1.processing = null;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording11",
          expectedRecording1,
          EXCLUDE_IDS_AND_MIME
        );

        cy.log("Mark for reprocessing");
        cy.apiReprocess(
          "rrpGroupAdmin",
          [getCreds("rrpRecording11").id],
          [getCreds("rrpRecording11").id]
        );

        cy.log("Check recording status - original track, tags deleted");
        expectedRecording2 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rrpRecording11",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording2.processingState = "reprocess";
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
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedProcessing1.processingStartTime = NOT_NULL;
        expectedProcessing1.processingState = "reprocess";
        expectedProcessing1.updatedAt = NOT_NULL;
        cy.processingApiCheck(
          "audio",
          "reprocess",
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
        expectedRecording3.processingState = "reprocess";
        expectedRecording3.processing = true;
        cy.apiRecordingCheck(
          "rrpGroupAdmin",
          "rrpRecording11",
          expectedRecording3,
          EXCLUDE_IDS_AND_MIME
        );

        cy.log("Mark as done");
        cy.processingApiPut("rrpRecording11", true, {}, true, undefined);

        cy.log("Check recording status is now FINISHED");
        expectedRecording4 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rrpRecording11",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording1
        );
        expectedRecording4.processingState = "FINISHED";
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
      recording18.processingState = "FINISHED";
      let expectedRecording18: ApiRecordingReturned;
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
        cy.apiReprocess(
          "rrpGroupAdmin",
          [getCreds("rrpRecording18").id],
          [getCreds("rrpRecording18").id]
        );

        cy.log("Send for processing");
        expectedProcessing18 = TestCreateExpectedProcessingData(
          templateExpectedProcessing,
          "rrpRecording18",
          "rrpCamera1",
          "rrpGroup",
          null,
          recording18
        );
        expectedProcessing18.processingStartTime = NOT_NULL;
        expectedProcessing18.processingState = "reprocess";
        expectedProcessing18.updatedAt = NOT_NULL;
        cy.processingApiCheck(
          "thermalRaw",
          "reprocess",
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
            expectedRecording18.processingState = "reprocess";
            expectedRecording18.Tracks = [
              {
                TrackTags: [],
                data: { start_s: 1, end_s: 4 },
                id: 1,
              },
            ];
            cy.apiRecordingCheck(
              "rrpGroupAdmin",
              "rrpRecording18",
              expectedRecording18,
              EXCLUDE_IDS
            ).then(() => {
              cy.log("Check tags added to recording/track");
              expectedRecording18.Tracks = [
                {
                  TrackTags: [
                    {
                      what: "possum",
                      automatic: true,
                      TrackId: getCreds("rrpTrack18").id,
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
                cy.processingApiPut(
                  "rrpRecording18",
                  true,
                  {},
                  true,
                  undefined
                );
                expectedRecording18.processing = false;
                expectedRecording18.processingState = "FINISHED";
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
