/// <reference path="../../../support/index.d.ts" />

import {
  ApiRecordingSet,
  ApiTrackSet,
  ApiRecordingModel,
} from "@commands/types";
import {
  ApiTrackTagRequest,
  ApiHumanTrackTagResponse,
  ApiAutomaticTrackTagResponse,
} from "@typedefs/api/trackTag";

import { TestCreateExpectedRecordingData } from "@commands/api/recording-tests";
import { getCreds } from "@commands/server";
import {
  NOT_NULL,
  NOT_NULL_STRING,
  EXCLUDE_IDS,
  filtered_tags,
  unfiltered_tags,
} from "@commands/constants";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState } from "@typedefs/api/consts";
import {
  TEMPLATE_TRACK,
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { trackResponseFromSet } from "@commands/api/recording-tests";

//ApiTrackAdd does not use full track structure
const trackApiTrackTemplate = JSON.parse(JSON.stringify(TEMPLATE_TRACK));
delete trackApiTrackTemplate.id;
delete trackApiTrackTemplate.num_frames;
delete trackApiTrackTemplate.frame_start;
delete trackApiTrackTemplate.frame_end;
delete trackApiTrackTemplate.predictions;

describe("Recording filtering", () => {
  const algorithm1 = {
    model_name: "Master",
  };
  const model1: ApiRecordingModel = {
    id: 0,
    name: "Master",
  };

  const tagSetTemplate: ApiTrackTagRequest = {
    what: "cat",
    confidence: 0.95,
    automatic: false,
  };

  const tagResponseTemplate: ApiHumanTrackTagResponse = {
    confidence: 0.95,
    data: "",
    id: NOT_NULL,
    automatic: false,
    trackId: NOT_NULL,
    what: "cat",
    path: "all",
    userName: NOT_NULL_STRING,
    userId: NOT_NULL,
  };

  const automaticTagResponseTemplate: ApiAutomaticTrackTagResponse = {
    confidence: 0.95,
    data: { name: "Master" },
    id: NOT_NULL,
    automatic: true,
    trackId: NOT_NULL,
    what: "cat",
    path: "all",
  };

  before(() => {
    //Create group1 with 1 devices, admin
    cy.testCreateUserGroupAndDevice("rfGroupAdmin", "rfGroup", "rfCamera1");
  });

  //Upload
  it.skip("Recording upload with no track filtered", () => {
    //This is handled by GUI - not by API
  });

  it("Recording upload with track but no tags filtered", () => {
    //Recording with no tags
    const recording2: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording2.metadata.tracks[0].predictions = [];

    let expectedRecording2: ApiThermalRecordingResponse;
    cy.apiRecordingAdd("rfCamera1", recording2, undefined, "rfRecording2").then(
      () => {
        expectedRecording2 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording2",
          "rfCamera1",
          "rfGroup",
          null,
          recording2
        );
        expectedRecording2.tracks[0].filtered = true;

        cy.log("Check recording filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording2",
          expectedRecording2,
          EXCLUDE_IDS
        );
      }
    );
  });

  it("Recording upload with track and false-positive tag filtered", () => {
    //Recording with FP tag
    const recording3: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording3.metadata.tracks[0].predictions[0].confident_tag =
      "false-positive";

    let expectedRecording3: ApiThermalRecordingResponse;
    cy.apiRecordingAdd("rfCamera1", recording3, undefined, "rfRecording3").then(
      () => {
        expectedRecording3 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording3",
          "rfCamera1",
          "rfGroup",
          null,
          recording3
        );
        expectedRecording3.tracks[0].filtered = true;

        cy.log("Check recording filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording3",
          expectedRecording3,
          EXCLUDE_IDS
        );
      }
    );
  });

  it("Recording upload with track and animal tag not filtered", () => {
    //Recording with animal tag
    const recording4: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording4.metadata.tracks[0].predictions[0].confident_tag = "cat";

    let expectedRecording4: ApiThermalRecordingResponse;
    cy.apiRecordingAdd("rfCamera1", recording4, undefined, "rfRecording4").then(
      () => {
        expectedRecording4 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording4",
          "rfCamera1",
          "rfGroup",
          null,
          recording4
        );
        expectedRecording4.tracks[0].filtered = false;

        cy.log("Check recording NOT filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording4",
          expectedRecording4,
          EXCLUDE_IDS
        );
      }
    );
  });

  //******************************************************************************************
  //Add track
  it("Recording add track with no tag filtered", () => {
    //Recording with no tracks
    const recording5: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording5.metadata.tracks = [];

    //Track with no predictions
    const track5: ApiTrackSet = JSON.parse(
      JSON.stringify(trackApiTrackTemplate)
    );

    let expectedRecording5: ApiThermalRecordingResponse;
    cy.apiRecordingAdd("rfCamera1", recording5, undefined, "rfRecording5");

    cy.apiTrackAdd(
      "rfGroupAdmin",
      "rfRecording5",
      "rftrack5.1",
      "Master",
      track5,
      algorithm1
    ).then(() => {
      expectedRecording5 = TestCreateExpectedRecordingData(
        TEMPLATE_THERMAL_RECORDING_RESPONSE,
        "rfRecording5",
        "rfCamera1",
        "rfGroup",
        null,
        recording5
      );
      expectedRecording5.tracks = trackResponseFromSet([track5], [model1]);
      expectedRecording5.tracks[0].filtered = true;

      cy.log("Check recording filtered");
      cy.apiRecordingCheck(
        "rfGroupAdmin",
        "rfRecording5",
        expectedRecording5,
        EXCLUDE_IDS
      );
    });
  });

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Recording processing add track with no tag filtered", () => {
      //Recording with no tracks
      const recording5b: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording5b.metadata.tracks = [];

      //Track with no predictions
      const track5b: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );

      let expectedRecording5b: ApiThermalRecordingResponse;
      cy.apiRecordingAdd("rfCamera1", recording5b, undefined, "rfRecording5b");

      cy.processingApiAlgorithmPost({
        "tracking-format": 42,
        model_name: "Master",
      }).then((algorithmId) => {
        cy.processingApiTracksPost(
          "rfTrack5b.1",
          "rfRecording5b",
          track5b,
          algorithmId
        ).then(() => {
          expectedRecording5b = TestCreateExpectedRecordingData(
            TEMPLATE_THERMAL_RECORDING_RESPONSE,
            "rfRecording5b",
            "rfCamera1",
            "rfGroup",
            null,
            recording5b
          );
          expectedRecording5b.tracks = trackResponseFromSet(
            [track5b],
            [model1]
          );
          expectedRecording5b.tracks[0].filtered = true;

          cy.log("Check recording filtered");
          cy.apiRecordingCheck(
            "rfGroupAdmin",
            "rfRecording5b",
            expectedRecording5b,
            EXCLUDE_IDS
          );
        });
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Recording processing add track with no tag filtered"
    );
  }

  //******************************************************************************************
  //Add tag
  it("Recording add tag false-positive filtered", () => {
    //Recording with no tracks
    const recording6: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording6.metadata.tracks = [];

    const track6: ApiTrackSet = JSON.parse(
      JSON.stringify(trackApiTrackTemplate)
    );
    const tag6 = JSON.parse(JSON.stringify(tagSetTemplate));
    const expectedTag6 = JSON.parse(JSON.stringify(tagResponseTemplate));
    tag6.what = "false-positive";
    expectedTag6.what = "false-positive";

    let expectedRecording6: ApiThermalRecordingResponse;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("rfCamera1", recording6, undefined, "rfRecording6");
    cy.apiTrackAdd(
      "rfGroupAdmin",
      "rfRecording6",
      "rfTrack6.1",
      "Master",
      track6,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "rfGroupAdmin",
      "rfRecording6",
      "rfTrack6.1",
      "rfTag6.1.1",
      tag6
    ).then(() => {
      expectedRecording6 = TestCreateExpectedRecordingData(
        TEMPLATE_THERMAL_RECORDING_RESPONSE,
        "rfRecording6",
        "rfCamera1",
        "rfGroup",
        null,
        recording6
      );
      expectedRecording6.tracks = trackResponseFromSet([track6], [model1]);
      expectedRecording6.tracks[0].tags = [expectedTag6];
      expectedRecording6.tracks[0].filtered = true;

      cy.log("Check recording filtered");
      cy.apiRecordingCheck(
        "rfGroupAdmin",
        "rfRecording6",
        expectedRecording6,
        EXCLUDE_IDS
      );
    });
  });

  it("Recording add tag animal not filtered", () => {
    //Recording with no tracks
    const recording7: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording7.metadata.tracks = [];

    const track7: ApiTrackSet = JSON.parse(
      JSON.stringify(trackApiTrackTemplate)
    );
    const tag7 = JSON.parse(JSON.stringify(tagSetTemplate));
    const expectedTag7 = JSON.parse(JSON.stringify(tagResponseTemplate));
    tag7.what = "cat";
    expectedTag7.what = "cat";

    let expectedRecording7: ApiThermalRecordingResponse;

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("rfCamera1", recording7, undefined, "rfRecording7");
    cy.apiTrackAdd(
      "rfGroupAdmin",
      "rfRecording7",
      "rfTrack7.1",
      "Master",
      track7,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "rfGroupAdmin",
      "rfRecording7",
      "rfTrack7.1",
      "rfTag7.1.1",
      tag7
    ).then(() => {
      expectedRecording7 = TestCreateExpectedRecordingData(
        TEMPLATE_THERMAL_RECORDING_RESPONSE,
        "rfRecording7",
        "rfCamera1",
        "rfGroup",
        null,
        recording7
      );
      expectedRecording7.tracks = trackResponseFromSet([track7], [model1]);
      expectedRecording7.tracks[0].tags = [expectedTag7];
      expectedRecording7.tracks[0].filtered = false;

      cy.log("Check recording NOT filtered");
      cy.apiRecordingCheck(
        "rfGroupAdmin",
        "rfRecording7",
        expectedRecording7,
        EXCLUDE_IDS
      );
    });
  });

  //******************************************************************************************
  //Processing adds tag
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Recording processing add tag false-positive filtered", () => {
      //Recording with no tracks
      const recording8: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording8.metadata.tracks = [];
      recording8.processingState = RecordingProcessingState.AnalyseThermal;
      const track8: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );
      const expectedTag8 = JSON.parse(
        JSON.stringify(automaticTagResponseTemplate)
      );
      expectedTag8.what = "false-positive";

      cy.log("Add recording, track and tag");
      cy.apiRecordingAdd("rfCamera1", recording8, undefined, "rfRecording8");
      cy.apiTrackAdd(
        "rfGroupAdmin",
        "rfRecording8",
        "rfTrack8.1",
        "Master",
        track8,
        algorithm1
      ).then(() => {
        const expectedRecording8 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording8",
          "rfCamera1",
          "rfGroup",
          null,
          recording8
        );

        cy.processingApiTracksTagsPost(
          "rfTrack8.1",
          "rfRecording8",
          "false-positive",
          0.95,
          { name: "Master" }
        );
        cy.log("Check recording filtered");
        expectedRecording8.processingState = RecordingProcessingState.Analyse;
        expectedRecording8.tracks = trackResponseFromSet([track8], [model1]);
        expectedRecording8.tracks[0].tags = [expectedTag8];
        expectedRecording8.processing = false;
        expectedRecording8.tracks[0].filtered = true;
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording8",
          expectedRecording8,
          EXCLUDE_IDS
        );
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Recording processing add tag false-positive filtered"
    );
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Recording processing add tag animal not filtered", () => {
      //Recording with no tracks
      const recording9: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording9.metadata.tracks = [];
      recording9.processingState = RecordingProcessingState.AnalyseThermal;
      const track9: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );
      const expectedTag9 = JSON.parse(
        JSON.stringify(automaticTagResponseTemplate)
      );
      expectedTag9.what = "possum";

      cy.log("Add recording, track and tag");
      cy.apiRecordingAdd("rfCamera1", recording9, undefined, "rfRecording9");
      cy.apiTrackAdd(
        "rfGroupAdmin",
        "rfRecording9",
        "rfTrack9.1",
        "Master",
        track9,
        algorithm1
      ).then(() => {
        const expectedRecording9 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording9",
          "rfCamera1",
          "rfGroup",
          null,
          recording9
        );

        cy.processingApiTracksTagsPost(
          "rfTrack9.1",
          "rfRecording9",
          "possum",
          0.95,
          { name: "Master" }
        );
        cy.log("Check recording not filtered");
        expectedRecording9.processingState = RecordingProcessingState.Analyse;
        expectedRecording9.tracks = trackResponseFromSet([track9], [model1]);
        expectedRecording9.tracks[0].tags = [expectedTag9];
        expectedRecording9.processing = false;
        expectedRecording9.tracks[0].filtered = false;
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording9",
          expectedRecording9,
          EXCLUDE_IDS
        );
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Recording processing add tag animal not filtered"
    );
  }

  //******************************************************************************************
  //Reprocess
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Recording reprocessing add tag false-positive filtered", () => {
      //Recording with no tracks
      const recording10: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording10.metadata.tracks = [];
      const track10: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );
      const expectedTag10 = JSON.parse(
        JSON.stringify(automaticTagResponseTemplate)
      );
      expectedTag10.what = "possum";

      let expectedRecording10: ApiThermalRecordingResponse;
      cy.apiRecordingAdd("rfCamera1", recording10, undefined, "rfRecording10");
      cy.apiTrackAdd(
        "rfGroupAdmin",
        "rfRecording10",
        "rfTrack10.1",
        "Master",
        track10,
        algorithm1
      );
      cy.processingApiTracksTagsPost(
        "rfTrack10.1",
        "rfRecording10",
        "possum",
        0.95,
        { name: "Master" }
      ).then(() => {
        expectedRecording10 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording10",
          "rfCamera1",
          "rfGroup",
          null,
          recording10
        );
        expectedRecording10.tracks = trackResponseFromSet([track10], [model1]);
        expectedRecording10.tracks[0].tags = [expectedTag10];
        expectedRecording10.processing = false;
        expectedRecording10.tracks[0].filtered = false;

        cy.log("Check recording NOT filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording10",
          expectedRecording10,
          EXCLUDE_IDS
        );

        cy.log("Send for reprocessing");
        cy.apiReprocess("rfGroupAdmin", [getCreds("rfRecording10").id]);

        cy.log("Reprocess adds new master tag of false-positive");
        cy.processingApiTracksTagsPost(
          "rfTrack10.1",
          "rfRecording10",
          "false-positive",
          0.95,
          { name: "Master" }
        ).then(() => {
          cy.log("Check recording filtered");
          expectedRecording10.processingState =
            RecordingProcessingState.Reprocess;
          expectedRecording10.tracks[0].tags[0].what = "false-positive";
          expectedRecording10.tracks[0].filtered = true;
          cy.apiRecordingCheck(
            "rfGroupAdmin",
            "rfRecording10",
            expectedRecording10,
            EXCLUDE_IDS
          );
        });
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Recording reprocessing add tag false-positive filtered"
    );
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Recording reprocessing add tag animal not filtered", () => {
      //Recording with no tracks
      const recording11: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording11.metadata.tracks = [];
      const track11: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );
      const expectedTag11 = JSON.parse(
        JSON.stringify(automaticTagResponseTemplate)
      );
      expectedTag11.what = "false-positive";

      let expectedRecording11: ApiThermalRecordingResponse;
      cy.apiRecordingAdd("rfCamera1", recording11, undefined, "rfRecording11");
      cy.apiTrackAdd(
        "rfGroupAdmin",
        "rfRecording11",
        "rfTrack11.1",
        "Master",
        track11,
        algorithm1
      );
      cy.processingApiTracksTagsPost(
        "rfTrack11.1",
        "rfRecording11",
        "false-positive",
        0.95,
        { name: "Master" }
      ).then(() => {
        expectedRecording11 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording11",
          "rfCamera1",
          "rfGroup",
          null,
          recording11
        );
        expectedRecording11.tracks = trackResponseFromSet([track11], [model1]);
        expectedRecording11.tracks[0].tags = [expectedTag11];
        expectedRecording11.processing = false;
        expectedRecording11.tracks[0].filtered = true;

        cy.log("Check recording IS filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording11",
          expectedRecording11,
          EXCLUDE_IDS
        );

        cy.log("Send for reprocessing");
        cy.apiReprocess("rfGroupAdmin", [getCreds("rfRecording11").id]);

        cy.log("Reprocess adds new master tag of possum");
        cy.processingApiTracksTagsPost(
          "rfTrack11.1",
          "rfRecording11",
          "possum",
          0.95,
          { name: "Master" }
        ).then(() => {
          cy.log("Check recording now NOT filtered");
          expectedRecording11.processingState =
            RecordingProcessingState.Reprocess;
          expectedRecording11.tracks[0].tags[0].what = "possum";
          expectedRecording11.tracks[0].filtered = false;
          cy.apiRecordingCheck(
            "rfGroupAdmin",
            "rfRecording11",
            expectedRecording11,
            EXCLUDE_IDS
          );
        });
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Recording reprocessing add tag animal not filtered"
    );
  }

  //******************************************************************************************
  //Recording delete tag
  it("Recording delete last animal tag (filtered)", () => {
    //Recording with no tracks
    const recording18: ApiRecordingSet = JSON.parse(
      JSON.stringify(TEMPLATE_THERMAL_RECORDING)
    );
    recording18.metadata.tracks = [];
    let expectedRecording18: ApiThermalRecordingResponse;

    const track18: ApiTrackSet = JSON.parse(
      JSON.stringify(trackApiTrackTemplate)
    );
    const tag18 = JSON.parse(JSON.stringify(tagSetTemplate));
    const expectedTag18 = JSON.parse(JSON.stringify(tagResponseTemplate));
    tag18.what = "cat";
    expectedTag18.what = "cat";

    cy.log("Add recording, track and tag");
    cy.apiRecordingAdd("rfCamera1", recording18, undefined, "rfRecording18");
    cy.apiTrackAdd(
      "rfGroupAdmin",
      "rfRecording18",
      "rfTrack18.1",
      "Master",
      track18,
      algorithm1
    );
    cy.apiTrackTagAdd(
      "rfGroupAdmin",
      "rfRecording18",
      "rfTrack18.1",
      "rfTag18.1.1",
      tag18
    ).then(() => {
      expectedRecording18 = TestCreateExpectedRecordingData(
        TEMPLATE_THERMAL_RECORDING_RESPONSE,
        "rfRecording18",
        "rfCamera1",
        "rfGroup",
        null,
        recording18
      );
      expectedRecording18.tracks = trackResponseFromSet([track18], [model1]);
      expectedRecording18.tracks[0].tags = [expectedTag18];

      cy.log("Check recording NOT filtered");
      expectedRecording18.tracks[0].filtered = false;
      cy.apiRecordingCheck(
        "rfGroupAdmin",
        "rfRecording18",
        expectedRecording18,
        EXCLUDE_IDS
      ).then(() => {
        cy.log("Delete tag");
        cy.apiTrackTagDelete(
          "rfGroupAdmin",
          "rfRecording18",
          "rfTrack18.1",
          "rfTag18.1.1"
        );

        cy.log("Check recording filtered");
        expectedRecording18.tracks[0].filtered = true;
        expectedRecording18.tracks[0].tags = [];
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording18",
          expectedRecording18,
          EXCLUDE_IDS
        );
      });
    });
  });

  //******************************************************************************************
  //Recording processing delete track
  it.skip("Recording processing deletes last tagged track (filtered)", () => {
    //Filtering handled by Browse, not by API
  });

  //******************************************************************************************
  //Filter rules
  it("Verify all filtered tags are filtered", () => {
    filtered_tags.forEach((thistag) => {
      cy.log("Checking " + thistag + " filtered");
      //Recording with animal tag
      const recording19: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording19.metadata.tracks[0].predictions[0].confident_tag = thistag;

      let expectedRecording19: ApiThermalRecordingResponse;
      cy.apiRecordingAdd(
        "rfCamera1",
        recording19,
        undefined,
        "rfRecording19"
      ).then(() => {
        expectedRecording19 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording19",
          "rfCamera1",
          "rfGroup",
          null,
          recording19
        );
        expectedRecording19.tracks[0].filtered = true;

        cy.log("Check recording filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording19",
          expectedRecording19,
          EXCLUDE_IDS
        );
      });
    });
  });

  it("Verify all un-filtered tags are not filtered", () => {
    const recordings = unfiltered_tags.map((tag) => {
      const recording: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording.metadata.tracks[0].predictions[0].confident_tag = tag;
      return recording;
    });
    const expectedRecordings = recordings.map((recording) => {
      const expected = TestCreateExpectedRecordingData(
        TEMPLATE_THERMAL_RECORDING_RESPONSE,
        "rfRecording19",
        "rfCamera1",
        "rfGroup",
        null,
        recording
      );
      expected.tracks[0].filtered = false;
      return expected;
    });
    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];
      const expectedRecording = expectedRecordings[i];
      cy.apiRecordingAdd(
        "rfCamera1",
        recording,
        undefined,
        `rfRecording_${i}`
      ).then((recordingId) => {
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          `rfRecording_${i}`,
          { ...expectedRecording, id: recordingId },
          [
            ".tracks[].TrackTags[].TrackId",
            ".tracks[].tags",
            ".additionalMetadata",
            ".location",
            ".tracks[].positions",
            ".tracks[].id",
          ]
        );
      });
    }
  });

  //TODO enable after merge
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it.skip("Verify manual tag overrides automatic tag (not filtered)", () => {
      //Recording with no tracks
      const recording20: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording20.metadata.tracks = [];
      recording20.processingState = RecordingProcessingState.AnalyseThermal;
      const track20: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );
      const expectedTag20_1 = JSON.parse(
        JSON.stringify(automaticTagResponseTemplate)
      );
      expectedTag20_1.what = "false-positive";
      const expectedTag20_2 = JSON.parse(JSON.stringify(tagResponseTemplate));
      expectedTag20_2.what = "possum";
      const tag20_2 = JSON.parse(JSON.stringify(tagSetTemplate));
      tag20_2.what = "possum";

      cy.log("Add recording, track and automatic tag (false-positive)");
      cy.apiRecordingAdd("rfCamera1", recording20, undefined, "rfRecording20");
      cy.apiTrackAdd(
        "rfGroupAdmin",
        "rfRecording20",
        "rfTrack20.1",
        "Master",
        track20,
        algorithm1
      );
      cy.processingApiTracksTagsPost(
        "rfTrack20.1",
        "rfRecording20",
        "false-positive",
        0.95,
        { name: "Master" }
      ).then(() => {
        const expectedRecording20 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording20",
          "rfCamera1",
          "rfGroup",
          null,
          recording20
        );
        expectedRecording20.processingState = RecordingProcessingState.Analyse;
        expectedRecording20.tracks = trackResponseFromSet([track20], [model1]);
        expectedRecording20.tracks[0].tags = [expectedTag20_1];
        expectedRecording20.tracks[0].filtered = true;

        cy.log("Check track is filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording20",
          expectedRecording20,
          EXCLUDE_IDS
        ).then(() => {
          cy.log("Add manual animal tag");
          cy.apiTrackTagAdd(
            "rfGroupAdmin",
            "rfRecording20",
            "rfTrack20.1",
            "rfTag20.1.2",
            tag20_2
          );

          cy.log("Check track is filtered");
          expectedRecording20.tracks[0].tags = [
            expectedTag20_2,
            expectedTag20_1,
          ];
          expectedRecording20.tracks[0].filtered = false;
          cy.apiRecordingCheck(
            "rfGroupAdmin",
            "rfRecording20",
            expectedRecording20,
            EXCLUDE_IDS
          );
        });
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Verify manual tag overrides automatic tag (not filtered)"
    );
  }

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it.skip("Verify manual tag overrides automatic tag (filtered)", () => {
      //Recording with no tracks
      const recording21: ApiRecordingSet = JSON.parse(
        JSON.stringify(TEMPLATE_THERMAL_RECORDING)
      );
      recording21.metadata.tracks = [];
      recording21.processingState = RecordingProcessingState.AnalyseThermal;
      const track21: ApiTrackSet = JSON.parse(
        JSON.stringify(trackApiTrackTemplate)
      );
      const expectedTag21_1 = JSON.parse(
        JSON.stringify(automaticTagResponseTemplate)
      );
      expectedTag21_1.what = "possum";
      const expectedTag21_2 = JSON.parse(JSON.stringify(tagResponseTemplate));
      expectedTag21_2.what = "false-positive";
      const tag21 = JSON.parse(JSON.stringify(tagSetTemplate));
      tag21.what = "false-positive";

      cy.log("Add recording, track and automatic tag (possum)");
      cy.apiRecordingAdd("rfCamera1", recording21, undefined, "rfRecording21");
      cy.apiTrackAdd(
        "rfGroupAdmin",
        "rfRecording21",
        "rfTrack21.1",
        "Master",
        track21,
        algorithm1
      );
      cy.processingApiTracksTagsPost(
        "rfTrack21.1",
        "rfRecording21",
        "possum",
        0.95,
        { name: "Master" }
      ).then(() => {
        const expectedRecording21 = TestCreateExpectedRecordingData(
          TEMPLATE_THERMAL_RECORDING_RESPONSE,
          "rfRecording21",
          "rfCamera1",
          "rfGroup",
          null,
          recording21
        );
        expectedRecording21.processingState = RecordingProcessingState.Analyse;
        expectedRecording21.tracks = trackResponseFromSet([track21], [model1]);
        expectedRecording21.tracks[0].tags = [expectedTag21_1];
        expectedRecording21.tracks[0].filtered = false;

        cy.log("Check track is NOT filtered");
        cy.apiRecordingCheck(
          "rfGroupAdmin",
          "rfRecording21",
          expectedRecording21,
          EXCLUDE_IDS
        ).then(() => {
          cy.log("Add manual animal tag");
          cy.apiTrackTagAdd(
            "rfGroupAdmin",
            "rfRecording21",
            "rfTrack21.1",
            "rfTag21.1.2",
            tag21
          );

          cy.log("Check track is filtered");
          expectedRecording21.tracks[0].tags = [
            expectedTag21_2,
            expectedTag21_1,
          ];
          expectedRecording21.tracks[0].filtered = true;
          cy.apiRecordingCheck(
            "rfGroupAdmin",
            "rfRecording21",
            expectedRecording21,
            EXCLUDE_IDS
          );
        });
      });
    });
  } else {
    it.skip(
      "DISABLED dev only test: Verify manual tag overrides automatic tag (filtered)"
    );
  }
});
