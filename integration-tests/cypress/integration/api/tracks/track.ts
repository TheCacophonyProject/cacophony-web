/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
  NOT_NULL_STRING,
} from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";
import {
  TestCreateRecordingData,
  predictionResponseFromSet,
  positionResponseFromSet,
} from "@commands/api/recording-tests";
import {
  ApiTrackDataRequest,
  ApiTrackResponse,
  ApiTrackPosition,
} from "@typedefs/api/track";

import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_TRACK,
  TEMPLATE_EXPECTED_TRACK,
} from "@commands/dataTemplate";

const EXCLUDE_TRACK_IDS = ["[].id"];

describe("Tracks: add, check, delete", () => {
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );
  templateRecording.metadata.tracks = [];

  const positions1: ApiTrackPosition[] = [
    {
      x: 1,
      y: 2,
      width: 10,
      height: 20,
    },
    {
      x: 2,
      y: 3,
      width: 11,
      height: 21,
    },
  ];

  const expectedTrack1: ApiTrackResponse = {
    id: -99,
    start: 1,
    end: 3,
    positions: positions1,
    tags: [],
    filtered: true,
    automatic: true,
  };

  const track1: ApiTrackDataRequest = {
    start_s: 1,
    end_s: 3,
    positions: positions1,
    label: "a label",
    clarity: 0.9,
    message: "a message",
    tag: "a tag",
    tracker_version: 2,
  };

  const algorithm1 = {
    model_name: "inc3",
  };

  before(() => {
    //Create group1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("trkGroupAdmin", "trkGroup", "trkCamera1");
    cy.apiDeviceAdd("trkCamera1b", "trkGroup");
    cy.apiUserAdd("trkGroupMember");

    cy.apiGroupUserAdd("trkGroupAdmin", "trkGroupMember", "trkGroup", true);

    //Create group2 with admin and device
    cy.testCreateUserGroupAndDevice(
      "trkGroup2Admin",
      "trkGroup2",
      "trkCamera2"
    );
  });

  it("Group admin can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera1", recording1, undefined, "trkRecording1");

    cy.log("Add track to recording");
    cy.apiTrackAdd(
      "trkGroupAdmin",
      "trkRecording1",
      "trkTrack1",
      "trkAlgorithm1",
      track1,
      algorithm1
    );

    cy.log("Check recording tag can be viewed correctly");
    cy.apiTracksCheck(
      "trkGroupAdmin",
      "trkRecording1",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Check recording tag can be viewed correctly");
    cy.apiTrackCheck(
      "trkGroupAdmin",
      "trkRecording1",
      "trkTrack1",
      expectedTrack,
      EXCLUDE_TRACK_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackDelete("trkGroupAdmin", "trkRecording1", "trkTrack1");

    cy.log("Check track no longer exists");
    cy.apiTracksCheck("trkGroupAdmin", "trkRecording1", []);
    cy.apiTrackCheck(
      "trkGroupAdmin",
      "trkRecording1",
      "trkTrack1",
      undefined,
      null,
      HTTP_Forbidden
    );
  });

  it("Group member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera1", recording1, undefined, "trkRecording2");

    cy.log("Add track to recording");
    cy.apiTrackAdd(
      "trkGroupMember",
      "trkRecording2",
      "trkTrack2",
      "trkAlgorithm2",
      track1,
      algorithm1
    );

    cy.log("Check recording tracks tag can be viewed correctly");
    cy.apiTracksCheck(
      "trkGroupMember",
      "trkRecording2",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Check recording track tag can be viewed correctly");
    cy.apiTrackCheck(
      "trkGroupMember",
      "trkRecording2",
      "trkTrack2",
      expectedTrack,
      EXCLUDE_TRACK_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackDelete("trkGroupMember", "trkRecording2", "trkTrack2");

    cy.log("Check track no longer exists");
    cy.apiTracksCheck("trkGroupMember", "trkRecording2", []);
    cy.apiTrackCheck(
      "trkGroupMember",
      "trkRecording2",
      "trkTrack2",
      undefined,
      null,
      HTTP_Forbidden
    );
  });

  it("Cannot add, view or delete tracks from someone else's device", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera2", recording1, undefined, "trkRecording5");

    cy.log("Cannot add track to recording if not group2 member");
    cy.apiTrackAdd(
      "trkGroupAdmin",
      "trkRecording5",
      null,
      null,
      track1,
      algorithm1,
      HTTP_Forbidden
    );

    cy.log("But device member can add track to recording");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording5",
      "trkTrack5",
      "trkAlgorithm5",
      track1,
      algorithm1
    );

    cy.log("Check recording tag cannot be viewed by non- group2 member");
    cy.apiTracksCheck("trkGroupAdmin", "trkRecording5", [], [], HTTP_Forbidden);
    cy.apiTrackCheck(
      "trkGroupAdmin",
      "trkRecording5",
      "trkTrack5",
      undefined,
      [],
      HTTP_Forbidden
    );

    cy.log("Check tag cannot be deleted by non group2 member");
    cy.apiTrackDelete(
      "trkGroupAdmin",
      "trkRecording5",
      "trkTrack5",
      HTTP_Forbidden
    );

    cy.log("Check track still exists");
    cy.apiTracksCheck(
      "trkGroup2Admin",
      "trkRecording5",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Can set all valid parameters", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const minTrack = { start_s: 4, end_s: 7 };
    const expectedMinTrack: ApiTrackResponse = {
      id: -99,
      start: 4,
      end: 7,
//      positions: [],
//      TODO enable after merge
      tags: [],
      filtered: true,
      automatic: true,
    };
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera2", recording1, undefined, "trkRecording6");

    cy.log("Add track with mandarory params only");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      "trkAlgorithm6",
      minTrack as unknown as ApiTrackDataRequest,
      undefined
    );

    cy.log("Add track with all params");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6b",
      "trkAlgorithm6",
      track1,
      algorithm1
    );

    cy.log("Check both tracks added ok, ordered by start time");
    cy.apiTracksCheck(
      "trkGroup2Admin",
      "trkRecording6",
      [expectedTrack, expectedMinTrack],
      EXCLUDE_TRACK_IDS
    );
    cy.log("Check both tracks can be viewed singley");
    cy.apiTrackCheck(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      expectedMinTrack,
      EXCLUDE_TRACK_IDS
    );
    cy.apiTrackCheck(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6b",
      expectedTrack,
      EXCLUDE_TRACK_IDS
    );
  });

  //Issue #: Can add a track with no start or no end time, or invlaid values in data. No validation!
  it.skip("Can handle invalid parameters", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera2", recording1, undefined, "trkRecording6");

    cy.log("Add track with missing mandarory fields");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      "trkAlgorithm6",
      { start_s: 2 } as unknown as ApiTrackDataRequest,
      undefined,
      HTTP_Unprocessable
    );
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      "trkAlgorithm6",
      { end_s: 2 } as unknown as ApiTrackDataRequest,
      undefined,
      HTTP_Unprocessable
    );

    cy.log("Add track with invalid fields");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      "trkAlgorithm6",
      { badField: 2 } as unknown as ApiTrackDataRequest,
      undefined,
      HTTP_Unprocessable
    );

    cy.log("Add track with invalid field values");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      "trkAlgorithm6",
      {
        start_s: 1,
        end_s: 2,
        positions: "badValue",
      } as unknown as ApiTrackDataRequest,
      undefined,
      HTTP_Unprocessable
    );

    cy.log("Add track with invalid algorithm field values");
    cy.apiTrackAdd(
      "trkGroup2Admin",
      "trkRecording6",
      "trkTrack6",
      "trkAlgorithm6",
      { start_s: 1, end_s: 2 } as unknown as ApiTrackDataRequest,
      "bad value",
      HTTP_Unprocessable
    );
  });

  it("Can handle invalid recording", () => {
    cy.log("Correct rejection of non existant recording");
    cy.apiTrackAdd(
      "trkGroupAdmin",
      "99999",
      "trkTrack8",
      "trkAlgorithm8",
      track1,
      algorithm1,
      HTTP_Forbidden,
      { useRawRecordingId: true }
    );
  });

  it("Can retrieve track and tag data uploaded by device", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    recording1.metadata.tracks = [JSON.parse(JSON.stringify(TEMPLATE_TRACK))];

    const expectedTrack = JSON.parse(JSON.stringify(TEMPLATE_EXPECTED_TRACK));
    expectedTrack.tags[0]["createdAt"] = NOT_NULL_STRING;
    expectedTrack.tags[0]["updatedAt"] = NOT_NULL_STRING;
    expectedTrack.tags[0]["data"] = predictionResponseFromSet(
      recording1.metadata.tracks[0].predictions,
      recording1.metadata.models
    )[0];
    expectedTrack.positions=positionResponseFromSet(recording1.metadata.tracks[0].positions);
    //TODO enable after merge
   
    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera1", recording1, undefined, "trkRecording9");

    cy.log("Check recording tracks tag can be viewed correctly");
    cy.apiTracksCheck(
      "trkGroupAdmin",
      "trkRecording9",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });
});
