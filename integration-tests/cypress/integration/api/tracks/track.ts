/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
  NOT_NULL,
  NOT_NULL_STRING,
} from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";

import { TestCreateRecordingData } from "@commands/api/recording-tests";
import {
  ApiTrackDataRequest,
  ApiTrackResponse,
  ApiTrackPosition,
} from "@typedefs/api/track";

import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

const EXCLUDE_IDS = ["[].id"];

describe("Tracks: add, check, delete", () => {
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
      tracks: [],
    },
    comment: "This is a comment",
    processingState: RecordingProcessingState.Finished,
  };

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
  };

  const track1: ApiTrackDataRequest = {
    start_s: 1,
    end_s: 3,
    positions: positions1,
    //TODO - do the remaining parameters _do_ anything?!
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

    //Add admin & member to Camera1
    cy.apiUserAdd("trkDeviceAdmin");
    cy.apiUserAdd("trkDeviceMember");
    cy.apiGroupUserAdd("trkGroupAdmin", "trkGroupMember", "trkGroup", true);
    cy.apiDeviceUserAdd("trkGroupAdmin", "trkDeviceAdmin", "trkCamera1", true);
    cy.apiDeviceUserAdd("trkGroupAdmin", "trkDeviceMember", "trkCamera1", true);

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
    cy.apiTrackCheck(
      "trkGroupAdmin",
      "trkRecording1",
      [expectedTrack],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackDelete("trkGroupAdmin", "trkRecording1", "trkTrack1");

    cy.log("Check track no longer exists");
    cy.apiTrackCheck("trkGroupAdmin", "trkRecording1", []);
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

    cy.log("Check recording tag can be viewed correctly");
    cy.apiTrackCheck(
      "trkGroupMember",
      "trkRecording2",
      [expectedTrack],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackDelete("trkGroupMember", "trkRecording2", "trkTrack2");

    cy.log("Check track no longer exists");
    cy.apiTrackCheck("trkGroupMember", "trkRecording2", []);
  });

  it("Device admin can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera1", recording1, undefined, "trkRecording3");

    cy.log("Add track to recording");
    cy.apiTrackAdd(
      "trkDeviceAdmin",
      "trkRecording3",
      "trkTrack3",
      "trkAlgorithm3",
      track1,
      algorithm1
    );

    cy.log("Check recording tag can be viewed correctly");
    cy.apiTrackCheck(
      "trkDeviceAdmin",
      "trkRecording3",
      [expectedTrack],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackDelete("trkGroupAdmin", "trkRecording3", "trkTrack3");

    cy.log("Check track no longer exists");
    cy.apiTrackCheck("trkDeviceAdmin", "trkRecording3", []);
  });

  it("Device member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera1", recording1, undefined, "trkRecording4");

    cy.log("Add track to recording");
    cy.apiTrackAdd(
      "trkDeviceMember",
      "trkRecording4",
      "trkTrack4",
      "trkAlgorithm4",
      track1,
      algorithm1
    );

    cy.log("Check recording tag can be viewed correctly");
    cy.apiTrackCheck(
      "trkDeviceMember",
      "trkRecording4",
      [expectedTrack],
      EXCLUDE_IDS
    );
    cy.log("Delete tag");
    cy.apiTrackDelete("trkDeviceMember", "trkRecording4", "trkTrack4");

    cy.log("Check track no longer exists");
    cy.apiTrackCheck("trkGroupAdmin", "trkRecording4", []);
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
    cy.apiTrackCheck("trkGroupAdmin", "trkRecording5", [], [], HTTP_Forbidden);

    cy.log("Check tag cannot be deleted by non group2 member");
    cy.apiTrackDelete(
      "trkGroupAdmin",
      "trkRecording5",
      "trkTrack5",
      HTTP_Forbidden
    );

    cy.log("Check track still exists");
    cy.apiTrackCheck(
      "trkGroup2Admin",
      "trkRecording5",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("Can set all valid parameters", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const minTrack = { start_s: 4, end_s: 7 };
    const expectedMinTrack = {
      id: -99,
      start: 4,
      end: 7,
      positions: [],
      tags: [],
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
    cy.apiTrackCheck(
      "trkGroup2Admin",
      "trkRecording6",
      [expectedTrack, expectedMinTrack],
      EXCLUDE_IDS
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
    recording1.metadata.tracks = [
      {
        start_s: 1,
        end_s: 3,
        predictions: [{ confident_tag: "cat", confidence: 0.9, model_id: 1 }],
        positions: positions1,
      },
    ];

    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrack.tags = [
      {
        automatic: true,
        confidence: 0.9,
        createdAt: NOT_NULL_STRING,
        //NOTE: assume this is model name and defaults to unknown where mode_id does not match known model?
        data: { name: "unknown" },
        id: NOT_NULL,
        trackId: NOT_NULL,
        updatedAt: NOT_NULL_STRING,
        what: "cat",
      },
    ];

    cy.log("Add recording as device");
    cy.apiRecordingAdd("trkCamera1", recording1, undefined, "trkRecording9");

    cy.log("Check recording tag can be viewed correctly");
    cy.apiTrackCheck(
      "trkGroupAdmin",
      "trkRecording9",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });
});
