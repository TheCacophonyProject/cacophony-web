/// <reference path="../../../support/index.d.ts" />

describe("Monitoring : tracks and tags", () => {
  const Damian = "Damian";
  const Gerry = "Gerry";

  const group = "MonitoringTags";

  before(() => {
    cy.testCreateUserAndGroup(Damian, group);
  });

  // at the moment many tracks are being missed so we can't do this.
  // it is also a bit confusing for users - where did my recording go?
  it.skip("recordings with no tracks do not create a visit", () => {
    const camera = "no_tracks";
    const notracks = [];
    const noVisits = [];
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tracks: notracks });
    cy.checkMonitoring(Damian, camera, noVisits);
  });

  it("all automatic tags other than master are ignored - to prevent wallaby ai being used on other projects", () => {
    const camera = "only_master";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      model: "different",
      tags: ["cat"],
    });
    cy.checkMonitoringTags(Damian, camera, ["none"]);
  });

  it("each recording contributes votes for what the animal is", () => {
    const camera = "multiple_tracks";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tags: ["possum", "rat"] });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.checkMonitoringTags(Damian, camera, ["cat"]);
  });

  it("each track in a recording gets contributes a vote for what the animal is", () => {
    const camera = "multiple_tracks2";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat", "rat"],
    });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.checkMonitoringTags(Damian, camera, ["rat"]);
  });

  it("track tag 'unidentified` is ignored when deciding label to use", () => {
    const camera = "has_unidentified";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["possum", "unidentified", "unidentified", "unidentified"],
    });
    cy.checkMonitoringTags(Damian, camera, ["possum"]);
  });

  it("What happens when user tags as 'unidentified`?", () => {
    const camera = "user_unidentified_tracks";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tags: ["possum"] }).thenUserTagAs(
      Damian,
      "unidentified"
    );
    cy.checkMonitoringTags(Damian, camera, ["unidentified"]);
  });

  it("if a user tags a track then this is what should be used as the track tag", () => {
    const camera = "userTagged";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tracks: [ {start_s: 0, end_s: 1, predictions: [{ confident_tag: "cat", confidence: 0.9, model_id: 1 }]}],
    }).thenUserTagAs(Damian, "rabbit");
    cy.checkMonitoringTags(Damian, camera, ["rabbit"]);
  });

  it("User tag is preferred over AI tag", () => {
    const camera = "userVsMultiple";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat"],
    }).thenUserTagAs(Damian, "rabbit");
    cy.testUploadRecording(camera, { tags: ["possum"] });
    cy.checkMonitoringTags(Damian, camera, ["rabbit"]);
  });

  it("When user tag and AI tag aggree", () => {
    const camera = "tagsagree";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat"],
    }).thenUserTagAs(Damian, "possum");
    cy.testUploadRecording(camera, { tags: ["possum"] });
    cy.checkMonitoringTags(Damian, camera, ["possum"]);
  });

  it("User animal tag is preferred over user unknown tag", () => {
    const camera = "userAnimalUnknown";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["unidentified", "unidentified", "unidentified"],
    }).then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 1, Damian, "unknown");
      cy.testUserTagRecording(recID, 2, Damian, "unknown");
    });
    cy.checkMonitoringTags(Damian, camera, ["possum"]);
  });
  it("User tags conflict", () => {
    const camera = "conflicter";
    cy.apiUserAdd(Gerry);
    cy.apiGroupUserAdd(Damian, Gerry, group, true);
    cy.apiDeviceAdd(camera, group);
    const recording = cy.testUploadRecording(camera, {
      tags: ["possum", "rabbit"],
    });
    recording.then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 0, Gerry, "rat");
    });
    cy.checkMonitoringTags(Damian, camera, ["conflicting tags"]);
  });
  it("User tags conflict on one of many tracks majority wins", () => {
    const camera = "conflicter-multiple";
    cy.apiDeviceAdd(camera, group);
    const recording = cy.testUploadRecording(camera, {
      tags: ["possum", "rabbit"],
    });
    recording.then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 0, Gerry, "rat");
    });
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat"],
    }).thenUserTagAs(Damian, "possum");
    cy.testUploadRecording(camera, { tags: ["cat"] }).thenUserTagAs(
      Damian,
      "possum"
    );

    cy.checkMonitoringTags(Damian, camera, ["possum"]);
  });
});
