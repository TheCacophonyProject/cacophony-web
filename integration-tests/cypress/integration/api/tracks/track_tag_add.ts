/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_OK200,
  NOT_NULL,
  NOT_NULL_STRING,
} from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";

import { ApiRecordingNeedsTagReturned } from "@commands/types";

import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

import {
  TestCreateExpectedNeedsTagData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";

import {
  ApiTrackDataRequest,
  ApiTrackPosition,
  ApiTrackResponse,
} from "@typedefs/api/track";
import {
  ApiHumanTrackTagResponse,
  ApiTrackTagRequest,
} from "@typedefs/api/trackTag";

const EXCLUDE_IDS = [
  "[].id",
  "[].tags[].id",
  "[].tags[].trackId",
  "[].tags[].userId",
];

describe("Track Tags: add, check, delete", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

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
    automatic: true,
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
    createdAt: NOT_NULL_STRING,
    //TODO: cannot set data above, retuned as blank sting
    //data: { "a parameter": "a value" },
    data: "",
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
    //TODO: cannot set data above, retuned as blank sting
    //data: { "a parameter": "a value" },
    data: "",
    id: 99,
    automatic: false,
    trackId: 99,
    updatedAt: NOT_NULL_STRING,
    what: "cat",
    userName: "xxx",
    userId: NOT_NULL,
  };

  const templateExpectedNeedsTagRecording: ApiRecordingNeedsTagReturned = {
    DeviceId: 49,
    RecordingId: 34,
    duration: 40,
    fileSize: 1,
    recordingJWT: NOT_NULL_STRING,
    tagJWT: NOT_NULL_STRING,
    tracks: [],
  };

  const algorithm1 = {
    model_name: "inc3",
  };

  let dev_env = false;

  before(() => {
    //Create group1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("ttaGroupAdmin", "ttaGroup", "ttaCamera1");
    cy.apiDeviceAdd("ttaCamera1b", "ttaGroup");
    cy.apiUserAdd("ttaGroupMember");

    //Add admin & member to Camera1
    cy.apiUserAdd("ttaDeviceAdmin");
    cy.apiUserAdd("ttaDeviceMember");
    cy.apiGroupUserAdd("ttaGroupAdmin", "ttaGroupMember", "ttaGroup", true);
    cy.apiDeviceUserAdd("ttaGroupAdmin", "ttaDeviceAdmin", "ttaCamera1", true);
    cy.apiDeviceUserAdd("ttaGroupAdmin", "ttaDeviceMember", "ttaCamera1", true);

    //Create group2 with admin and device
    cy.testCreateUserGroupAndDevice(
      "ttaGroup2Admin",
      "ttaGroup2",
      "ttaCamera2"
    );

    //Create non member user
    cy.apiUserAdd("ttaNonMember");

    //When running on dev we know what recordings are present so can
    //run power tagger tests and validate the returned data
    //When running on test we cannot control what data is present so just validate that the
    //API calls work
    if (Cypress.env("running_in_a_dev_environment") == true) {
      dev_env = true;
      cy.apiSignInAs(null, null, superuser, suPassword);
    } else {
      cy.log(
        "Warning: validating returned returned data presence but not parameter values"
      );
      cy.log(
        "Enable running_in_a_dev_environment to allow value checks (only on dev)"
      );
    }
  });

  beforeEach(() => {
    //If running on dev, delete any recordings already present so that we know
    //what requires tagging by power-tagger
    if (dev_env == true) {
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        undefined
      );
      cy.testDeleteRecordingsInState(superuser, RecordingType.Audio, undefined);
    }
  });

  //FIXME: Issue ##. recordings/:id/tracks/:id/tags (POST) returns 404 if tagJWT not present
  it.skip("Group admin can add, view and delete device's track tags", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttaGroupAdmin");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttaGroupAdmin").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording1");
    cy.apiTrackAdd(
      "ttaGroupAdmin",
      "ttaRecording1",
      "ttaTrack1",
      "ttaAlgorithm1",
      track1,
      algorithm1
    ).then(() => {
      cy.log(JSON.stringify(getCreds("ttaTrack1")));

      cy.log("Group admin can tag the track");
      cy.apiTrackTagAdd(
        "ttaGroupAdmin",
        "ttaRecording1",
        "ttaTrack1",
        "ttaTag1",
        tag1
      );

      cy.log("Check recording track & tag can be viewed correctly");
      cy.apiTrackCheck(
        "ttaGroupAdmin",
        "ttaRecording1",
        [expectedTrackWithTag],
        EXCLUDE_IDS
      );

      cy.log("Delete tag");
      cy.apiTrackTagDelete(
        "ttaGroupAdmin",
        "ttaRecording1",
        "ttaTrack1",
        "ttaTag1"
      );

      cy.log("Check tag no longer exists");
      cy.apiTrackCheck(
        "ttaGroupAdmin",
        "ttaRecording1",
        [expectedTrack],
        EXCLUDE_IDS
      );
    });
  });

  it.skip("Group member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttaGroupMember");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttaGroupMember").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording2");
    cy.apiTrackAdd(
      "ttaGroupMember",
      "ttaRecording2",
      "ttaTrack2",
      "ttaAlgorithm2",
      track1,
      algorithm1
    );

    cy.log("Can tag the track");
    cy.apiTrackTagAdd(
      "ttaGroupMember",
      "ttaRecording2",
      "ttaTrack2",
      "ttaTag2",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttaGroupMember",
      "ttaRecording2",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttaGroupMember",
      "ttaRecording2",
      "ttaTrack2",
      "ttaTag2"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttaGroupMember",
      "ttaRecording2",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it.skip("Device admin can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttaDeviceAdmin");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttaGroupMember").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording3");
    cy.apiTrackAdd(
      "ttaDeviceAdmin",
      "ttaRecording3",
      "ttaTrack3",
      "ttaAlgorithm3",
      track1,
      algorithm1
    );

    cy.log("Can tag the track");
    cy.apiTrackTagAdd(
      "ttaDeviceAdmin",
      "ttaRecording3",
      "ttaTrack3",
      "ttaTag3",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttaDeviceAdmin",
      "ttaRecording3",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttaDeviceAdmin",
      "ttaRecording3",
      "ttaTrack3",
      "ttaTag3"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttaDeviceAdmin",
      "ttaRecording3",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it.skip("Device member can add, view and delete device's tracks", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttaDeviceMember");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttaGroupMember").id;

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording4");
    cy.apiTrackAdd(
      "ttaDeviceMember",
      "ttaRecording4",
      "ttaTrack4",
      "ttaAlgorithm4",
      track1,
      algorithm1
    );

    cy.log("Can tag the track");
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording4",
      "ttaTrack4",
      "ttaTag4",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording4",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );

    cy.log("Delete tag");
    cy.apiTrackTagDelete(
      "ttaDeviceMember",
      "ttaRecording4",
      "ttaTrack4",
      "ttaTag4"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording4",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it.skip("User cannot tag recording they don't own without additional JWT", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording and track");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording5");
    cy.apiTrackAdd(
      "ttaDeviceMember",
      "ttaRecording5",
      "ttaTrack5",
      "ttaAlgorithm5",
      track1,
      algorithm1
    );

    cy.log("Non owner cannot tag the track");
    cy.apiTrackTagAdd(
      "ttaGroup2Admin",
      "ttaRecording5",
      "ttaTrack5",
      "ttaTag5",
      tag1,
      HTTP_Forbidden
    );

    cy.log("Check tag does not exist");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording5",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it.skip("Cannot delete tag for device that user does not own", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag.tags = [expectedTag1];
    expectedTrackWithTag.tags[0].userName = getTestName("ttaDeviceMember");
    //expectedTrackWithTag.tags[0].userId=getCreds("ttaGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording6");
    cy.apiTrackAdd(
      "ttaDeviceMember",
      "ttaRecording6",
      "ttaTrack6",
      "ttaAlgorithm6",
      track1,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording6",
      "ttaTrack6",
      "ttaTag6",
      tag1
    );

    cy.log("Non member cannot delete tag");
    cy.apiTrackTagDelete(
      "ttaGroup2Admin",
      "ttaRecording6",
      "ttaTrack6",
      "ttaTag6",
      HTTP_Forbidden
    );

    cy.log("Check tag still exists");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording6",
      [expectedTrackWithTag],
      EXCLUDE_IDS
    );
  });

  it.skip("But member can delete another user's tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording7");
    cy.apiTrackAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaTag7",
      tag1
    );

    cy.log("Another member of same group member can delete another's tag");
    cy.apiTrackTagDelete(
      "ttaGroupMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaTag7"
    );

    cy.log("Check tag no longer exists");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording7",
      [expectedTrack],
      EXCLUDE_IDS
    );
  });

  it.skip("User can add second tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag1 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag1.tags = [expectedTag1];
    expectedTrackWithTag1.tags[0].userName = getTestName("ttaDeviceMember");
    //expectedTrackWithTag1.tags[0].userId=getCreds("ttaGroupMember").id;
    const expectedTrackWithTags2 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags2.tags = [expectedTag2, expectedTag1];
    expectedTrackWithTags2.tags[0].userName = getTestName("ttaDeviceMember");
    expectedTrackWithTags2.tags[1].userName = getTestName("ttaDeviceMember");
    //expectedTrackWithTags2.tags[0].userId=getCreds("ttaGroupMember").id;
    //expectedTrackWithTags2.tags[1].userId=getCreds("ttaGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording7");
    cy.apiTrackAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaTag7",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording7",
      [expectedTrackWithTag1],
      EXCLUDE_IDS
    );

    cy.log("Member can add second tag");
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaTag7",
      tag2
    );

    cy.log("Check both tags shown");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording7",
      [expectedTrackWithTags2],
      EXCLUDE_IDS
    );
  });

  it.skip("User can add dupliacte tag", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const expectedTrackWithTag1 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTag1.tags = [expectedTag1];
    expectedTrackWithTag1.tags[0].userName = getTestName("ttaDeviceMember");
    //expectedTrackWithTag1.tags[0].userId=getCreds("ttaGroupMember").id;
    const expectedTrackWithTags2 = JSON.parse(JSON.stringify(expectedTrack1));
    expectedTrackWithTags2.tags = [expectedTag1, expectedTag1];
    expectedTrackWithTags2.tags[0].userName = getTestName("ttaDeviceMember");
    expectedTrackWithTags2.tags[1].userName = getTestName("ttaDeviceMember");
    //expectedTrackWithTag2.tags[0].userId=getCreds("ttaGroupMember").id;
    //expectedTrackWithTag2.tags[1].userId=getCreds("ttaGroupMember").id;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording7");
    cy.apiTrackAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaAlgorithm7",
      track1,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaTag7",
      tag1
    );

    cy.log("Check recording track & tag can be viewed correctly");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording7",
      [expectedTrackWithTag1],
      EXCLUDE_IDS
    );

    cy.log("Member can add second tag");
    cy.apiTrackTagAdd(
      "ttaDeviceMember",
      "ttaRecording7",
      "ttaTrack7",
      "ttaTag7",
      tag1
    );

    cy.log("Check both tags shown");
    cy.apiTrackCheck(
      "ttaDeviceMember",
      "ttaRecording7",
      [expectedTrackWithTags2],
      EXCLUDE_IDS
    );
  });

  //guest (power-tagger) tagging tests
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Can power-tag as non-owner by providing a valid tag JWT", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
      const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
      expectedTrackWithTag.tags = [expectedTag1];
      expectedTrackWithTag.tags[0].userName = getTestName("ttaNonMember");
      //expectedTrackWithTag.tags[0].userId=getCreds("ttaNonMember").id;

      cy.log("Add recording and track");
      cy.apiRecordingAdd(
        "ttaCamera1",
        recording1,
        undefined,
        "ttaRecording8"
      ).then(() => {
        const expectedRecording1 = TestCreateExpectedNeedsTagData(
          templateExpectedNeedsTagRecording,
          "ttaRecording8",
          "ttaCamera1",
          recording1
        );
        cy.apiTrackAdd(
          "ttaGroupAdmin",
          "ttaRecording8",
          "ttaTrack8",
          "ttaAlgorithm8",
          track1,
          algorithm1
        );

        cy.log("Retrieve the recording's JWT");
        cy.apiRecordingNeedsTagCheck(
          "ttaNonMember",
          undefined,
          "ttaNeedsTag8",
          [expectedRecording1],
          [],
          HTTP_OK200,
          { doNotValidate: true }
        ).then(() => {
          tag1.tagJWT = getCreds("ttaNeedsTag8").jwt;

          cy.log("Guest can tag the track by providing tagJWT");
          cy.apiTrackTagAdd(
            "ttaNonMember",
            "ttaRecording8",
            "ttaTrack8",
            "ttaTag8",
            tag1
          );

          cy.log("Check recording track & tag can be viewed correctly");
          cy.apiTrackCheck(
            "ttaGroupAdmin",
            "ttaRecording8",
            [expectedTrackWithTag],
            EXCLUDE_IDS
          );

          cy.log("Delete tag");
          cy.apiTrackTagDelete(
            "ttaGroupAdmin",
            "ttaRecording8",
            "ttaTrack8",
            "ttaTag8"
          );

          cy.log("Check tag no longer exists");
          cy.apiTrackCheck(
            "ttaGroupAdmin",
            "ttaRecording8",
            [expectedTrack],
            EXCLUDE_IDS
          );
        });
      });
    });

    it("Cannot power-tag as non-owner by providing a non-valid tag JWT", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      const tagA = JSON.parse(JSON.stringify(tag1));

      cy.log("Add recording and track");
      cy.apiRecordingAdd("ttaCamera1", recording1, undefined, "ttaRecording9");
      cy.apiTrackAdd(
        "ttaGroupAdmin",
        "ttaRecording9",
        "ttaTrack9",
        "ttaAlgorithm9",
        track1,
        algorithm1
      );

      tagA.tagJWT = "BADJWT";

      cy.log("Guest cannot tag the track by providing invalid tagJWT");
      cy.apiTrackTagAdd(
        "ttaNonMember",
        "ttaRecording9",
        "ttaTrack9",
        "ttaTag9",
        tagA,
        HTTP_Forbidden,
        { message: "Failed to verify JWT" }
      );
    });

    //FIXME: This does not work. Does not accept tagJWT and does not allow without. Causing browse to fail
    it.skip("Can delete own tag as non-owner", () => {
      const recording1 = TestCreateRecordingData(templateRecording);
      const expectedTrack = JSON.parse(JSON.stringify(expectedTrack1));
      const expectedTrackWithTag = JSON.parse(JSON.stringify(expectedTrack1));
      expectedTrackWithTag.tags = [expectedTag1];
      expectedTrackWithTag.tags[0].userName = getTestName("ttaNonMember");
      //expectedTrackWithTag.tags[0].userId=getCreds("ttaNonMember").id;

      cy.log("Add recording and track");
      cy.apiRecordingAdd(
        "ttaCamera1",
        recording1,
        undefined,
        "ttaRecording10"
      ).then(() => {
        const expectedRecording1 = TestCreateExpectedNeedsTagData(
          templateExpectedNeedsTagRecording,
          "ttaRecording10",
          "ttaCamera1",
          recording1
        );
        cy.apiTrackAdd(
          "ttaGroupAdmin",
          "ttaRecording10",
          "ttaTrack10",
          "ttaAlgorithm10",
          track1,
          algorithm1
        );

        cy.log("Retrieve the recording's JWT");
        cy.apiRecordingNeedsTagCheck(
          "ttaNonMember",
          undefined,
          "ttaNeedsTag10",
          [expectedRecording1],
          [],
          HTTP_OK200,
          { doNotValidate: true }
        ).then(() => {
          tag1.tagJWT = getCreds("ttaNeedsTag10").jwt;

          cy.log("Guest can tag the track by providing tagJWT");
          cy.apiTrackTagAdd(
            "ttaNonMember",
            "ttaRecording10",
            "ttaTrack10",
            "ttaTag10",
            tag1
          );

          cy.log("Guest can delete tag by providing tagJWT");
          cy.apiTrackTagDelete(
            "ttaNonMember",
            "ttaRecording10",
            "ttaTrack10",
            "ttaTag10"
          );

          cy.log("Check tag no longer exists");
          cy.apiTrackCheck(
            "ttaGroupAdmin",
            "ttaRecording10",
            [expectedTrack],
            EXCLUDE_IDS
          );
        });
      });
    });

    it.skip("Cannot delete tag as non-owner by providing a non-valid tag JWT", () => {});
  } else {
    it.skip(
      "DISABLED: power tagger tests cannot be run as not in a dev environment"
    );
  }
});
