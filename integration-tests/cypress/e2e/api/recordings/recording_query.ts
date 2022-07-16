/// <reference path="../../../support/index.d.ts" />
import {
  EXCLUDE_IDS_ARRAY,
} from "@commands/constants";
import {
  TEMPLATE_AUDIO_RECORDING_RESPONSE,
  TEMPLATE_AUDIO_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
  TEMPLATE_TRACK,
  TEMPLATE_AUDIO_TRACK,
  TEMPLATE_THERMAL_RECORDING,
} from "@commands/dataTemplate";

import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import {
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import {HttpStatusCode, RecordingProcessingState, RecordingType} from "@typedefs/api/consts";

describe("Recordings query using where", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];
  const queryHasPositions = false;
  //TODO enable after merge

  //Do not validate IDs or additoonaMetadata
  //On test server, do not validate processingData, as recordings may be processed during test
  let EXCLUDE_PARAMS = [];
  if (Cypress.env("running_in_a_dev_environment") == true) {
    EXCLUDE_PARAMS = EXCLUDE_IDS_ARRAY.concat([
      "[].tracks[].tags[].data",
      "[].additionalMetadata",
    ]);
  } else {
    EXCLUDE_PARAMS = EXCLUDE_IDS_ARRAY.concat([
      "[].tracks[].tags[].data",
      "[].additionalMetadata",
      "[].processingState",
      "[].processing",
    ]);
  }

  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );
  const templateExpectedAudioRecording: ApiAudioRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_RESPONSE)
  );

  const track1 = JSON.parse(JSON.stringify(TEMPLATE_TRACK));
  track1.start_s = 2;
  track1.end_s = 5;
  track1.predictions[0].label = "cat";
  track1.predictions[0].confident_tag = "cat";
  track1.predictions[0].confidence = 0.9;
  const track2 = JSON.parse(JSON.stringify(TEMPLATE_TRACK));
  track2.start_s = 1;
  track2.end_s = 3;
  track2.predictions[0].label = "possum";
  track2.predictions[0].confident_tag = "possum";
  track2.predictions[0].confidence = 0.8;
  const track4 = JSON.parse(JSON.stringify(TEMPLATE_TRACK));
  track4.start_s = 2;
  track4.end_s = 5;
  track4.predictions = [];
  const track5 = JSON.parse(JSON.stringify(TEMPLATE_AUDIO_TRACK));
  track5.start_s = 10;
  track5.end_s = 20;
  track5.minFreq = 20;
  track5.maxFreq = 10000;

  //Four recording templates for setting and their expected return values
  const recording1 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording1.duration = 15.6666666666667;
  recording1.recordingDateTime = "2021-07-17T20:13:17.248Z";
  recording1.location = [-45.29115, 169.30845];
  recording1.metadata.tracks[0] = track1;
  let expectedRecording1: ApiThermalRecordingResponse;

  const recording2 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording2.duration = 40;
  recording2.recordingDateTime = "2021-01-01T00:00:00.000Z";
  recording2.location = [-45, 169];
  recording2.metadata.tracks[0] = track2;
  recording2.processingState = RecordingProcessingState.Corrupt;
  let expectedRecording2: ApiThermalRecordingResponse;

  const recording3 = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
  delete recording3.processingState;

  let expectedRecording3: ApiAudioRecordingResponse;
  const recording4 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording4.duration = 40;
  recording4.recordingDateTime = "2021-01-01T00:00:00.000Z";
  recording4.location = [-45, 169];
  recording4.metadata.tracks[0] = track4;
  let expectedRecording4: ApiThermalRecordingResponse;

  //Array of recordings for paging tests
  const expectedRecording: ApiThermalRecordingResponse[] = [];

  before(() => {
    //Create group1 with admin, member and 2 devices
    cy.testCreateUserGroupAndDevice("rqGroupAdmin", "rqGroup", "rqCamera1");
    cy.apiUserAdd("rqGroupMember");
    cy.apiGroupUserAdd("rqGroupAdmin", "rqGroupMember", "rqGroup", true);
    cy.apiDeviceAdd("rqCamera1b", "rqGroup");

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
          recording1,
          false
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
            recording2,
            false
          );
          expectedRecording2.processingState = RecordingProcessingState.Corrupt;

          cy.apiRecordingAdd(
            "rqCamera1b",
            recording3,
            undefined,
            "rqRecording3"
          ).then(() => {
            expectedRecording3 = TestCreateExpectedRecordingData(
              templateExpectedAudioRecording,
              "rqRecording3",
              "rqCamera1b",
              "rqGroup",
              null,
              recording3,
              false
            );
            // TODO Issue 103:These parameters missing from result. If we
            // never return them, why do we have them?
            // Workaround: remove parameters not returned by where
            delete expectedRecording3.version;
            delete expectedRecording3.batteryCharging;
            delete expectedRecording3.airplaneModeOn;
            delete expectedRecording3.relativeToDawn;
            delete expectedRecording3.relativeToDusk;

            expectedRecording3.processingState = RecordingProcessingState.ToMp3;

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
                recording4,
                false
              );

              expectedRecording4.processingState =
                RecordingProcessingState.Finished;
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
                  data: "unknown",
                  trackId: -99,
                  id: -1,
                  userName: getTestName("rqGroupAdmin"),
                  userId: getCreds("rqGroupAdmin").id,
                },
              ];
              expectedRecording4.tracks[0].filtered = false;

              // TODO Issue 104:  positions returned as [] blank even
              // where they exist.  If we don't support this parameter, do
              // not return it at all
              // TODO enable after merge
              //expectedRecording1.tracks[0].positions = [];
              //expectedRecording2.tracks[0].positions = [];
              //expectedRecording4.tracks[0].positions = [];

              cy.apiRecordingsQueryCheck(
                "rqGroupAdmin",
                { where: { id: getCreds("rqRecording1").id } },
                [expectedRecording1],
                EXCLUDE_PARAMS
              );
              cy.apiRecordingsQueryCheck(
                "rqGroupAdmin",
                { where: { id: getCreds("rqRecording2").id } },
                [expectedRecording2],
                EXCLUDE_PARAMS
              );
              cy.apiRecordingsQueryCheck(
                "rqGroupAdmin",
                { where: { id: getCreds("rqRecording3").id } },
                [expectedRecording3],
                EXCLUDE_PARAMS
              );
              cy.apiRecordingsQueryCheck(
                "rqGroupAdmin",
                { where: { id: getCreds("rqRecording4").id } },
                [expectedRecording4],
                EXCLUDE_PARAMS
              );
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
          tempRecording,
          false
        );
        // TODO Issue 104:  positions returned as [] blank even
        // where they exist.  If we don't support this parameter, do
        // not return it at all
        // TODO enable after merge
        //expectedRecording[count].tracks[0].positions = [];
      });
    }
  });

  it("Group admin can query device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { id: getCreds("rqRecording1").id } },
      [expectedRecording1],
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
    );
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck(
      "rqGroupMember",
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
    );
    cy.log("Reverse sort order, intermediate page");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 3, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(3, 6),
      EXCLUDE_PARAMS
    );
    cy.log("Reverse sort order, last (part) page");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 18, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(18, 20),
      EXCLUDE_PARAMS
    );

    cy.log("Verify sort on a different parameter (recordingDateTime)");
    //recordingDateTime order is opposite to id order, so compare with reverse of original array
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 3, limit: 30, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(3, 30),
      EXCLUDE_PARAMS
    );
  });

  it("Can query by all valid single parameters", () => {
    cy.log("id");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { id: getCreds("rqRecording2").id } },
      [expectedRecording2],
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { GroupId: getCreds("rqGroup").id } },
      4
    );

    cy.log("type");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { type: RecordingType.Audio } },
      [expectedRecording3],
      EXCLUDE_PARAMS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { type: RecordingType.Audio } },
      1
    );

    cy.log("processingState");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { processingState: RecordingProcessingState.Corrupt } },
      [expectedRecording2],
      EXCLUDE_PARAMS
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: { processingState: RecordingProcessingState.Corrupt } },
      1
    );

    cy.log("duration");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: { duration: 60 } },
      [expectedRecording3],
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
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

  //TODO: Issue 91: /ap1/v1/recordings/count ignoring tags filter
  it("Can limit query by tags and tagmode", () => {
    cy.log("Tagged as possum");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tags: '["possum"]', order: '[["id", "ASC"]]' },
      [expectedRecording2, expectedRecording4],
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tags: '["possum"]', order: '[["id", "ASC"]]'}, 1);

    cy.log("Tagged as possum or cat");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tags: '["possum", "cat"]', order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "any", order:   '[["id", "ASC"]]'}, 4);

    cy.log("'untagged' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "untagged", order: '[["id", "ASC"]]' },
      [expectedRecording3],
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "untagged", order:   '[["id", "ASC"]]'}, 1);

    cy.log("'tagged' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "tagged", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "tagged", order:   '[["id", "ASC"]]'}, 3);

    cy.log("'no-human' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "no-human", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording3],
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "no-human", order:   '[["id", "ASC"]]'}, 3);

    cy.log("'automatic-only' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "automatic-only", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2],
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "automatic-only", order:   '[["id", "ASC"]]'}, 2);

    cy.log("'human-only' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "human-only", order: '[["id", "ASC"]]' },
      [expectedRecording4],
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "human-only", order:   '[["id", "ASC"]]'}, 1);

    cy.log("'automatic+human' tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "automatic+human", order: '[["id", "ASC"]]' },
      [],
      EXCLUDE_PARAMS
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
      EXCLUDE_PARAMS
    );
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, tagMode: "automatic-only", tags: '["possum"]', order:   '[["id", "ASC"]]'}, 1);
  });

  //TODO: Issue 94: invalid where, order parameters not caught - cause server error
  it("Can handle invalid queries", () => {
    //cy.log("Where");
    //cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {badParameter: "bad value"}}, [], EXCLUDE_PARAMS, HttpStatusCode.Unprocessable);
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {badParameter: "bad value"}}, undefined, HttpStatusCode.Unprocessable);
    cy.log("Tagmode");
    cy.apiRecordingsQueryCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "rubbish value" },
      [],
      EXCLUDE_PARAMS,
      HttpStatusCode.Unprocessable
    );
    cy.apiRecordingsCountCheck(
      "rqGroupAdmin",
      { where: {}, tagMode: "rubbish value" },
      undefined,
      HttpStatusCode.Unprocessable
    );
    //cy.log("order");
    //cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {}, order: '["badParameter"]'}, [], EXCLUDE_PARAMS, HttpStatusCode.Unprocessable);
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, order: '["badParameter"]'}, undefined, HttpStatusCode.Unprocessable);
    //cy.log("unsupported parameter");
    //cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {}, badParameter: 11}, [], EXCLUDE_PARAMS, HttpStatusCode.Unprocessable);
    //cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {}, badParameter: 11}, undefined, HttpStatusCode.Unprocessable);
  });

  //TODO: Issue 91: /ap1/v1/recordings/count ignoring view-mode
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user as user should see only their recordings", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);
      cy.apiGroupUserAdd(
        "rqGroupAdmin",
        superuser,
        "rqGroup",
        true,
        true,
        HttpStatusCode.Ok,
        { useRawUserName: true }
      );

      cy.apiRecordingsQueryCheck(
        superuser,
        { where: {}, "view-mode": "user", order: '[["id", "ASC"]]' },
        [
          expectedRecording1,
          expectedRecording2,
          expectedRecording3,
          expectedRecording4,
        ],
        EXCLUDE_PARAMS
      );
      //cy.apiRecordingsCountCheck( superuser, {where: {}, "view-mode":'user'}, 2);
      cy.apiGroupUserRemove("rqGroupAdmin", superuser, "rqGroup", HttpStatusCode.Ok, {
        useRawUserName: true,
      });
    });
  } else {
    it.skip("Super-user as user should see only their recordings", () => {});
  }

  it("Count shows all matches (not just current mage) if countAll=true specified", () => {
    //note: .slice takes params (startPos, endPos+1) - how wierd is that?!
    cy.log("Get first page, setting limit - expect count of ALL results");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      {
        where: {},
        offset: 0,
        limit: 3,
        order: '[["id", "ASC"]]',
        countAll: true,
      },
      expectedRecording.slice(0, 3),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 20 }
    );

    cy.log(
      "Get intermediate page, setting limit - expect count of ALL results"
    );
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      {
        where: {},
        offset: 3,
        limit: 3,
        order: '[["id", "ASC"]]',
        countAll: true,
      },
      expectedRecording.slice(3, 6),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 20 }
    );

    cy.log(
      "Get final (part) page, setting limit - expect count of ALL results"
    );
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      {
        where: {},
        offset: 19,
        limit: 3,
        order: '[["id", "ASC"]]',
        countAll: true,
      },
      expectedRecording.slice(19, 20),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 20 }
    );
  });

  it("Count restricted to limit if countAll=false specified", () => {
    //note: .slice takes params (startPos, endPos+1) - how wierd is that?!
    cy.log("Get first page, setting limit - expect count of this page only");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      {
        where: {},
        offset: 0,
        limit: 3,
        order: '[["id", "ASC"]]',
        countAll: false,
      },
      expectedRecording.slice(0, 3),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 3 }
    );

    cy.log(
      "Get intermediate page, setting limit - expect count of this page only"
    );
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      {
        where: {},
        offset: 3,
        limit: 3,
        order: '[["id", "ASC"]]',
        countAll: false,
      },
      expectedRecording.slice(3, 6),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 3 }
    );

    cy.log(
      "Get final (part) page, setting limit - expect count of this page only"
    );
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      {
        where: {},
        offset: 19,
        limit: 3,
        order: '[["id", "ASC"]]',
        countAll: false,
      },
      expectedRecording.slice(19, 20),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 1 }
    );
  });

  it("Default countAll is 'true' (all results counted)", () => {
    cy.log("Get first page, setting limit - expect count to count ALL results");
    cy.apiRecordingsQueryCheck(
      "rqGroup2Admin",
      { where: {}, offset: 0, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(0, 3),
      EXCLUDE_PARAMS,
      HttpStatusCode.Ok,
      { count: 20 }
    );
  });

  //TODO: wrapper would need to check results contain expected results ... not yet implemented in test wrapper
  it.skip("Super-user should see all recordings", () => {});
});
