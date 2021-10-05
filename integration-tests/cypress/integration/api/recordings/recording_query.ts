/// <reference path="../../../support/index.d.ts" />
import { HTTP_OK200, HTTP_Unprocessable, NOT_NULL } from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";

import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";

import { TestCreateExpectedRecordingData, TestCreateRecordingData } from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

describe("Recordings query using where", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //Do not validate IDs
  //TODO: workaround for issue 81 - imprecise locations by default.  Remove when fixed.
  const EXCLUDE_IDS = [
    "[].tracks[].tags[].trackId",
    "[].tracks[].tags[].id",
    "[].tracks[].id",
    "[].location.coordinates",
  ];

  const templateExpectedRecording: ApiThermalRecordingResponse = {
    deviceName: "cy_raCamera1_f9a1b6a1",
    deviceId: NOT_NULL as any,
    groupName: "cy_raGroup_f9a1b6a1",
    groupId: 504,
    tags: [],
    tracks: [
      {
        tags: [
          {
            what: "cat",
            automatic: true,
            trackId: 1,
            confidence: 0.9,
            data: "master",
            id: -1
          },
        ],
        start: 2,
        end: 5,
        id: 1,
      },
    ],
    additionalMetadata: null,
    comment: null,
    duration: 15.6666666666667,
    id: 1264,
    processing: null,
    processingState: RecordingProcessingState.Finished,
    rawMimeType: "application/x-cptv",
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    type: RecordingType.ThermalRaw,
  };

  //TODO: Issue ##. Several parameters not propogated to returned recordings query (but present in /recording (get)).  Commented out here
  //Either fix API to be consistent or remove this comment and remove commented lines below
  const templateRecording1: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 15.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: [-45.29115, 169.30845],
    //  version: "345",
    //  batteryCharging: null,
    batteryLevel: null,
    //  airplaneModeOn: null,
    additionalMetadata: {
      algorithm: 31143,
      previewSecs: 5,
      totalFrames: 141,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [{ start_s: 2, end_s: 5, predictions: [{confident_tag: "cat", confidence: 0.9, model_id: 1 }]}],
    },
    comment: "This is a comment",
    processingState: "FINISHED",
  };

  const templateRecording2: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 40,
    recordingDateTime: "2021-01-01T00:00:00.000Z",
    location: [-45, 169],
    //  version: "346",
    //  batteryCharging: null,
    batteryLevel: null,
    //  airplaneModeOn: null,
    additionalMetadata: {
      algorithm: 31144,
      previewSecs: 6,
      totalFrames: 142,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [
        { start_s: 1, end_s: 3, predictions: [{confident_tag: "possum", confidence: 0.8, model_id: 1 }]},
      ],
    },
    comment: "This is a comment2",
    processingState: "CORRUPT",
  };

  const templateRecording3: ApiRecordingSet = {
    type: "audio",
    fileHash: null,
    duration: 60,
    recordingDateTime: "2021-08-24T01:35:00.000Z",
    //  relativeToDawn: null,
    //  relativeToDusk: -17219,
    location: [-43.53345, 172.64745],
    //  version: "1.8.1",
    //  batteryCharging: "DISCHARGING",
    batteryLevel: 87,
    //  airplaneModeOn: false,
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
    comment: "test comment",
    processingState: "analyse",
  };

  const templateRecording4: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 40,
    recordingDateTime: "2021-01-01T00:00:00.000Z",
    location: [-45, 169],
    //  version: "346",
    //  batteryCharging: null,
    batteryLevel: null,
    //  airplaneModeOn: null,
    additionalMetadata: {
      algorithm: 31144,
      previewSecs: 6,
      totalFrames: 142,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [{ start_s: 2, end_s: 5, predictions: [] }],
    },
    comment: "This is a comment2",
    processingState: "FINISHED",
  };

  //Four recording templates for setting and their expected return values
  const recording1 = TestCreateRecordingData(templateRecording1);
  let expectedRecording1: ApiThermalRecordingResponse;
  const recording2 = TestCreateRecordingData(templateRecording2);
  let expectedRecording2: ApiThermalRecordingResponse;
  const recording3 = TestCreateRecordingData(templateRecording3);
  let expectedRecording3: ApiThermalRecordingResponse;
  const recording4 = TestCreateRecordingData(templateRecording4);
  let expectedRecording4: ApiThermalRecordingResponse;

  //Array of recordings for paging tests
  const expectedRecording: ApiThermalRecordingResponse[] = [];

  before(() => {
    //Create group1 with admin, member and 2 devices
    cy.testCreateUserGroupAndDevice("rqGroupAdmin", "rqGroup", "rqCamera1");
    cy.apiUserAdd("rqGroupMember");
    cy.apiGroupUserAdd("rqGroupAdmin", "rqGroupMember", "rqGroup", true);
    cy.apiDeviceAdd("rqCamera1b", "rqGroup");

    //Add device admin and member to device 1
    cy.apiUserAdd("rqDeviceAdmin");
    cy.apiUserAdd("rqDeviceMember");
    cy.apiDeviceUserAdd("rqGroupAdmin", "rqDeviceAdmin", "rqCamera1", true);
    cy.apiDeviceUserAdd("rqGroupAdmin", "rqDeviceMember", "rqCamera1", true);

    //Create a 2nd group, admin & device
    cy.testCreateUserGroupAndDevice("rqGroup2Admin", "rqGroup2", "rqCamera2");

    //define intercept here to allow adding recordings in before() - normally intercept is
    //added in beforeEach
    cy.intercept("POST", "recordings").as("addRecording");

    //add some recordings to query
    cy.apiRecordingAdd("rqCamera1", recording1, undefined, "rqRecording1").then(
      () => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rqRecording1",
          "rqCamera1",
          "rqGroup",
          null,
          recording1
        );

        cy.apiRecordingAdd(
          "rqCamera1",
          recording2,
          undefined,
          "rqRecording2"
        ).then(() => {
          expectedRecording2 = TestCreateExpectedRecordingData(
            templateExpectedRecording,
            "rqRecording2",
            "rqCamera1",
            "rqGroup",
            null,
            recording2
          );
          expectedRecording2.processingState = RecordingProcessingState.Corrupt;

          cy.apiRecordingAdd(
            "rqCamera1b",
            recording3,
            undefined,
            "rqRecording3"
          ).then(() => {
            expectedRecording3 = TestCreateExpectedRecordingData(
              templateExpectedRecording,
              "rqRecording3",
              "rqCamera1b",
              "rqGroup",
              null,
              recording3
            );
            expectedRecording3.processingState = RecordingProcessingState.AnalyseThermal;

            cy.apiRecordingAdd(
              "rqCamera1b",
              recording4,
              undefined,
              "rqRecording4"
            ).then(() => {
              expectedRecording4 = TestCreateExpectedRecordingData(
                templateExpectedRecording,
                "rqRecording4",
                "rqCamera1b",
                "rqGroup",
                null,
                recording4
              );

              expectedRecording4.processingState = RecordingProcessingState.Finished;
              cy.testUserTagRecording(
                getCreds("rqRecording4").id,
                0,
                "rqGroupAdmin",
                "possum"
              );

              expectedRecording4.tracks[0].tags = [
                {
                  what: "possum",
                  automatic: false,
                  confidence: 0.7,
                  data: null,
                  trackId: -99,
                  id: -1,
                  userName: getTestName("rqGroupAdmin"),
                  userId: getCreds("rqGroupAdmin").id,
                },
              ];
              //TODO: DEBUG!!!!! For some reason the recordings aren't fully available immediately.
              //Issue 103
              //Get them in .then  ... to verify they're there ...
              //cy.apiRecordingsQueryCheck(
              //  "rqGroupAdmin",
              //  { where: { id: getCreds("rqRecording1").id } },
              //  [expectedRecording1],
              //  EXCLUDE_IDS
              //);
              //cy.apiRecordingsQueryCheck(
              //  "rqGroupAdmin",
              //  { where: { id: getCreds("rqRecording2").id } },
              //  [expectedRecording2],
              //  EXCLUDE_IDS
              //);
              //cy.apiRecordingsQueryCheck(
              //  "rqGroupAdmin",
              //  { where: { id: getCreds("rqRecording3").id } },
              //  [expectedRecording3],
              //  EXCLUDE_IDS
              //);
              //cy.apiRecordingsQueryCheck(
              //  "rqGroupAdmin",
              //  { where: { id: getCreds("rqRecording4").id } },
              //  [expectedRecording4],
              //  EXCLUDE_IDS
              //);
            });
          });
        });
      }
    );
    for (let count = 0; count < 20; count++) {
      const tempRecording = JSON.parse(JSON.stringify(recording1));
      //recordingDateTime order different to id order to test sort on different parameters
      tempRecording.recordingDateTime =
        "2021-07-17T20:13:00." + (900 - count).toString() + "Z";
      cy.apiRecordingAdd(
        "rqCamera2",
        tempRecording,
        undefined,
        "rqRecordingB" + count.toString()
      ).then(() => {
        expectedRecording[count] = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rqRecordingB" + count.toString(),
          "rqCamera2",
          "rqGroup2",
          null,
          tempRecording
        );
      });
    }
  });

  it("Group admin can query device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { id: getCreds("rqRecording1").id } },
      [expectedRecording1],
      EXCLUDE_IDS
    );
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { id: getCreds("rqRecording1").id } },
      1
    );
  });

  it("Group member can query device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsQueryCheck(
      "rqGroupMember",
      { where: { id: getCreds("rqRecording1").id } },
      [expectedRecording1],
      EXCLUDE_IDS
    );
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck(
      "rqGroupMember",
      { where: { id: getCreds("rqRecording1").id } },
      1
    );
  });

  //RecordingsCount does not return data for device admin/member
  it.skip("Device admin can query device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsQueryCheck(
      "rqDeviceAdmin",
      { where: { id: getCreds("rqRecording1").id } },
      [expectedRecording1],
      EXCLUDE_IDS
    );
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck(
      "rqDeviceAdmin",
      { where: { id: getCreds("rqRecording1").id } },
      1
    );
  });

  it.skip("Device member can query device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsQueryCheck(
      "rqDeviceMember",
      { where: { id: getCreds("rqRecording1").id } },
      [expectedRecording1],
      EXCLUDE_IDS
    );
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck(
      "rqDeviceMember",
      { where: { id: getCreds("rqRecording1").id } },
      1
    );
  });

  it("Non member cannot view devices recordings", () => {
    cy.log("Check no recordings returned");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: { id: getCreds("rqRecording1").id } },
      [],
      EXCLUDE_IDS
    );
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck(
      "rqGroup2Admin",
      { where: { id: getCreds("rqRecording1").id } },
      0
    );
  });

  //duplicate of above
  //it.skip("Can handle no returned matches", () => {});

  it("Paging / sorting works as expected", () => {
    //note: .slice takes params (startPos, endPos+1) - how wierd is that?!
    cy.log("Get first page, setting limit");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 0, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(0, 3),
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroup2Admin",
      { where: {}, offset: 0, limit: 3, order: '[["id", "ASC"]]' },
      20
    );

    cy.log("Get intermediate page, setting limit");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 3, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(3, 6),
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroup2Admin",
      { where: {}, offset: 3, limit: 3, order: '[["id", "ASC"]]' },
      20
    );

    cy.log("Get final (part) page, setting limit");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 18, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(18, 20),
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroup2Admin",
      { where: {}, offset: 18, limit: 3, order: '[["id", "ASC"]]' },
      20
    );

    //note slice() has to be used to stop .reverse() modifying original array in-place - crazy.
    //Where's the javascript equivalent of the '!' operator?
    cy.log("Reverse sort order, first page");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 0, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(0, 3),
      EXCLUDE_IDS
    );
    cy.log("Reverse sort order, intermediate page");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 3, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(3, 6),
      EXCLUDE_IDS
    );
    cy.log("Reverse sort order, last (part) page");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 18, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(18, 20),
      EXCLUDE_IDS
    );

    cy.log("Verify sort on a different parameter (recordingDateTime)");
    //recordingDateTime order is opposite to id order, so compare with reverse of original array
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 3, limit: 30, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(3, 30),
      EXCLUDE_IDS
    );
  });

  it("Can query by all valid single parameters", () => {
    cy.log("id");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { id: getCreds("rqRecording2").id } },
      [expectedRecording2],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { id: getCreds("rqRecording2").id } },
      1
    );

    cy.log("recordingDateTime");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { recordingDateTime: recording3.recordingDateTime } },
      [expectedRecording3],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { recordingDateTime: recording3.recordingDateTime } },
      1
    );

    cy.log("DeviceId");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      {
        where: { DeviceId: getCreds("rqCamera1").id },
        order: '[["id", "ASC"]]',
      },
      [expectedRecording1, expectedRecording2],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { DeviceId: getCreds("rqCamera1").id } },
      2
    );

    cy.log("GroupId");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { GroupId: getCreds("rqGroup").id }, order: '[["id", "ASC"]]' },
      [
        expectedRecording1,
        expectedRecording2,
        expectedRecording3,
        expectedRecording4,
      ],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { GroupId: getCreds("rqGroup").id } },
      4
    );

    cy.log("type");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { type: "audio" } },
      [expectedRecording3],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck("rqGroupAdmin", { where: { type: "audio" } }, 1);

    cy.log("processingState");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { processingState: "CORRUPT" } },
      [expectedRecording2],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { processingState: "CORRUPT" } },
      1
    );

    cy.log("duration");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { duration: 60 } },
      [expectedRecording3],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck("rqGroupAdmin", { where: { duration: 60 } }, 1);

    //cy.log("StationId");
    //cy.log("processing");
  });

  it("Can query using operators", () => {
    cy.log("Greater than");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { duration: { $gt: 40 } } },
      [expectedRecording3],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { duration: { $gt: 40 } } },
      1
    );

    cy.log("Less than");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { duration: { $lt: 40 } } },
      [expectedRecording1],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { duration: { $lt: 40 } } },
      1
    );

    cy.log("Less than equal");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { duration: { $lte: 40 } }, order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { duration: { $lte: 40 } } },
      3
    );
  });

  //TODO: devicename and groupname appear not to be supported.  What nested parameters are?
  it.skip("Can query by nested parameters", () => {
    cy.log("Device.devicename");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      {
        where: { "Device.devicename": getTestName("rqCamera1") },
        order: '[["id", "ASC"]]',
      },
      [expectedRecording1, expectedRecording2],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { "Device.devicename": getTestName("rqCamera1") } },
      2
    );

    cy.log("Group.groupname");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      {
        where: { "Group.groupname": getTestName("rqGroup") },
        order: '[["id", "ASC"]]',
      },
      [expectedRecording1, expectedRecording2, expectedRecording3],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { "Group.groupname": getTestName("rqGroup") } },
      3
    );

    cy.log("Station.stationname");
    //TODO: add stations once helper functions support them
    //
  });

  it("Can query by multiple parameters", () => {
    cy.log("Duration and deviceId");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      {
        where: { DeviceId: getCreds("rqCamera1").id, duration: { $gte: 40 } },
        order: '[["id", "ASC"]]',
      },
      [expectedRecording2],
      EXCLUDE_IDS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      {
        where: { DeviceId: getCreds("rqCamera1").id, duration: { $gte: 40 } },
        order: '[["id", "ASC"]]',
      },
      1
    );
  });

  //TODO: Issue 92: /ap1/v1/recordings/count ignoring tags filter
  it("Can limit query by tags and tagmode", () => {
    cy.log("Tagged as possum");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tags: '["possum"]', order: '[["id", "ASC"]]' },
      [expectedRecording2, expectedRecording4],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tags: '["possum"]', order: '[["id", "ASC"]]'}, 1);

    cy.log("Tagged as possum or cat");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tags: '["possum", "cat"]', order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tags: '["possum", "cat"]', order: '[["id", "ASC"]]'}, 2);

    cy.log("'Any' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "any", order: '[["id", "ASC"]]' },
      [
        expectedRecording1,
        expectedRecording2,
        expectedRecording3,
        expectedRecording4,
      ],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "any", order:   '[["id", "ASC"]]'}, 4);

    cy.log("'untagged' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "untagged", order: '[["id", "ASC"]]' },
      [expectedRecording3],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "untagged", order:   '[["id", "ASC"]]'}, 1);

    cy.log("'tagged' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "tagged", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "tagged", order:   '[["id", "ASC"]]'}, 3);

    cy.log("'no-human' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "no-human", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording3],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "no-human", order:   '[["id", "ASC"]]'}, 3);

    cy.log("'automatic-only' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "automatic-only", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "automatic-only", order:   '[["id", "ASC"]]'}, 2);

    cy.log("'human-only' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "human-only", order: '[["id", "ASC"]]' },
      [expectedRecording4],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "human-only", order:   '[["id", "ASC"]]'}, 1);

    cy.log("'automatic+human' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "automatic+human", order: '[["id", "ASC"]]' },
      [],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "automatic+human", order:   '[["id", "ASC"]]'}, 0);

    cy.log("tag (possum) and tagmode (automatic)");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      {
        where: {},
        tagMode: "automatic-only",
        tags: '["possum"]',
        order: '[["id", "ASC"]]',
      },
      [expectedRecording2],
      EXCLUDE_IDS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "automatic-only", tags: '["possum"]', order:   '[["id", "ASC"]]'}, 1);
  });

  //TODO: Issue 94: invalid where, order parameters not caught - cause server error
  it("Can handle invalid queries", () => {
    //cy.log("Where");
    //cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {badParameter: "bad value"}}, [], EXCLUDE_IDS, HTTP_Unprocessable);
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {badParameter: "bad value"}}, undefined, HTTP_Unprocessable);
    cy.log("Tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "rubbish value" },
      [],
      EXCLUDE_IDS,
      HTTP_Unprocessable
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "rubbish value" },
      undefined,
      HTTP_Unprocessable
    );
    //cy.log("order");
    //cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {}, order: '["badParameter"]'}, [], EXCLUDE_IDS, HTTP_Unprocessable);
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, order: '["badParameter"]'}, undefined, HTTP_Unprocessable);
    //cy.log("unsupported parameter");
    //cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {}, badParameter: 11}, [], EXCLUDE_IDS, HTTP_Unprocessable);
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, badParameter: 11}, undefined, HTTP_Unprocessable);
  });

  //TODO: Issue 92: /ap1/v1/recordings/count ignoring view-mode
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user as user should see only their recordings", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);
      cy.apiDeviceUserAdd(
        "rqGroupAdmin",
        superuser,
        "rqCamera1b",
        true,
        HTTP_OK200,
        { useRawUserName: true }
      );

      cy.apiRecordingsQueryCheck(
        superuser,
        { where: {}, "view-mode": "user" },
        [expectedRecording3, expectedRecording4],
        EXCLUDE_IDS
      );
      //cy.apiRecordingsCountCheck( superuser, {where: {}, "view-mode":'user'}, 2);
      cy.apiDeviceUserRemove(
        "rqGroupAdmin",
        superuser,
        "rqCamera1b",
        HTTP_OK200,
        { useRawUserName: true }
      );
    });
  } else {
    it.skip("Super-user as user should see only their recordings", () => {});
  }

  //TODO: wrapper would need to check results contain expected results ... not yet implemented in test wrapper
  it.skip("Super-user should see all recordings", () => {});

  //TODO: This functionality needs to be reworked,  Issue 95
  it.skip("Can specify location precision", () => {});
});
