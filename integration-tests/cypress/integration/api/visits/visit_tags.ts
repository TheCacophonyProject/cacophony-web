/// <reference path="../../../support/index.d.ts" />

describe.skip("Visits : tracks and tags", () => {
  const Dee = "Donna_visits";
  const Gee = "Gee_visits";

  const group = "VisitTags";

  before(() => {
    cy.testCreateUserAndGroup(Dee, group);
  });

  it("recordings with no tracks do not create a visit", () => {
    const camera = "no_tracks";
    const notracks = [];
    const noVisits = [];
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tracks: notracks });
    cy.checkVisits(Dee, camera, noVisits);
  });

  it("all automatic tags other than master are ignored - to prevent wallaby ai being used on other projects", () => {
    const camera = "only_master";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      model: "different",
      tags: ["cat"],
    });
    cy.checkVisitTags(Dee, camera, ["<null>"]);
  });

  it("each recording contributes a vote for what the animal is", () => {
    const camera = "multiple_tracks";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tags: ["possum", "rat"] });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.checkVisitTags(Dee, camera, ["cat"]);
  });

  it("each track in a recording gets contributes a vote for what the animal is", () => {
    const camera = "multiple_tracks2";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat", "rat"],
    });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.testUploadRecording(camera, { tags: ["cat"] });
    cy.checkVisitTags(Dee, camera, ["rat"]);
  });

  it("track tag 'unidentified` is ignored when deciding label to use", () => {
    const camera = "has_unidentified";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["possum", "unidentified", "unidentified", "unidentified"],
    });
    cy.checkVisitTags(Dee, camera, ["possum"]);
  });

  it("What happens when user tags as 'unidentified`?", () => {
    const camera = "user_unidentified_tracks";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tags: ["possum"] }).thenUserTagAs(
      Dee,
      "unidentified"
    );
    cy.checkVisitTags(Dee, camera, ["unidentified"]);
  });

  it("if a user tags a track then this is what should be used as the track tag", () => {
    const camera = "userTagged";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tracks: [{ tag: "cat" }],
    }).thenUserTagAs(Dee, "rabbit");
    cy.checkVisitTags(Dee, camera, ["rabbit"]);
  });

  it("User tag is preferred over AI tag", () => {
    const camera = "userVsMultiple";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      time: new Date(2021, 1, 20, 21),
      tags: ["possum", "rat", "rat"],
    }).thenUserTagAs(Dee, "rabbit");
    cy.testUploadRecording(camera, { tags: ["possum"] });
    cy.checkVisitTags(Dee, camera, ["rabbit"]);
  });

  it("User animal tag is preferred over user unknown tag", () => {
    const camera = "userAnimalUnknown";
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      tags: ["unidentified", "unidentified", "unidentified"],
    }).then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Dee, "possum");
      cy.testUserTagRecording(recID, 1, Dee, "unknown");
      cy.testUserTagRecording(recID, 2, Dee, "unknown");
    });
    cy.checkVisitTags(Dee, camera, ["possum"]);
  });
  it("User tags conflict", () => {
    const camera = "conflicter";
    cy.apiUserAdd(Gee);
    cy.apiGroupUserAdd(Dee, Gee, group, true);
    cy.apiDeviceAdd(camera, group);
    const recording = cy.testUploadRecording(camera, {
      time: new Date(2021, 1, 20, 21),
      tags: ["possum"],
    });
    recording.then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Dee, "possum");
      cy.testUserTagRecording(recID, 0, Gee, "rat");
    });
    cy.checkVisitTags(Dee, camera, ["conflicting tags"]);
  });
});
