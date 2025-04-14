import { NOT_NULL_STRING, NOT_NULL } from "@commands/constants";

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
import {
  TEMPLATE_AUDIO_RECORDING,
  TEMPLATE_THERMAL_RECORDING,
} from "@commands/dataTemplate";
import { HttpStatusCode } from "@typedefs/api/consts";

const EXCLUDE_TRACK_IDS = [
  "[].id",
  "[].tags[].id",
  "[].tags[].path",
  "[].tags[].trackId",
  "[].tags[].userId",
];

describe("Track Tags: replaceTag, check, delete", () => {
  //template recording with no tracks - add tracks during test
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );
  const templateAudioRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING)
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

  const audioTrack: ApiTrackDataRequest = {
    start_s: 0,
    end_s: 3,
    minFreq: 10,
    maxFreq: 1000,
    positions: [],
    automatic: false,
  };

  const expectedAudioTrack: ApiTrackResponse = {
    start: 0,
    end: 3,
    minFreq: 10,
    maxFreq: 1000,
    id: NOT_NULL,
    filtered: true,
    //    positions: [],
    //    TODO: enable after merge
    tags: [],
  };

  const tag1: ApiTrackTagRequest = {
    what: "possum",
    confidence: 0.95,
    automatic: false,
  };

  const tag2: ApiTrackTagRequest = {
    what: "cat",
    confidence: 0.54,
    automatic: false,
  };

  const audioTag: ApiTrackTagRequest = {
    what: "morepork",
    confidence: 1,
    automatic: false,
  };

  const expectedTag1: ApiHumanTrackTagResponse = {
    confidence: 0.95,
    createdAt: NOT_NULL_STRING,
    model: null,
    path: "all",
    id: 99,
    automatic: false,
    trackId: 99,
    updatedAt: NOT_NULL_STRING,
    what: "possum",
    userName: "xxx",
    userId: NOT_NULL,
  };

  const expectedTag2: ApiHumanTrackTagResponse = {
    confidence: 0.54,
    createdAt: NOT_NULL_STRING,
    model: null,
    path: "all",
    id: 99,
    automatic: false,
    trackId: 99,
    updatedAt: NOT_NULL_STRING,
    what: "cat",
    userName: "xxx",
    userId: NOT_NULL,
  };

  const expectedAudioTag: ApiHumanTrackTagResponse = {
    confidence: 1,
    createdAt: NOT_NULL_STRING,
    model: null,
    path: "all",
    id: 99,
    automatic: false,
    trackId: 99,
    updatedAt: NOT_NULL_STRING,
    what: "morepork",
    userName: "xxx",
    userId: NOT_NULL,
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
    createdAt: NOT_NULL_STRING,
    model: null,
    path: "all",
    id: 99,
    trackId: 99,
    updatedAt: NOT_NULL_STRING,
    userName: "xxx",
    userId: NOT_NULL,
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
    createdAt: NOT_NULL_STRING,
    model: null,
    path: "all",
    id: 99,
    trackId: 99,
    updatedAt: NOT_NULL_STRING,
    userName: "xxx",
    userId: NOT_NULL,
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
    cy.apiUserAdd("ttgGroup1Member2");
    cy.apiUserAdd("ttgGroup1Member3");
    cy.apiGroupUserAdd("ttgGroupAdmin", "ttgGroupMember", "ttgGroup", true);
    cy.apiGroupUserAdd("ttgGroupAdmin", "ttgGroup1Member2", "ttgGroup", true);
    cy.apiGroupUserAdd("ttgGroupAdmin", "ttgGroup1Member3", "ttgGroup", true);

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
    expectedTrackWithTag.filtered = false;
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
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording1",
      [expectedTrackWithTag],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgGroupAdmin",
      "ttgRecording1",
      "ttgTrack1",
      "ttgTag1"
    );

    cy.log("Check tag no longer exists");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording1",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Group member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.filtered = false;
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
    cy.apiTracksCheck(
      "ttgGroupMember",
      "ttgRecording2",
      [expectedTrackWithTag],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgGroupMember",
      "ttgRecording2",
      "ttgTrack2",
      "ttgTag2"
    );

    cy.log("Check tag no longer exists");
    cy.apiTracksCheck(
      "ttgGroupMember",
      "ttgRecording2",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Can add, view and delete audio tags", () => {
    const recording3 = TestCreateRecordingData(templateAudioRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedAudioTrack));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedAudioTrack));
    expectedTrackWithTag.filtered = false;
    expectedTrackWithTag.tags = [expectedAudioTag];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgGroupAdmin");

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording3, undefined, "ttgRecording3");
    cy.apiTrackAdd(
      "ttgGroupAdmin",
      "ttgRecording3",
      "ttgTrack3",
      "ttgAlgorithm3",
      audioTrack,
      algorithm1
    );

    cy.log("Group admin can tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
      "ttgRecording3",
      "ttgTrack3",
      "ttgTag3",
      audioTag
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording3",
      [expectedTrackWithTag],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgGroupAdmin",
      "ttgRecording3",
      "ttgTrack3",
      "ttgTag3"
    );

    cy.log("Check tag no longer exists");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording3",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Can add and view extended user data on audio tags", () => {
    const recording3 = TestCreateRecordingData(templateAudioRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedAudioTrack));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedAudioTrack));
    expectedTrackWithTag.filtered = false;
    expectedTrackWithTag.tags = [expectedAudioTag];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgGroupAdmin");

    cy.log("Add recording and track");
    cy.apiRecordingAdd(
      "ttgCamera1",
      recording3,
      undefined,
      "recordingWithUserData"
    );
    cy.apiTrackAdd(
      "ttgGroupAdmin",
      "recordingWithUserData",
      "trackWithUserData",
      "ttgAlgorithm3",
      audioTrack,
      algorithm1
    );

    cy.log("Group admin can tag the track");
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
      "recordingWithUserData",
      "trackWithUserData",
      "userDataTag",
      {
        ...audioTag,
        data: JSON.stringify({
          gender: "male",
          maturity: "adult",
        }),
      }
    );

    cy.log("Check recording track & tag can be viewed correctly");
    const expectedTrackWithTagWithUserData = JSON.parse(
      JSON.stringify(expectedAudioTrack)
    );
    expectedTrackWithTagWithUserData.tags = [expectedAudioTag];
    expectedTrackWithTagWithUserData.filtered = false;
    expectedTrackWithTagWithUserData.tags[0].userName =
      getTestName("ttgGroupAdmin");
    expectedTrackWithTagWithUserData.tags[0].data = {
      gender: "male",
      maturity: "adult",
    };
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "recordingWithUserData",
      [expectedTrackWithTagWithUserData],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttgGroupAdmin",
      "recordingWithUserData",
      "trackWithUserData",
      "userDataTag"
    );

    cy.log("Check tag no longer exists");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "recordingWithUserData",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("User cannot tag recording they don't own without additional JWT", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording5");
    cy.apiTrackAdd(
      "ttgGroupAdmin",
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
      HttpStatusCode.Forbidden
    );

    cy.log("Check tag does not exist");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording5",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Cannot delete tag for device that user does not own", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.filtered = false;
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttgGroupAdmin");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording6");
    cy.apiTrackAdd(
      "ttgGroupAdmin",
      "ttgRecording6",
      "ttgTrack6",
      "ttgAlgorithm6",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
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
      HttpStatusCode.Forbidden
    );

    cy.log("Check tag still exists");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording6",
      [expectedTrackWithTag],
      EXCLUDE_TRACK_IDS
    );
  });

  it("But member can delete another user's tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording7");
    cy.apiTrackAdd(
      "ttgGroupAdmin",
      "ttgRecording7",
      "ttgTrack7",
      "ttgAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
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
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording7",
      [expectedTrack],
      EXCLUDE_TRACK_IDS
    );
  });

  it("User can replace their own track tag with a new one", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag1 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag1.filtered = false;
    expectedTrackWithTag1.tags = [expectedTag1];
    expectedTrackWithTag1.tags[0].userName = getTestName("ttgGroupAdmin");
    //expectedTrackWithTag1.tags[0].userId=getCreds("ttgGroupMember").id;
    const expectedTrackWithTag2 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag2.filtered = false;
    expectedTrackWithTag2.tags = [expectedTag2];
    expectedTrackWithTag2.tags[0].userName = getTestName("ttgGroupAdmin");
    //expectedTrackWithTag2.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording7");
    cy.apiTrackAdd(
      "ttgGroupAdmin",
      "ttgRecording7",
      "ttgTrack7",
      "ttgAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
      "ttgRecording7",
      "ttgTrack7",
      "ttgTag7",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording7",
      [expectedTrackWithTag1],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Member can replace their tag with a new one");
    cy.apiTrackTagReplaceTag(
      "ttgGroupAdmin",
      "ttgRecording7",
      "ttgTrack7",
      "ttgTag7",
      tag2
    );

    cy.log("Check new tag has replaced old one");
    cy.apiTracksCheck(
      "ttgGroupAdmin",
      "ttgRecording7",
      [expectedTrackWithTag2],
      EXCLUDE_TRACK_IDS
    );
  });

  it("User cannot add duplicate to their own track tag with a new one", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag1 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag1.filtered = false;
    expectedTrackWithTag1.tags = [expectedTag1];
    expectedTrackWithTag1.tags[0].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTag1.tags[0].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording8");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
      "ttgRecording8",
      "ttgTrack8",
      "ttgAlgorithm8",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording8",
      "ttgTrack8",
      "ttgTag8",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTracksCheck(
      "ttgGroup1Member2",
      "ttgRecording8",
      [expectedTrackWithTag1],
      EXCLUDE_TRACK_IDS
    );

    cy.log("Member cannot add duplicated tag");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording8",
      "ttgTrack8",
      "ttgTag8",
      tag1
    );

    cy.log("Check just one tag shown");
    cy.apiTracksCheck(
      "ttgGroup1Member2",
      "ttgRecording8",
      [expectedTrackWithTag1],
      EXCLUDE_TRACK_IDS
    );
  });

  it("User can add duplicate to another user's track tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    const tag1a = JSON.parse(JSON.stringify(tag1));
    const tag1b = JSON.parse(JSON.stringify(tag1));
    tag1a.confidence = 0.9;
    tag1b.confidence = 0.901;

    expectedTrackWithTags.tags = [
      JSON.parse(JSON.stringify(expectedTag1)),
      JSON.parse(JSON.stringify(expectedTag1)),
    ];
    expectedTrackWithTags.filtered = false;
    expectedTrackWithTags.tags[0].userName = getTestName("ttgGroupMember");
    expectedTrackWithTags.tags[0].confidence = 0.9;
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgGroup1Member2").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgGroup1Member2");
    expectedTrackWithTags.tags[1].confidence = 0.901;
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording9");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
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
      "ttgGroup1Member2",
      "ttgRecording9",
      "ttgTrack9",
      "ttgTag9",
      tag1b
    );

    cy.log("Check both tags shown");
    cy.apiTracksCheck(
      "ttgGroup1Member2",
      "ttgRecording9",
      [expectedTrackWithTags],
      EXCLUDE_TRACK_IDS
    );
  });

  it("User can add different track tag to another user and both are retained", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags.tags = [
      JSON.parse(JSON.stringify(expectedTag2)),
      JSON.parse(JSON.stringify(expectedTag1)),
    ];
    expectedTrackWithTags.filtered = false;
    expectedTrackWithTags.tags[0].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgGroup1Member2").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgGroupMember");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording10");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
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
      "ttgGroup1Member2",
      "ttgRecording10",
      "ttgTrack10",
      "ttgTag10",
      tag2
    );

    cy.log("Check both tags shown");
    cy.apiTracksCheck(
      "ttgGroup1Member2",
      "ttgRecording10",
      [expectedTrackWithTags],
      EXCLUDE_TRACK_IDS
    );
  });

  //Supplementary tags are currently "part" and "poor tracking"
  it("Supplementary tags are added in addition to primary tags", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags.filtered = false;

    expectedTrackWithTags.tags = [
      expectedPoorTrackingTag,
      expectedPartTag,
      expectedTag1,
    ];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgGroup1Member2").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;
    expectedTrackWithTags.tags[2].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTags.tags[2].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording11");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
      "ttgRecording11",
      "ttgTrack11",
      "ttgAlgorithm11",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording11",
      "ttgTrack11",
      "ttgTag11",
      tag1
    );

    cy.log("Same member can add supplementary tags");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording11",
      "ttgTrack11",
      "ttgTag11",
      partTag
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording11",
      "ttgTrack11",
      "ttgTag11",
      poorTrackingTag
    );

    cy.log("Check all three tags shown");
    cy.apiTracksCheck(
      "ttgGroup1Member2",
      "ttgRecording11",
      [expectedTrackWithTags],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Duplicate supplementary tags from same user are not added", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags.filtered = false;

    expectedTrackWithTags.tags = [expectedPartTag, expectedTag1];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTags.tags[0].userId=getCreds("ttgGroup1Member2").id;
    expectedTrackWithTags.tags[1].userName = getTestName("ttgGroup1Member2");
    //expectedTrackWithTags.tags[1].userId=getCreds("ttgGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording12");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
      "ttgRecording12",
      "ttgTrack12",
      "ttgAlgorithm12",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording12",
      "ttgTrack12",
      "ttgTag12",
      tag1
    );

    cy.log("Same member can add supplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording12",
      "ttgTrack12",
      "ttgTag12",
      partTag
    );

    cy.log("But cannot add duplicate supplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording12",
      "ttgTrack12",
      "ttgTag12",
      partTag
    );

    cy.log("Check only two tags shown");
    cy.apiTracksCheck(
      "ttgGroup1Member2",
      "ttgRecording12",
      [expectedTrackWithTags],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Duplicate supplementary tags from different users are allowed", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTags = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags.filtered = false;

    expectedTrackWithTags.tags = [
      JSON.parse(JSON.stringify(expectedPartTag)),
      JSON.parse(JSON.stringify(expectedPartTag)),
      expectedTag1,
    ];
    expectedTrackWithTags.tags[0].userName = getTestName("ttgGroup1Member2");
    expectedTrackWithTags.tags[1].userName = getTestName("ttgGroup1Member3");
    expectedTrackWithTags.tags[2].userName = getTestName("ttgGroup1Member2");

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording13");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgAlgorithm13",
      track1,
      algorithm1
    );
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tag1
    );

    cy.log("Same member can add supplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      partTag
    );

    cy.log("And another member can add same suplementary tag");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member3",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      partTag
    );

    cy.log("Check both duplicate supplementary tags shown (and primary tag)");
    cy.apiTracksCheck(
      "ttgGroup1Member3",
      "ttgRecording13",
      [expectedTrackWithTags],
      EXCLUDE_TRACK_IDS
    );
  });

  it("Correct handling of invalid recording, track", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttgCamera1", recording1, undefined, "ttgRecording14");
    cy.apiTrackAdd(
      "ttgGroup1Member2",
      "ttgRecording14",
      "ttgTrack14",
      "ttgAlgorithm14",
      track1,
      algorithm1
    );

    cy.log("Correct handling of invalid recording id in replace");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "99999",
      "99999",
      "ttgTag14",
      tag1,
      HttpStatusCode.Forbidden,
      { useRawRecordingId: true, useRawTrackId: true }
    );

    cy.log("Correct handling of invalid track id in replace");
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording14",
      "99999",
      "ttgTag14",
      tag1,
      HttpStatusCode.Forbidden,
      { useRawTrackId: true }
    );

    cy.log("Correct handling on invalid recording id in delete");
    cy.apiTrackTagDelete(
      "ttgGroup1Member2",
      "99999",
      "99999",
      "99999",
      HttpStatusCode.Forbidden,
      { useRawRecordingId: true, useRawTrackId: true, useRawTagId: true }
    );

    cy.log("Correct handling on invalid track id in delete");
    //cy.apiTrackTagDelete("ttgGroup1Member2", "ttgRecording14", "99999", "99999", HttpStatusCode.Forbidden, {useRawTrackId: true, useRawTagId: true});
    cy.apiTrackTagDelete(
      "ttgGroup1Member2",
      "ttgRecording14",
      "99999",
      "99999",
      HttpStatusCode.Forbidden,
      { useRawTrackId: true, useRawTagId: true }
    );

    cy.log("Correct handling of invalid tag id in delete");
    //cy.apiTrackTagDelete("ttgGroup1Member2", "ttgRecording14", "ttgTrack14", "99999", HttpStatusCode.Forbidden, {useRawTagId: true});
    cy.apiTrackTagDelete(
      "ttgGroup1Member2",
      "ttgRecording14",
      "ttgTrack14",
      "99999",
      HttpStatusCode.Forbidden,
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
      "ttgGroup1Member2",
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
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagA,
      HttpStatusCode.Unprocessable,
      { message: "body.what:" }
    );

    cy.log("Missing 'confidence'");
    const tagB = JSON.parse(JSON.stringify(tag1));
    delete tagB.confidence;
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagB,
      HttpStatusCode.Unprocessable,
      { message: "body.confidence:" }
    );

    cy.log("Missing 'automatic'");
    const tagC = JSON.parse(JSON.stringify(tag1));
    delete tagC.automatic;
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagC,
      HttpStatusCode.Unprocessable,
      { message: "body.automatic:" }
    );

    cy.log("Invalid confidence");
    const tagD = JSON.parse(JSON.stringify(tag1));
    tagD.confidence = "Hello";
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagD,
      HttpStatusCode.Unprocessable,
      { message: "body.confidence:" }
    );

    cy.log("Invalid automatic");
    const tagE = JSON.parse(JSON.stringify(tag1));
    tagE.automatic = "Hello";
    cy.apiTrackTagReplaceTag(
      "ttgGroup1Member2",
      "ttgRecording13",
      "ttgTrack13",
      "ttgTag13",
      tagE,
      HttpStatusCode.Unprocessable,
      { message: "body.automatic:" }
    );
  });
});
