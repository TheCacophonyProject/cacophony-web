/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
  HTTP_BadRequest,
  NOT_NULL,
} from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";
import { getTestName } from "@commands/names";

import { TestCreateRecordingData } from "@commands/api/recording-tests";
import {
  ApiTrackDataRequest,
  ApiTrackResponse,
  ApiTrackPosition,
} from "@typedefs/api/track";
import {
  ApiTrackTagRequest,
  ApiHumanTrackTagResponse,
} from "@typedefs/api/trackTag";

const EXCLUDE_IDS = ["[].id", "[].tags[].id", "[].tags[].trackId"];

describe("Track Tags: replaceTag, check, delete", () => {
  const templateRecording: ApiRecordingSet = {
    type: "thermalRaw",
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
    processingState: "FINISHED",
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

  const tag1: ApiTrackTagRequest = {
    what: "possum",
    confidence: 0.95,
    automatic: false,
    //data: {fieldName: "fieldValue"}
  };

  const tag2: ApiTrackTagRequest = {
    what: "cat",
    confidence: 0.54,
    automatic: false,
    //data: {fieldName: "fieldValue"}
  };

  const expectedTag1: ApiHumanTrackTagResponse = {
    confidence: 0.95,
    createdAt: NOT_NULL,
    //TODO: cannot set data above, retuned as blank sting
    //data: { "a parameter": "a value" },
    data: "",
    id: 99,
    automatic: false,
    trackId: 99,
    updatedAt: NOT_NULL,
    what: "possum",
    //TODO: userId is missing in returned data
    // userId: 99
    userName: "xxx",
  };

  const expectedTag2: ApiHumanTrackTagResponse = {
    confidence: 0.54,
    createdAt: NOT_NULL,
    //TODO: cannot set data above, retuned as blank sting
    //data: { "a parameter": "a value" },
    data: "",
    id: 99,
    automatic: false,
    trackId: 99,
    updatedAt: NOT_NULL,
    what: "cat",
    //TODO: userId is missing in returned data
    // userId: 99
    userName: "xxx",
  };

  const partTag = {
    what: "part",
    confidence: 0.45,
    automatic: false,
  };
  const expectedPartTag = {
    what: "part",
    confidence: 0.45,
    automatic: false,
    createdAt: NOT_NULL,
    data: "",
    id: 99,
    trackId: 99,
    updatedAt: NOT_NULL,
    userName: "xxx",
  };

  const poorTrackingTag = {
    what: "poor tracking",
    confidence: 0.46,
    automatic: false,
  };
  const expectedPoorTrackingTag = {
    what: "poor tracking",
    confidence: 0.46,
    automatic: false,
    createdAt: NOT_NULL,
    data: "",
    id: 99,
    trackId: 99,
    updatedAt: NOT_NULL,
    userName: "xxx",
  };
  const algorithm1 = {
    model_name: "inc3",
  };

  before(() => {
    //Create group1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("ttgGroupAdmin", "ttgGroup", "ttgCamera1");
    cy.apiDeviceAdd("ttgCamera1b", "ttgGroup");
    cy.apiUserAdd("ttgGroupMember");

    //Add admin & member to Camera1
    cy.apiUserAdd("ttgDeviceAdmin");
    cy.apiUserAdd("ttgDeviceMember");
    cy.apiGroupUserAdd("ttgGroupAdmin", "ttgGroupMember", "ttgGroup", true);
    cy.apiDeviceUserAdd("ttgGroupAdmin", "ttgDeviceAdmin", "ttgCamera1", true);
    cy.apiDeviceUserAdd("ttgGroupAdmin", "ttgDeviceMember", "ttgCamera1", true);

    //Create group2 with admin and device
    cy.testCreateUserGroupAndDevice(
      "ttgGroup2Admin",
      "ttgGroup2",
      "ttgCamera2"
    );

    //Create non member user
    cy.apiUserAdd("ttgNonMember");
  });

  it("Group admin can add, view and delete device's track tags", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgGroupAdmin");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttgGroupAdmin").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording1");
    cy.apiTrackAdd(
      "ttgGroupAdmin",
      "ttgRecording1",
      "ttgTrack1",
      "ttgAlgorithm1",
      track1,
      algorithm1
    );

    cy.log("Group admin can tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
      "ttgRecording1",
      "ttgTrack1",
      "ttgTag1",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttgGroupAdmin",
      "ttgRecording1",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgGroupAdmin",
      "ttgRecording1",
      "ttgTrack1",
      "ttgTag1"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttgGroupAdmin",
      "ttgRecording1",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("Group member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgGroupMember");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording2");
    cy.apiTrackAdd(
      "ttgGroupMember",
      "ttgRecording2",
      "ttgTrack2",
      "ttgAlgorithm2",
      track1,
      algorithm1
    );

    cy.log("Can tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgGroupMember",
      "ttgRecording2",
      "ttgTrack2",
      "ttgTag2",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttgGroupMember",
      "ttgRecording2",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgGroupMember",
      "ttgRecording2",
      "ttgTrack2",
      "ttgTag2"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttgGroupMember",
      "ttgRecording2",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("Device admin can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgDeviceAdmin");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording3");
    cy.apiTrackAdd(
      "ttgDeviceAdmin",
      "ttgRecording3",
      "ttgTrack3",
      "ttgAlgorithm3",
      track1,
      algorithm1
    );

    cy.log("Can tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceAdmin",
      "ttgRecording3",
      "ttgTrack3",
      "ttgTag3",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttgDeviceAdmin",
      "ttgRecording3",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgDeviceAdmin",
      "ttgRecording3",
      "ttgTrack3",
      "ttgTag3"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttgDeviceAdmin",
      "ttgRecording3",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("Device member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording4");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording4",
      "ttgTrack4",
      "ttgAlgorithm4",
      track1,
      algorithm1
    );

    cy.log("Can tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording4",
      "ttgTrack4",
      "ttgTag4",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording4",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgDeviceMember",
      "ttgRecording4",
      "ttgTrack4",
      "ttgTag4"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording4",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("User cannot tag recording they don't own without additional JWT", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording5");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording5",
      "ttgTrack5",
      "ttgAlgorithm5",
      track1,
      algorithm1
    );

    cy.log("Non owner cannot tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgGroup2Admin",
      "ttgRecording5",
      "ttgTrack5",
      "ttgTag5",
      tag1,
      HTTP_Forbidden
    );

    cy.log("Check tag does not exist");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording5",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("Cannot delete tag for device that user does not own", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording6");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording6",
      "ttgTrack6",
      "ttgAlgorithm6",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording6",
      "ttgTrack6",
      "ttgTag6",
      tag1
    );

    cy.log("Non member cannot delete tag");
    cy.apiTrackTagDelete(
      "ttgGroup2Admin",
      "ttgRecording6",
      "ttgTrack6",
      "ttgTag6",
      HTTP_Forbidden
    );

    cy.log("Check tag still exists");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording6",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );
  });

  it("But member can delete another user's tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording7");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording7",
      "ttgTrack7",
      "ttgAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording7",
      "ttgTrack7",
      "ttgTag7",
      tag1
    );

    cy.log("Another member of same group member can delete another's tag");
    cy.apiTrackTagDelete(
      "ttgGroupMember",
      "ttgRecording7",
      "ttgTrack7",
      "ttgTag7"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording7",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it("User can replace their own track tag with a new one", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag1 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag1.tags = [expectedTag1];
    expectedTrackWithTag1.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTag1.tags[0].userId=getCreds("ttgGroupMember").id;
    const expectedTrackWithTag2 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag2.tags = [expectedTag2];
    expectedTrackWithTag2.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTag2.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording7");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording7",
      "ttgTrack7",
      "ttgAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording7",
      "ttgTrack7",
      "ttgTag7",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording7",
      [expectedTrackWithTag1],
      EXCLUDE_IDS
    );

    cy.log("Member can replace their tag with a new one");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording7",
      "ttgTrack7",
      "ttgTag7",
      tag2
    );

    cy.log("Check new tag has replaced old one");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording7",
      [expectedTrackWithTag2],
      EXCLUDE_IDS
    );
  });

  it("User cannot add duplicate to their own track tag with a new one", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag1 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag1.tags = [expectedTag1];
    expectedTrackWithTag1.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTag1.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording8");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording8",
      "ttgTrack8",
      "ttgAlgorithm8",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording8",
      "ttgTrack8",
      "ttgTag8",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording8",
      [expectedTrackWithTag1],
      EXCLUDE_IDS
    );

    cy.log("Member cannot add duplicated tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording8",
      "ttgTrack8",
      "ttgTag8",
      tag1
    );

    cy.log("Check just one tag shown");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording8",
      [expectedTrackWithTag1],
      EXCLUDE_IDS
    );
  });

  it("User can add duplicate to another user's track tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    const tag1a=JSON.parse(JSON.stringify(tag1));
    const tag1b=JSON.parse(JSON.stringify(tag1));
    tag1a.confidence=0.900;
    tag1b.confidence=0.901;

    expectedTrackWithTags.tags = [
      JSON.parse(JSON.stringify(expectedTag1)),
      JSON.parse(JSON.stringify(expectedTag1)),
    ];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgGroupMember");
    expectedTrackWithTags.tags[0].confidence = 0.900;
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgDeviceMember").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgDeviceMember");
    expectedTrackWithTags.tags[1].confidence = 0.901;
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording9");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording9",
      "ttgTrack9",
      "ttgAlgorithm9",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroupMember",
      "ttgRecording9",
      "ttgTrack9",
      "ttgTag9",
      tag1a
    );

    cy.log("Another member can add duplicated tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording9",
      "ttgTrack9",
      "ttgTag9",
      tag1b
    );

    cy.log("Check both tags shown");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording9",
      [expectedTrackWithTags],
      EXCLUDE_IDS
    );
  });

  it("User can add different track tag to another user and both are retained", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags.tags = [
      JSON.parse(JSON.stringify(expectedTag2)),
      JSON.parse(JSON.stringify(expectedTag1)),
    ];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgDeviceMember").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgGroupMember");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording10");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording10",
      "ttgTrack10",
      "ttgAlgorithm10",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroupMember",
      "ttgRecording10",
      "ttgTrack10",
      "ttgTag10",
      tag1
    );

    cy.log("Another member can add different tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording10",
      "ttgTrack10",
      "ttgTag10",
      tag2
    );

    cy.log("Check both tags shown");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording10",
      [expectedTrackWithTags],
      EXCLUDE_IDS
    );
  });

  //Supplementary tags are currently "part" and "poor tracking"
  it("Supplementary tags are added in addition to primary tags", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));

    expectedTrackWithTags.tags = [
      expectedPoorTrackingTag,
      expectedPartTag,
      expectedTag1,
    ];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgDeviceMember").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;
    expectedTrackWithTags.tags[2].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[2].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording11");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording11",
      "ttgTrack11",
      "ttgAlgorithm11",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording11",
      "ttgTrack11",
      "ttgTag11",
      tag1
    );

    cy.log("Same member can add supplementary tags");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording11",
      "ttgTrack11",
      "ttgTag11",
      partTag
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording11",
      "ttgTrack11",
      "ttgTag11",
      poorTrackingTag
    );

    cy.log("Check all three tags shown");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording11",
      [expectedTrackWithTags],
      EXCLUDE_IDS
    );
  });

  it("Duplicate supplementary tags from same user are not added", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));

    expectedTrackWithTags.tags = [expectedPartTag, expectedTag1];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgDeviceMember").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording12");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording12",
      "ttgTrack12",
      "ttgAlgorithm12",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording12",
      "ttgTrack12",
      "ttgTag12",
      tag1
    );

    cy.log("Same member can add supplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording12",
      "ttgTrack12",
      "ttgTag12",
      partTag
    );

    cy.log("But cannot add duplicate supplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording12",
      "ttgTrack12",
      "ttgTag12",
      partTag
    );

    cy.log("Check only two tags shown");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording12",
      [expectedTrackWithTags],
      EXCLUDE_IDS
    );
  });

  it("Duplicate suplementary tags from different users are allowed", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));

    expectedTrackWithTags.tags = [
      JSON.parse(JSON.stringify(expectedPartTag)),
      JSON.parse(JSON.stringify(expectedPartTag)),
      expectedTag1,
    ];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgDeviceAdmin");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgDeviceMember").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;
    expectedTrackWithTags.tags[2].userName = getTestName("ttgDeviceMember");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording13");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgAlgorithm13",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tag1
    );

    cy.log("Same member can add supplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      partTag
    );

    cy.log("And another member can add same suplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceAdmin",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      partTag
    );

    cy.log("Check both duplicate supplementary tags shown (and primary tag)");
    cy.apiTrackCheck(
      "ttgDeviceMember",
      "ttgRecording13",
      [expectedTrackWithTags],
      EXCLUDE_IDS
    );
  });

  it("Correct handling in invalid recording, track", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording14");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording14",
      "ttgTrack14",
      "ttgAlgorithm14",
      track1,
      algorithm1
    );

    cy.log("Correct handling on invalid recording id in replace");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "99999",
      "99999",
      "ttgTag14",
      tag1,
      HTTP_Forbidden,
      { useRawRecordingId: true, useRawTrackId: true }
    );

    cy.log("Correct handling on invalid track id in replace");
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording14",
      "99999",
      "ttgTag14",
      tag1,
      HTTP_Forbidden,
      { useRawTrackId: true }
    );

    cy.log("Correct handling on invalid recording id in delete");
    cy.apiTrackTagDelete(
      "ttgDeviceMember",
      "99999",
      "99999",
      "99999",
      HTTP_Forbidden,
      { useRawRecordingId: true, useRawTrackId: true, useRawTagId: true }
    );

    cy.log("Correct handling on invalid track id in delete");
    //FIXME: Expect forbidden but get badrequest
    //cy.apiTrackTagDelete("ttgDeviceMember", "ttgRecording14", "99999", "99999", HTTP_Forbidden, {useRawTrackId: true, useRawTagId: true});
    cy.apiTrackTagDelete(
      "ttgDeviceMember",
      "ttgRecording14",
      "99999",
      "99999",
      HTTP_BadRequest,
      { useRawTrackId: true, useRawTagId: true }
    );

    cy.log("Correct handling on invalid tag id in delete");
    //FIXME: Expect forbidden but get badrequest
    //cy.apiTrackTagDelete("ttgDeviceMember", "ttgRecording14", "ttgTrack14", "99999", HTTP_Forbidden, {useRawTagId: true});
    cy.apiTrackTagDelete(
      "ttgDeviceMember",
      "ttgRecording14",
      "ttgTrack14",
      "99999",
      HTTP_BadRequest,
      { useRawTagId: true }
    );
  });

  it("Correct handling of invalid parameters", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));

    const tag1 = {
      what: "possum",
      confidence: 0.95,
      automatic: false,
      //data: {fieldName: "fieldValue"}
    };

    expectedTrackWithTags.tags = [];

    cy.log("Add recording, track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording13");
    cy.apiTrackAdd(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgAlgorithm13",
      track1,
      algorithm1
    );

    cy.log("Missing 'what'");
    const tagA = JSON.parse(JSON.stringify(tag1));
    delete tagA.what;
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagA,
      HTTP_Unprocessable,
      { message: "body.what:" }
    );

    cy.log("Missing 'confidence'");
    const tagB = JSON.parse(JSON.stringify(tag1));
    delete tagB.confidence;
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagB,
      HTTP_Unprocessable,
      { message: "body.confidence:" }
    );

    cy.log("Missing 'automatic'");
    const tagC = JSON.parse(JSON.stringify(tag1));
    delete tagC.automatic;
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagC,
      HTTP_Unprocessable,
      { message: "body.automatic:" }
    );

    cy.log("Invalid confidence");
    const tagD = JSON.parse(JSON.stringify(tag1));
    tagD.confidence = "Hello";
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagD,
      HTTP_Unprocessable,
      { message: "body.confidence:" }
    );

    cy.log("Invalid automatic");
    const tagE = JSON.parse(JSON.stringify(tag1));
    tagE.automatic = "Hello";
    cy.apiTrackTagReplaceTag(
      "ttgDeviceMember",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagE,
      HTTP_Unprocessable,
      { message: "body.automatic:" }
    );
  });
});
