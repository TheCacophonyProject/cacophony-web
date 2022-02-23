/// <reference path="../../../support/index.d.ts" />
import { HTTP_Unprocessable, HTTP_OK200 } from "@commands/constants";

import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

import { ApiRecordingColumns, ApiRecordingSet } from "@commands/types";

import { getCreds } from "@commands/server";

import {
  TestCreateExpectedRecordingColumns,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { TEMPLATE_AUDIO_RECORDING } from "@commands/dataTemplate";

describe("Recordings report using where", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  //define recordings here so we have a range of values to check, rather than using predefined templates
  const templateRecording1: ApiRecordingSet = {
    type: RecordingType.ThermalRaw,
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
      algorithm: { model_name: "Master" },
      tracks: [
        {
          start_s: 2,
          end_s: 5,
          predictions: [{ confident_tag: "cat", confidence: 0.9, model_id: 1 }],
        },
      ],
    },
    comment: "This is a comment",
    processingState: RecordingProcessingState.Finished,
  };

  const templateRecording2: ApiRecordingSet = {
    type: RecordingType.ThermalRaw,
    fileHash: null,
    duration: 40,
    recordingDateTime: "2021-01-01T00:00:00.000Z",
    location: [-45.00045, 169.00065],
    version: "346",
    batteryCharging: null,
    batteryLevel: null,
    airplaneModeOn: null,
    additionalMetadata: {
      algorithm: 31144,
      previewSecs: 6,
      totalFrames: 142,
    },
    metadata: {
      algorithm: { model_name: "Master" },
      tracks: [
        {
          start_s: 1,
          end_s: 3,
          predictions: [{ confident_tag: "cat", confidence: 0.9, model_id: 1 }],
        },
      ],
    },
    comment: "This is a comment2",
    processingState: RecordingProcessingState.Corrupt,
  };

  const templateRecording3: ApiRecordingSet = TEMPLATE_AUDIO_RECORDING;
  templateRecording3.additionalMetadata.analysis.species_identify = [
    { end_s: 6, begin_s: 3, species: "morepork", liklihood: 1 },
    { end_s: 14, begin_s: 11, species: "morepork", liklihood: 0.38 },
    { end_s: 23, begin_s: 21, species: "morepork", liklihood: 1 },
    { end_s: 29, begin_s: 27, species: "morepork", liklihood: 1 },
    { end_s: 38, begin_s: 30, species: "morepork", liklihood: 1 },
    { end_s: 46, begin_s: 42, species: "morepork", liklihood: 1 },
    { end_s: 54, begin_s: 45, species: "morepork", liklihood: 1 },
    { end_s: 59.8, begin_s: 56.8, species: "morepork", liklihood: 1 },
  ];

  const templateRecording4: ApiRecordingSet = {
    type: RecordingType.ThermalRaw,
    fileHash: null,
    duration: 40,
    recordingDateTime: "2021-01-01T00:00:00.000Z",
    //TODO: Issue 95, locations rounded to 100m.  Replace .00045 and .00065 with non-100m rounded valeus when fixed
    location: [-45.00045, 169.00065],
    version: "346",
    batteryCharging: null,
    batteryLevel: null,
    airplaneModeOn: null,
    additionalMetadata: {
      algorithm: 31144,
      previewSecs: 6,
      totalFrames: 142,
    },
    metadata: {
      algorithm: { model_name: "Master" },
      tracks: [{ start_s: 2, end_s: 5, predictions: [] }],
    },
    comment: "This is a comment2",
    processingState: RecordingProcessingState.Finished,
  };

  //TODO: Travis does not handle timezones well. So ignoring datetime for now as in report we have no idea
  //what timezone data is in
  const EXCLUDE_COLUMNS = ["Date", "Time"];

  //Four sets of recording parameters to set and query
  const recording1 = TestCreateRecordingData(templateRecording1);
  let expectedRecording1: ApiRecordingColumns;
  const recording2 = TestCreateRecordingData(templateRecording2);
  let expectedRecording2: ApiRecordingColumns;
  const recording3 = TestCreateRecordingData(templateRecording3);
  let expectedRecording3: ApiRecordingColumns;
  const recording4 = TestCreateRecordingData(templateRecording4);
  let expectedRecording4: ApiRecordingColumns;

  //CSV file structure to compate against the returned report
  const expectedRecording: ApiRecordingColumns[] = [];

  before(() => {
    //Create group, 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("rreGroupAdmin", "rreGroup", "rreCamera1");
    cy.apiDeviceAdd("rreCamera1b", "rreGroup");
    cy.apiUserAdd("rreGroupMember");
    cy.apiGroupUserAdd("rreGroupAdmin", "rreGroupMember", "rreGroup", true);

    //Group2 with admin and device
    cy.testCreateUserGroupAndDevice(
      "rreGroup2Admin",
      "rreGroup2",
      "rreCamera2"
    );

    //define intercept here to allow adding recordings in before() - normally done in beforeEach
    cy.intercept("POST", "recordings").as("addRecording");

    //add some recordings to query
    cy.apiRecordingAdd(
      "rreCamera1",
      recording1,
      undefined,
      "rreRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingColumns(
        "rreRecording1",
        "rreCamera1",
        "rreGroup",
        undefined,
        recording1
      );
    });
    cy.apiRecordingAdd(
      "rreCamera1",
      recording2,
      undefined,
      "rreRecording2"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingColumns(
        "rreRecording2",
        "rreCamera1",
        "rreGroup",
        undefined,
        recording2
      );
    });
    cy.apiRecordingAdd(
      "rreCamera1b",
      recording3,
      undefined,
      "rreRecording3"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedRecordingColumns(
        "rreRecording3",
        "rreCamera1b",
        "rreGroup",
        undefined,
        recording3
      );
    });
    //Recording 4 with a human tag
    cy.apiRecordingAdd(
      "rreCamera1b",
      recording4,
      undefined,
      "rreRecording4"
    ).then(() => {
      expectedRecording4 = TestCreateExpectedRecordingColumns(
        "rreRecording4",
        "rreCamera1b",
        "rreGroup",
        undefined,
        recording4
      );
      cy.testUserTagRecording(
        getCreds("rreRecording4").id,
        0,
        "rreGroupAdmin",
        "possum"
      );
      expectedRecording4["Human Track Tags"] = "possum";
    });
    for (let count = 0; count < 20; count++) {
      const tempRecording = JSON.parse(JSON.stringify(recording1));
      //recordingDateTime order different to id order to test sort on different parameters
      tempRecording.recordingDateTime =
        "2021-07-17T20:13:00." + (900 - count).toString() + "Z";
      cy.apiRecordingAdd(
        "rreCamera2",
        tempRecording,
        undefined,
        "rreRecordingB" + count.toString()
      ).then(() => {
        expectedRecording[count] = TestCreateExpectedRecordingColumns(
          "rreRecordingB" + count.toString(),
          "rreCamera2",
          "rreGroup2",
          undefined,
          tempRecording
        );
      });
    }
  });

  it("Group admin can view report on their device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { id: getCreds("rreRecording1").id } },
      [expectedRecording1],
      EXCLUDE_COLUMNS
    );
  });

  it("Can get report on audio recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { id: getCreds("rreRecording3").id } },
      [expectedRecording3],
      EXCLUDE_COLUMNS
    );
  });

  it("Group member can view report on their device's recordings", () => {
    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsReportCheck(
      "rreGroupMember",
      { where: { id: getCreds("rreRecording1").id } },
      [expectedRecording1],
      EXCLUDE_COLUMNS
    );
  });

  it("Non member cannot view devices recordings", () => {
    cy.log("Check no recordings returned");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: { id: getCreds("rreRecording1").id } },
      []
    );
  });

  //duplicate of above
  //it.skip("Can handle no returned matches", () => {});

  it("Paging / sorting works as expected", () => {
    //note: .slice takes params (startPos, endPos+1) - how wierd is that?!
    cy.log("Get first page, setting limit");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 0, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(0, 3),
      EXCLUDE_COLUMNS
    );

    cy.log("Get intermediate page, setting limit");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 3, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(3, 6),
      EXCLUDE_COLUMNS
    );

    cy.log("Get final (part) page, setting limit");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 18, limit: 3, order: '[["id", "ASC"]]' },
      expectedRecording.slice(18, 20),
      EXCLUDE_COLUMNS
    );

    //note slice() has to be used to stop .reverse() modifying original array in-place - crazy.
    //Where's the javascript equivalent of the '!' operator?
    cy.log("Reverse sort order, first page");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 0, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(0, 3),
      EXCLUDE_COLUMNS
    );
    cy.log("Reverse sort order, intermediate page");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 3, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(3, 6),
      EXCLUDE_COLUMNS
    );
    cy.log("Reverse sort order, last (part) page");
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 18, limit: 3, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(18, 20),
      EXCLUDE_COLUMNS
    );

    cy.log("Verify sort on a different parameter (recordingDateTime)");
    //recordingDateTime order is opposite to id order, so compare with reverse of original array
    cy.apiRecordingsReportCheck(
      "rreGroup2Admin",
      { where: {}, offset: 3, limit: 30, order: '[["id", "DESC"]]' },
      expectedRecording.slice().reverse().slice(3, 30),
      EXCLUDE_COLUMNS
    );
  });

  it("Can query by all valid single parameters", () => {
    cy.log("id");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { id: getCreds("rreRecording2").id } },
      [expectedRecording2],
      EXCLUDE_COLUMNS
    );

    cy.log("recordingDateTime");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { recordingDateTime: recording3.recordingDateTime } },
      [expectedRecording3],
      EXCLUDE_COLUMNS
    );

    cy.log("DeviceId");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      {
        where: { DeviceId: getCreds("rreCamera1").id },
        order: '[["id", "ASC"]]',
      },
      [expectedRecording1, expectedRecording2],
      EXCLUDE_COLUMNS
    );

    cy.log("GroupId");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { GroupId: getCreds("rreGroup").id }, order: '[["id", "ASC"]]' },
      [
        expectedRecording1,
        expectedRecording2,
        expectedRecording3,
        expectedRecording4,
      ],
      EXCLUDE_COLUMNS
    );

    cy.log("type");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { type: RecordingType.Audio } },
      [expectedRecording3],
      EXCLUDE_COLUMNS
    );

    cy.log("processingState");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { processingState: RecordingProcessingState.Corrupt } },
      [expectedRecording2],
      EXCLUDE_COLUMNS
    );

    cy.log("duration");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { duration: 60 } },
      [expectedRecording3],
      EXCLUDE_COLUMNS
    );

    //cy.log("StationId");
    //cy.log("processing");
  });

  it("Can query using operators", () => {
    cy.log("Greater than");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { duration: { $gt: 40 } } },
      [expectedRecording3],
      EXCLUDE_COLUMNS
    );

    cy.log("Less than");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { duration: { $lt: 40 } } },
      [expectedRecording1],
      EXCLUDE_COLUMNS
    );

    cy.log("Less than equal");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: { duration: { $lte: 40 } }, order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_COLUMNS
    );
  });

  //TODO: devicename and groupname appear not to be supported.  What nested parameters are?
  it.skip("Can query by nested parameters", () => {});

  it("Can query by multiple parameters", () => {
    cy.log("Duration and deviceId");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      {
        where: { DeviceId: getCreds("rreCamera1").id, duration: { $gte: 40 } },
        order: '[["id", "ASC"]]',
      },
      [expectedRecording2],
      EXCLUDE_COLUMNS
    );
  });

  it.skip("Can limit query by tags and tagmode", () => {
    // FIXME
    cy.log("Tagged as possum");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tags: '["possum"]', order: '[["id", "ASC"]]' },
      [expectedRecording2, expectedRecording4],
      EXCLUDE_COLUMNS
    );

    cy.log("Tagged as possum or cat");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tags: '["possum", "cat"]', order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_COLUMNS
    );

    cy.log("'Any' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "any", order: '[["id", "ASC"]]' },
      [
        expectedRecording1,
        expectedRecording2,
        expectedRecording3,
        expectedRecording4,
      ],
      EXCLUDE_COLUMNS
    );

    cy.log("'untagged' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "untagged", order: '[["id", "ASC"]]' },
      [expectedRecording3],
      EXCLUDE_COLUMNS
    );

    cy.log("'tagged' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "tagged", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording4],
      EXCLUDE_COLUMNS
    );

    cy.log("'no-human' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "no-human", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2, expectedRecording3],
      EXCLUDE_COLUMNS
    );

    cy.log("'automatic-only' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "automatic-only", order: '[["id", "ASC"]]' },
      [expectedRecording1, expectedRecording2],
      EXCLUDE_COLUMNS
    );

    cy.log("'human-only' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "human-only", order: '[["id", "ASC"]]' },
      [expectedRecording4],
      EXCLUDE_COLUMNS
    );

    cy.log("'automatic+human' tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "automatic+human", order: '[["id", "ASC"]]' },
      [],
      EXCLUDE_COLUMNS
    );

    cy.log("tag (possum) and tagmode (automatic)");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      {
        where: {},
        tagMode: "automatic-only",
        tags: '["possum"]',
        order: '[["id", "ASC"]]',
      },
      [expectedRecording2],
      EXCLUDE_COLUMNS
    );
  });

  //TODO: Issue 94: invalid where, order parameters not caught - cause server error
  it.skip("Can handle invalid queries", () => {
    //cy.log("Where");
    //cy.apiRecordingsReportCheck( "rreGroupAdmin", {where: {badParameter: "bad value"}}, [], HTTP_Unprocessable);
    cy.log("Tagmode");
    cy.apiRecordingsReportCheck(
      "rreGroupAdmin",
      { where: {}, tagMode: "rubbish value" },
      [],
      EXCLUDE_COLUMNS,
      HTTP_Unprocessable
    );
    //cy.log("order");
    //cy.apiRecordingsReportCheck( "rreGroupAdmin", {where: {}, order: '["badParameter"]'}, [], HTTP_Unprocessable);
    //cy.log("unsupported parameter");
    //cy.apiRecordingsReportCheck( "rreGroupAdmin", {where: {}, badParameter: 11}, [], HTTP_Unprocessable);
  });

  //TODO: Issue 102 - FAILS.  view-mode is ignored
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it.skip("Super-user as user should see only their recordings", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);
      cy.apiGroupUserAdd(
        "rreGroupAdmin",
        superuser,
        "rreGroup",
        true,
        true,
        HTTP_OK200,
        { useRawUserName: true }
      );

      cy.apiRecordingsReportCheck(
        superuser,
        { where: {}, "view-mode": "user" },
        [expectedRecording3, expectedRecording4],
        EXCLUDE_COLUMNS
      );
      cy.apiGroupUserRemove(
        "rreGroupAdmin",
        superuser,
        "rreGroup",
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
