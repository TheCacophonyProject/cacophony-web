import { EXCLUDE_IDS_ARRAY, NOT_NULL } from "@commands/constants";
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
  ApiRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import {
  RecordingProcessingState,
  RecordingType,
  TagMode,
} from "@typedefs/api/consts";
import { TestGetLocationArray } from "@commands/api/station";
import { ApiTrackResponse } from "@typedefs/api/track";

describe("Recordings query using improved query API", () => {
  const superuser = getCreds("superuser")["email"];
  const suPassword = getCreds("superuser")["password"];

  const groupAdmin = "rqGroupAdmin";
  const group1 = "rqGroup";
  const group1Device1 = "rqCamera1";
  const group1Device2 = "rqCamera1b";

  const group2Admin = "rqGroup2Admin";
  const group2 = "rqGroup2";
  const group2Device1 = "rqCamera2";

  const group1Recordings = [];
  const group2Recordings = [];

  //Do not validate IDs or additionalMetadata
  //On test server, do not validate processingData, as recordings may be processed during test
  let EXCLUDE_PARAMS = [];
  if (Cypress.env("running_in_a_dev_environment") == true) {
    EXCLUDE_PARAMS = EXCLUDE_IDS_ARRAY.concat([
      "[].tracks[].tags[].data",
      "[].tracks[].tags[].path",
      "[].additionalMetadata",
      "[].comment",
    ]);
  } else {
    EXCLUDE_PARAMS = EXCLUDE_IDS_ARRAY.concat([
      "[].tracks[].tags[].data",
      "[].tracks[].tags[].path",
      "[].additionalMetadata",
      "[].processingState",
      "[].processing",
      "[].comment",
    ]);
  }
  const incrementDate = (date: string) => {
    const d = new Date(date);
    d.setSeconds(d.getSeconds() + 1);
    return d.toISOString();
  };

  const expectedTrack: ApiTrackResponse = {
    start: 2,
    end: 5,
    id: NOT_NULL,
    tags: [
      {
        what: "cat",
        model: "Master",
        automatic: true,
        confidence: 0.9,
        id: NOT_NULL,
        path: "all",
      },
    ],
  };

  const thermalRecordingResponse = {
    ...TEMPLATE_THERMAL_RECORDING_RESPONSE,
    tracks: [expectedTrack],
  };
  const audioRecordingResponse = { ...TEMPLATE_AUDIO_RECORDING_RESPONSE };
  delete thermalRecordingResponse["rawMimeType"];
  delete thermalRecordingResponse["comment"];
  delete thermalRecordingResponse["additionalMetadata"];
  delete audioRecordingResponse["rawMimeType"];
  delete audioRecordingResponse["comment"];
  delete audioRecordingResponse["additionalMetadata"];

  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(thermalRecordingResponse),
  );
  const templateExpectedAudioRecording: ApiAudioRecordingResponse = JSON.parse(
    JSON.stringify(audioRecordingResponse),
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
  //track4.predictions = [];
  const track5 = JSON.parse(JSON.stringify(TEMPLATE_AUDIO_TRACK));
  track5.start_s = 10;
  track5.end_s = 20;
  track5.minFreq = 20;
  track5.maxFreq = 10000;

  //Four recording templates for setting and their expected return values
  const recording1 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording1.duration = 15.6666666666667;
  recording1.recordingDateTime = "2021-07-17T20:13:17.248Z";
  recording1.location = TestGetLocationArray(1);
  recording1.metadata.tracks[0] = track1;
  let expectedRecording1: ApiThermalRecordingResponse;
  let expectedRecording2: ApiThermalRecordingResponse;
  let expectedRecording3: ApiAudioRecordingResponse;
  let expectedRecording4: ApiThermalRecordingResponse;

  const recording2 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording2.duration = 40;
  recording2.recordingDateTime = "2021-02-01T00:00:00.000Z";
  recording2.location = TestGetLocationArray(1, 0.3);
  recording2.metadata.tracks[0] = track2;
  recording2.processingState = RecordingProcessingState.Corrupt;

  const recording3 = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
  recording3.location = TestGetLocationArray(1);
  delete recording3.processingState;

  const recording4 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording4.duration = 40;
  recording4.recordingDateTime = "2021-01-01T00:00:00.000Z";
  recording4.location = TestGetLocationArray(1);
  recording4.metadata.tracks[0] = track4;

  const recording5 = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
  recording5.duration = 40;
  recording5.recordingDateTime = "2021-01-01T00:00:00.000Z";
  recording5.location = TestGetLocationArray(1);
  delete recording5.metadata.tracks;

  before(() => {
    //Create group1 with admin and 2 devices
    const createGroup1 = cy
      .testCreateUserGroupAndDevice(groupAdmin, group1, group1Device1)
      .then(() => cy.apiDeviceAdd(group1Device2, group1));
    //Create a 2nd group, admin & device
    const createGroup2 = cy.testCreateUserGroupAndDevice(
      group2Admin,
      group2,
      group2Device1,
    );

    //define intercept here to allow adding recordings in before() - normally intercept is
    //added in beforeEach
    cy.intercept("POST", "recordings").as("addRecording");

    createGroup1.then(() => {
      // SETUP group1
      //add some recordings to query
      cy.apiRecordingAdd(group1Device1, recording1, undefined, "rqRecording1")
        .then(() => {
          expectedRecording1 = TestCreateExpectedRecordingData(
            templateExpectedRecording,
            "rqRecording1",
            group1Device1,
            group1,
            null,
            recording1,
            false,
            true,
          );
          cy.apiRecordingsQueryV2Check(
            groupAdmin,
            getCreds(group1).id,
            new URLSearchParams({
              from: expectedRecording1.recordingDateTime,
              until: incrementDate(expectedRecording1.recordingDateTime),
            }),
            [expectedRecording1],
            EXCLUDE_PARAMS,
          ).then((body) => {
            group1Recordings.push(body.recordings[0]);
          });
        })
        .then(() =>
          cy
            .apiRecordingAdd(
              group1Device1,
              recording2,
              undefined,
              "rqRecording2",
            )
            .then(() => {
              expectedRecording2 = TestCreateExpectedRecordingData(
                templateExpectedRecording,
                "rqRecording2",
                group1Device1,
                group1,
                null,
                recording2,
                false,
                true,
              );
              expectedRecording2.tracks[0].start =
                recording2.metadata.tracks[0].start_s;
              expectedRecording2.tracks[0].end =
                recording2.metadata.tracks[0].end_s;
              expectedRecording2.tracks[0].tags[0].confidence =
                recording2.metadata.tracks[0].predictions[0].confidence;
              expectedRecording2.tracks[0].tags[0].what =
                recording2.metadata.tracks[0].predictions[0].confident_tag;
              expectedRecording2.processingState =
                RecordingProcessingState.Corrupt;
              cy.apiRecordingsQueryV2Check(
                groupAdmin,
                getCreds(group1).id,
                new URLSearchParams({
                  from: expectedRecording2.recordingDateTime,
                  until: incrementDate(expectedRecording2.recordingDateTime),
                }),
                [expectedRecording2],
                EXCLUDE_PARAMS,
              ).then((body) => {
                group1Recordings.push(body.recordings[0]);
              });
            }),
        )
        .then(() =>
          cy
            .apiRecordingAdd(
              group1Device2,
              recording3,
              undefined,
              "rqRecording3",
            )
            .then(() => {
              expectedRecording3 = TestCreateExpectedRecordingData(
                templateExpectedAudioRecording,
                "rqRecording3",
                group1Device2,
                group1,
                null,
                recording3,
                false,
                true,
              );
              delete expectedRecording3.version;
              delete expectedRecording3.batteryCharging;
              delete expectedRecording3.airplaneModeOn;
              delete expectedRecording3.relativeToDawn;
              delete expectedRecording3.relativeToDusk;
              expectedRecording3.processingState =
                RecordingProcessingState.Analyse;

              cy.apiRecordingsQueryV2Check(
                groupAdmin,
                getCreds(group1).id,
                new URLSearchParams({
                  from: expectedRecording3.recordingDateTime,
                  until: incrementDate(expectedRecording3.recordingDateTime),
                  "include-false-positives": true.toString(),
                }),
                [expectedRecording3],
                EXCLUDE_PARAMS,
              ).then((body) => {
                group1Recordings.push(body.recordings[0]);
              });
            }),
        )
        .then(() =>
          cy
            .apiRecordingAdd(
              group1Device2,
              recording4,
              undefined,
              "rqRecording4",
            )
            .then((id) => {
              expectedRecording4 = TestCreateExpectedRecordingData(
                templateExpectedRecording,
                "rqRecording4",
                group1Device2,
                group1,
                null,
                recording4,
                false,
                true,
              );
              expectedRecording4.processingState =
                RecordingProcessingState.Finished;

              cy.testUserAddTagRecording(id, 0, groupAdmin, "possum").then(
                () => {
                  expectedRecording4.tracks[0].tags[0].confidence = 0.97;
                  expectedRecording4.tracks[0].tags.push({
                    what: "possum",
                    automatic: false,
                    confidence: 0.7,
                    path: "all",
                    model: null,
                    id: -1,
                    userName: getTestName(groupAdmin),
                    userId: getCreds(groupAdmin).id,
                  });
                  cy.apiRecordingsQueryV2Check(
                    groupAdmin,
                    getCreds(group1).id,
                    new URLSearchParams({
                      from: expectedRecording4.recordingDateTime,
                      until: incrementDate(
                        expectedRecording4.recordingDateTime,
                      ),
                    }),
                    [expectedRecording4],
                    EXCLUDE_PARAMS,
                  ).then((body) => {
                    group1Recordings.push(body.recordings[0]);
                  });
                },
              );
            }),
        );
    });

    createGroup2.then(() => {
      // SETUP group2
      // Add 9 recordings.  3 Should be filtered out as false-positives.

      // Recording with no tracks
      cy.apiRecordingAddWithTracks(group2Device1);

      // Recording with no tracks, but a label of 'cool'
      cy.apiRecordingAddWithTracks(group2Device1).then((id) =>
        cy.apiRecordingTagAdd(
          group2Admin,
          id.toString(),
          "coolLabel1a",
          {
            detail: "cool",
            confidence: 0.85,
          },
          200,
          { useRawRecordingId: true },
        ),
      );
      // Recording with 1 track but no tags
      cy.apiRecordingAddWithTracks(group2Device1, []);
      // Recording with 1 false-positive
      cy.apiRecordingAddWithTracks(group2Device1, [["false-positive"]]);
      // Recording with *only* false-positives
      cy.apiRecordingAddWithTracks(group2Device1, [
        ["false-positive"],
        ["false-positive"],
      ]);
      // Recording with a mixture of false-positive and actual tagged tracks
      // 1 track should be filtered out, or only if the entire recordings' tracks are filtered out?
      cy.apiRecordingAddWithTracks(group2Device1, [
        ["cat"],
        ["false-positive"],
      ]);

      // Recording with only a non-false-positive track
      cy.apiRecordingAddWithTracks(group2Device1, [["cat"]]);

      // Recording with 1 track but no tags, then tagged by user
      cy.apiRecordingAddWithTracks(group2Device1, []).then((id) => {
        cy.testUserAddTagRecording(id, 0, group2Admin, "weasel");
      });

      // Recording with 1 track tagged as false-positive, then tagged by user
      cy.apiRecordingAddWithTracks(group2Device1, [["false-positive"]]).then(
        (id) => {
          cy.testUserAddTagRecording(id, 0, group2Admin, "possum");
        },
      );

      // Recording with 2 tracks, both AI tagged, and then 1 confirmed by user
      cy.apiRecordingAddWithTracks(group2Device1, [["cat"], ["cat"]]).then((id) => {
        cy.testUserAddTagRecording(id, 0, group2Admin, "cat");
      });

      // Recording with 1 non-false-positive track, corrected by user.
      cy.apiRecordingAddWithTracks(group2Device1, [["dog"]]).then((id) => {
        cy.testUserAddTagRecording(id, 0, group2Admin, "rodent");
      });

      // Recording with 1 non-false-positive track, confirmed by user.
      cy.apiRecordingAddWithTracks(group2Device1, [["pig"]]).then((id) => {
        cy.testUserAddTagRecording(id, 0, group2Admin, "pig");
      });

      // Recording with 1 non-false-positive track, turned to false-positive by user.
      cy.apiRecordingAddWithTracks(group2Device1, [["deer"]]).then((id) => {
        cy.testUserAddTagRecording(id, 0, group2Admin, "false-positive");
      });

      // Recording with 1 non-false-positive track, confirmed by user, then deleted.
      cy.apiRecordingAddWithTracks(group2Device1, [["rabbit"]]).then((id) => {
        cy.testUserAddTagRecording(id, 0, group2Admin, "rabbit").then(() => {
          cy.apiRecordingDelete(group2Admin, id.toString(), 200, {
            useRawRecordingId: true,
          });
        });
      });
    });
  });

  it("Group member can view all recordings in project (no filters)", () => {
    cy.apiRecordingsQueryV2Check(
      groupAdmin,
      getCreds(group1).id,
      new URLSearchParams({}),
      undefined,
      [],
      200,
      { "num-results": 3 },
    );
    cy.apiRecordingsQueryV2Check(
      groupAdmin,
      getCreds(group1).id,
      new URLSearchParams({
        "include-false-positives": true.toString(),
      }),
      undefined,
      [],
      200,
      { "num-results": 4 },
    );
    cy.apiRecordingsQueryV2Check(
      groupAdmin,
      getCreds(group1).id,
      new URLSearchParams({
        "tag-mode": TagMode.Any,
      }),
      undefined,
      [],
      200,
      { "num-results": 3 },
    );
    cy.apiRecordingsQueryV2Check(
      groupAdmin,
      getCreds(group1).id,
      new URLSearchParams({
        "tag-mode": TagMode.Any,
        "include-false-positives": true.toString(),
      }),
      undefined,
      [],
      200,
      { "num-results": 4 },
    );
  });

  it("Group member can view recordings in project with location(s)", () => {
    {
      cy.log("Check recordings at location 1 can be viewed correctly");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
          types: "thermal",
        }),
        [expectedRecording1, expectedRecording4],
        EXCLUDE_PARAMS,
      );
    }
    {
      cy.log("Check recording count can be viewed correctly");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
          types: "thermal",
        }),
        undefined,
        [],
        200,
        { "num-results": 2 },
      );
    }
    {
      cy.log(
        "Check that removing recording type filtering returns more results at this location",
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
        }),
        undefined,
        [],
        200,
        { "num-results": 2 },
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
          "include-false-positives": true.toString(),
        }),
        undefined,
        [],
        200,
        { "num-results": 3 },
      );
    }
    {
      cy.log(
        "Check we get the correct number of recordings setting a from date",
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
          from: "2021-05-17T20:13:17.248Z",
          "include-false-positives": true.toString(),
        }),
        undefined,
        [],
        200,
        { "num-results": 2 },
      );
    }
    {
      cy.log(
        "Check we get the correct number of recordings setting a from and until dates",
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
          from: "2021-05-17T20:13:17.248Z",
          until: "2021-06-17T20:13:17.248Z",
          "include-false-positives": true.toString(),
        }),
        undefined,
        [],
        200,
        { "num-results": 0 },
      );
    }
    {
      cy.log(
        "Check we get the correct number of recordings setting an until date",
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: String(group1Recordings[0].stationId),
          until: "2021-06-17T20:13:17.248Z",
          "include-false-positives": true.toString(),
        }),
        undefined,
        [],
        200,
        { "num-results": 1 },
      );
    }
  });

  it("Group member can query device's recordings", () => {
    {
      cy.log("Check recordings from device 1 can be viewed correctly");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          devices: getCreds(group1Device1).id.toString(),
          types: "thermal",
          "include-false-positives": true.toString(),
        }),
        [expectedRecording1, expectedRecording2],
        EXCLUDE_PARAMS,
      );
    }
    {
      cy.log("Check recordings from multiple devices can be viewed correctly");
      const queryParams = new URLSearchParams();
      queryParams.set("devices", getCreds(group1Device1).id.toString());
      queryParams.set("types", "thermal");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["devices", getCreds(group1Device1).id.toString()],
          ["devices", getCreds(group1Device2).id.toString()],
          ["include-false-positives", true.toString()],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 4,
        },
      );
    }
  });

  it("Tracks tagged by user should become the canonical tag for the track when searching tagged recordings", () => {
    cy.log(
      "Check that recordings tagged by AI as cat and subsequently corrected by a " +
        "human don't come up when searching for recordings tagged with cat.",
    );
    cy.apiRecordingsQueryV2Check(
      groupAdmin,
      getCreds(group1).id,
      new URLSearchParams({
        types: "thermal",
        "tagged-with": "cat",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 1,
      },
    );
  });

  it("Group member can view recordings filtered by tag and label", () => {
    {
      cy.log(
        "Check that recording tagged with cat AND labelled with cool doesn't exist",
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          types: "thermal",
          "tagged-with": "cat",
          "labelled-with": "cool",
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 0,
        },
      );

      cy.log("Add label 'cool' to recording");
      // Now add a label:
      cy.apiRecordingTagAdd(
        groupAdmin,
        group1Recordings[0].id.toString(),
        "coolLabel1",
        {
          detail: "cool",
          confidence: 0.85,
        },
        200,
        { useRawRecordingId: true },
      ).then(() => {
        cy.log(
          "Check that recording tagged with cat AND labelled with cool exists",
        );
        cy.apiRecordingsQueryV2Check(
          groupAdmin,
          getCreds(group1).id,
          new URLSearchParams({
            types: "thermal",
            "tagged-with": "cat",
            "labelled-with": "cool",
          }),
          undefined,
          EXCLUDE_PARAMS,
          200,
          {
            "num-results": 1,
          },
        );
      });
    }
    {
      cy.log(
        "Check that recording tagged with possum AND labelled with requires review doesn't exist",
      );
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          types: "thermal",
          "tagged-with": "possum",
          "labelled-with": "requires review",
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 0,
        },
      );

      cy.log("Add requires review label");
      cy.apiRecordingTagAdd(
        groupAdmin,
        group1Recordings[1].id.toString(),
        "flaggedLabel1",
        {
          detail: "requires review",
          confidence: 0.85,
        },
        200,
        { useRawRecordingId: true },
      ).then(() => {
        cy.log(
          "Check that recording tagged with possum AND labelled with requires review exists",
        );
        cy.apiRecordingsQueryV2Check(
          groupAdmin,
          getCreds(group1).id,
          new URLSearchParams({
            types: "thermal",
            "tagged-with": "possum",
            "labelled-with": "requires review",
          }),
          undefined,
          EXCLUDE_PARAMS,
          200,
          {
            "num-results": 1,
          },
        );
      });
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          "labelled-with": "requires review",
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 1,
        },
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["labelled-with", "requires review"],
          ["labelled-with", "cool"],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 2,
        },
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["tagged-with", "cat"],
          ["labelled-with", "requires review"],
          ["labelled-with", "cool"],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 1,
        },
      );
    }

    cy.apiRecordingTagDelete(
      groupAdmin,
      group1Recordings[0].id.toString(),
      "coolLabel1",
      200,
      { useRawRecordingId: true },
    );
    cy.apiRecordingTagDelete(
      groupAdmin,
      group1Recordings[1].id.toString(),
      "flaggedLabel1",
      200,
      { useRawRecordingId: true },
    );
  });

  it("Group member can view recordings filtered by tag", () => {
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          types: "thermal",
          "tagged-with": "cat",
        }),
        [expectedRecording1],
        EXCLUDE_PARAMS,
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          types: "thermal",
          "tagged-with": "mammal",
        }),
        [expectedRecording1, expectedRecording2, expectedRecording4],
        EXCLUDE_PARAMS,
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          types: "thermal",
          "tagged-with": "mammal",
          "sub-class-tags": false.toString(),
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 0,
        },
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          types: "thermal",
          "tagged-with": "cat",
          "sub-class-tags": false.toString(),
        }),
        [expectedRecording1],
        EXCLUDE_PARAMS,
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["types", RecordingType.ThermalRaw],
          ["tagged-with", "cat"],
          ["tagged-with", "mammal"],
          ["sub-class-tags", false.toString()],
        ]),
        [expectedRecording1],
        EXCLUDE_PARAMS,
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["types", RecordingType.ThermalRaw],
          ["tagged-with", "cat"],
          ["tagged-with", "possum"],
        ]),
        [expectedRecording1, expectedRecording2, expectedRecording4],
        EXCLUDE_PARAMS,
      );
    }
  });
  it("Group member can view recordings filtered by type", () => {
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          "include-false-positives": true.toString(),
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 4,
        },
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          "include-false-positives": true.toString(),
          types: RecordingType.Audio,
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 1,
        },
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          "include-false-positives": true.toString(),
          types: RecordingType.ThermalRaw,
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 3,
        },
      );
    }
    {
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["include-false-positives", true.toString()],
          ["types", RecordingType.ThermalRaw],
          ["types", RecordingType.Audio],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 4,
        },
      );
    }
  });

  it("Group member can view recordings filtered by device and location", () => {
    {
      cy.log("Check location where device never was");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams({
          locations: group1Recordings[1].stationId.toString(),
          devices: getCreds(group1Device2).id.toString(),
          "include-false-positives": true.toString(),
        }),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 0,
        },
      );
    }
    {
      cy.log("Check multiple locations one of which the device was in");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["locations", group1Recordings[1].stationId.toString()],
          ["locations", group1Recordings[0].stationId.toString()],
          ["devices", getCreds(group1Device2).id.toString()],
          ["include-false-positives", true.toString()],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 2,
        },
      );
    }
    {
      cy.log("Check multiple locations the device was in");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["locations", group1Recordings[1].stationId.toString()],
          ["locations", group1Recordings[0].stationId.toString()],
          ["devices", getCreds(group1Device1).id.toString()],
          ["include-false-positives", true.toString()],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 2,
        },
      );
    }
    {
      cy.log("Check locations that don't exist in the project");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["locations", "123456789"],
          ["locations", "987654321"],
          ["devices", getCreds(group1Device1).id.toString()],
          ["include-false-positives", true.toString()],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 0,
        },
      );
    }
    {
      cy.log("Check devices that don't exist in the project");
      cy.apiRecordingsQueryV2Check(
        groupAdmin,
        getCreds(group1).id,
        new URLSearchParams([
          ["locations", group1Recordings[1].stationId.toString()],
          ["locations", group1Recordings[0].stationId.toString()],
          ["devices", "123456789"],
          ["devices", "987654321"],
          ["include-false-positives", true.toString()],
        ]),
        undefined,
        EXCLUDE_PARAMS,
        200,
        {
          "num-results": 0,
        },
      );
    }
  });
  it("Group member does not see false-positive recordings by default", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({}),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 7,
      },
    );

    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "include-false-positives": true.toString(),
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 13,
      },
    );
  });

  it("Group member can view only untagged recordings", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.UnTagged,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 3,
      },
    );
  });
  it("Group member can view only untagged recordings that have a certain label", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.UnTagged,
        "labelled-with": "cool",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 1,
      },
    );
  });

  it("Group member can view recordings tagged-with false-positive", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tagged-with": "false-positive",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 3,
      },
    );
  });

  it("Group member can view recordings only untagged by a human", () => {
    // Should pick up automatic tags, and untagged tracks, and recordings without tracks
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.NoHuman,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 2,
      },
    );
  });

  it("Group member can view recordings only untagged by a human, including filtered tracks", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.NoHuman,
        "include-false-positives": true.toString(),
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 7,
      },
    );
  });

  it("Group member can view recordings tagged only by AI", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.AutomaticOnly,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 2,
      },
    );
  });

  it("Group member can view recordings tagged only by AI that have a specific tag", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.AutomaticOnly,
        "tagged-with": "cat",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 2,
      },
    );
  });

  it("Group member can view recordings tagged by both AI and a human", () => {
    // NOTE: By default we don't count if the AI and/or the human tagged a track as false-positive
    // The AI and human tags must agree.
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.AutomaticHumanUrlSafe,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 2,
      },
    );

  });

  it("Group member can view deleted recordings", () => {
    // NOTE: By default we don't count if the AI and/or the human tagged a track as false-positive
    // The AI and human tags must agree.
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.AutomaticHumanUrlSafe,
        "include-deleted": true.toString(),
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 3,
      },
    );
  });

  it("Group member can view recordings tagged by only a human", () => {
    // NOTE: Even if there is an AI false-positive tag and a human tag, we're counting
    //  that as human-only
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.HumanOnly,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 2,
      },
    );
  });

  it("Group member can view recordings tagged only by a human that have a specific tag", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.HumanOnly,
        "tagged-with": "mustelid",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 1,
      },
    );
  });

  it("Group member can't view recordings tagged only by a human whose tags are ancestors of a specific tag if subclass-tags is false", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.HumanOnly,
        "tagged-with": "mustelid",
        "sub-class-tags": false.toString(),
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 0,
      },
    );
  });

  it("Group member can view recordings that have an AI tag", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.AutomaticallyTagged,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 6,
      },
    );
  });

  it("Group member can view recordings that have a human tag", () => {
    // Even if there is a human tag correcting this, a non-false-positive AI
    // tag should still be searchable.
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.HumanTagged,
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 5,
      },
    );
  });

  it("Group member can view recordings tagged by a human that have a specific tag", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.HumanTagged,
        "tagged-with": "possum",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 1,
      },
    );
  });

  it("Group member can view recordings tagged by AI that have a specific tag", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "tag-mode": TagMode.AutomaticallyTagged,
        "tagged-with": "cat",
      }),
      undefined,
      EXCLUDE_PARAMS,
      200,
      {
        "num-results": 3,
      },
    );
  });

  it("Group member can limit number of results", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "max-results": "1",
      }),
      undefined,
      [],
      200,
      {
        "num-results": 1,
      },
    );
  });

  it("Group member can query recordings with a supplied processing state", () => {
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "processing-state": RecordingProcessingState.Finished,
      }),
      undefined,
      [],
      200,
      {
        "num-results": 7,
      },
    );
    cy.apiRecordingsQueryV2Check(
      group2Admin,
      getCreds(group2).id,
      new URLSearchParams({
        "processing-state": RecordingProcessingState.Analyse,
      }),
      undefined,
      [],
      200,
      {
        "num-results": 0,
      },
    );
  });
});
