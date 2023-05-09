/// <reference path="../../../support/index.d.ts" />

import { checkRecording } from "@commands/api/recording-tests";

describe("Monitoring : tracks and tags", () => {
  const Damian = "Damian";
  const Gerry = "Gerry";
  const Edward = "Edward";

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
    const location1 = { lat: -44.0, lng: 172.7 };
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, { tracks: notracks, ...location1 }).then(
      (recordingId) => {
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoring(Damian, recording.stationId, noVisits);
        });
      }
    );
  });

  it("all automatic tags other than master are ignored - to prevent wallaby ai being used on other projects", () => {
    const camera = "only_master";
    cy.apiDeviceAdd(camera, group);
    const location2 = { lat: -45.0, lng: 172.7 };
    cy.testUploadRecording(camera, {
      model: "different",
      tags: ["cat"],
      ...location2,
    }).then((recordingId) => {
      checkRecording(Damian, recordingId, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, ["none"]);
      });
    });
  });

  it("each recording contributes votes for what the animal is", () => {
    const camera = "multiple_tracks";
    cy.apiDeviceAdd(camera, group);
    const location3 = { lat: -46.0, lng: 172.7 };
    cy.testUploadRecording(camera, { tags: ["possum", "rat"], ...location3 });
    cy.testUploadRecording(camera, { tags: ["cat"], ...location3 });
    cy.testUploadRecording(camera, { tags: ["cat"], ...location3 }).then(
      (recordingId) => {
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoringTags(Damian, recording.stationId, ["cat"]);
        });
      }
    );
  });

  it("each track in a recording gets contributes a vote for what the animal is", () => {
    const camera = "multiple_tracks2";
    cy.apiDeviceAdd(camera, group);
    const location4 = { lat: -47.0, lng: 172.7 };
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat", "rat"],
      ...location4,
    });
    cy.testUploadRecording(camera, { tags: ["cat"], ...location4 });
    cy.testUploadRecording(camera, { tags: ["cat"], ...location4 }).then(
      (recordingId) => {
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoringTags(Damian, recording.stationId, ["rat"]);
        });
      }
    );
  });

  it("track tag 'unidentified` is ignored when deciding label to use", () => {
    const camera = "has_unidentified";
    cy.apiDeviceAdd(camera, group);
    const location5 = { lat: -48.0, lng: 172.7 };
    cy.testUploadRecording(camera, {
      tags: ["possum", "unidentified", "unidentified", "unidentified"],
      ...location5,
    }).then((recordingId) => {
      checkRecording(Damian, recordingId, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, ["possum"]);
      });
    });
  });

  it("What happens when user tags as 'unidentified`?", () => {
    const camera = "user_unidentified_tracks";
    cy.apiDeviceAdd(camera, group);
    const location6 = { lat: -48.0, lng: 173.7 };
    cy.testUploadRecording(camera, { tags: ["possum"], ...location6 }).then(
      (recordingId) => {
        cy.testUserTagRecording(recordingId, 0, Damian, "unidentified");
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoringTags(Damian, recording.stationId, ["unidentified"]);
        });
      }
    );
  });

  it("if a user tags a track then this is what should be used as the track tag", () => {
    const camera = "userTagged";
    cy.apiDeviceAdd(camera, group);
    const location7 = { lat: -48.0, lng: 174.7 };
    cy.testUploadRecording(camera, {
      tracks: [
        {
          start_s: 0,
          end_s: 1,
          predictions: [{ confident_tag: "cat", confidence: 0.9, model_id: 1 }],
        },
      ],
      ...location7,
    }).then((recordingId) => {
      cy.testUserTagRecording(recordingId, 0, Damian, "rabbit");
      checkRecording(Damian, recordingId, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, ["rabbit"]);
      });
    });
  });

  it("User tag is preferred over AI tag", () => {
    const camera = "userVsMultiple";
    cy.apiDeviceAdd(camera, group);
    const location8 = { lat: -48.0, lng: 175.7 };
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat"],
      ...location8,
    }).thenUserTagAs(Damian, "rabbit");
    cy.testUploadRecording(camera, { tags: ["possum"], ...location8 }).then(
      (recordingId) => {
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoringTags(Damian, recording.stationId, ["rabbit"]);
        });
      }
    );
  });

  it("When user tag and AI tag agree", () => {
    const camera = "tagsagree";
    cy.apiDeviceAdd(camera, group);
    const location9 = { lat: -47.0, lng: 175.7 };
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat", "rat"],
      ...location9,
    }).thenUserTagAs(Damian, "possum");
    cy.testUploadRecording(camera, { tags: ["possum"], ...location9 }).then(
      (recordingId) => {
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoringTags(Damian, recording.stationId, ["possum"]);
        });
      }
    );
  });

  it("User animal tag is preferred over user unknown tag", () => {
    const camera = "userAnimalUnknown";
    cy.apiDeviceAdd(camera, group);
    const location10 = { lat: -46.0, lng: 175.7 };
    cy.testUploadRecording(camera, {
      tags: ["unidentified", "unidentified", "unidentified"],
      ...location10,
    }).then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 1, Damian, "unknown");
      cy.testUserTagRecording(recID, 2, Damian, "unknown");
      checkRecording(Damian, recID, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, ["possum"]);
      });
    });
  });
  it("User tags conflict: agree on ancestor", () => {
    const camera = "conflicter";
    cy.apiUserAdd(Gerry);
    cy.apiGroupUserAdd(Damian, Gerry, group, true);
    cy.apiDeviceAdd(camera, group);
    const location11 = { lat: -45.0, lng: 175.7 };
    const recording = cy.testUploadRecording(camera, {
      tags: ["possum", "rabbit"],
      ...location11,
    });
    recording.then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 0, Gerry, "rat");
      checkRecording(Damian, recID, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, ["mammal"]);
      });
    });
  });
  it("User tags conflict: disagree on ancestor", () => {
    const camera = "conflicter-ancestors-disagree";
    cy.apiUserAdd(Edward);
    cy.apiGroupUserAdd(Damian, Edward, group, true);
    cy.apiDeviceAdd(camera, group);
    const location11 = { lat: -45.5, lng: 175.7 };
    const recording = cy.testUploadRecording(camera, {
      tags: ["possum", "rabbit"],
      ...location11,
    });
    recording.then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 0, Gerry, "vehicle");
      checkRecording(Damian, recID, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, [
          "conflicting tags",
        ]);
      });
    });
  });
  it("User tags conflict on one of many tracks majority wins", () => {
    const camera = "conflicter-multiple";
    cy.apiDeviceAdd(camera, group);
    const location12 = { lat: -44.0, lng: 175.7 };
    const recording = cy.testUploadRecording(camera, {
      tags: ["possum", "rabbit"],
      ...location12,
    });
    recording.then((recID: number) => {
      cy.testUserTagRecording(recID, 0, Damian, "possum");
      cy.testUserTagRecording(recID, 0, Gerry, "rat");
    });
    cy.testUploadRecording(camera, {
      tags: ["possum", "rat"],
      ...location12,
    }).thenUserTagAs(Damian, "possum");
    cy.testUploadRecording(camera, { tags: ["cat"], ...location12 }).then(
      (recordingId) => {
        cy.testUserTagRecording(recordingId, 0, Damian, "possum");
        checkRecording(Damian, recordingId, (recording) => {
          cy.checkMonitoringTags(Damian, recording.stationId, ["possum"]);
        });
      }
    );
  });

  it("prefer AI animal tags over false-positives", () => {
    const camera = "ai_tag_precedence";
    cy.apiDeviceAdd(camera, group);
    const location13 = { lat: -43.0, lng: 175.7 };
    cy.testUploadRecording(camera, {
      time: "2022-10-29T13:42:22.215Z",
      ...location13,
      tracks: [
        {
          start_s: 4.56,
          end_s: 6.56,
          predictions: [
            {
              confident_tag: "hedgehog",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
        {
          start_s: 0,
          end_s: 16.33,
          predictions: [
            {
              confident_tag: "false-positive",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
      ],
    });

    cy.testUploadRecording(camera, {
      time: "2022-10-29T13:50:20.749Z",
      ...location13,
      tracks: [
        {
          start_s: 0,
          end_s: 17.22,
          predictions: [
            {
              confident_tag: "unidentified",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
        {
          start_s: 15.56,
          end_s: 17.22,
          predictions: [
            {
              confident_tag: "false-positive",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
        {
          start_s: 0,
          end_s: 17,
          predictions: [
            {
              confident_tag: "false-positive",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
      ],
    }).then((recordingId) => {
      checkRecording(Damian, recordingId, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, ["hedgehog"]);
      });
    });
  });

  it("user-confirmed false positives shouldn't override other user tags for visit", () => {
    const camera = "user_tag_precedence";
    cy.apiDeviceAdd(camera, group);
    const location14 = { lat: -42.0, lng: 175.7 };
    cy.testUploadRecording(camera, {
      time: "2022-10-29T13:42:22.215Z",
      ...location14,
      tracks: [
        {
          start_s: 4.56,
          end_s: 6.56,
          predictions: [
            {
              confident_tag: "hedgehog",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
        {
          start_s: 0,
          end_s: 16.33,
          predictions: [
            {
              confident_tag: "false-positive",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
      ],
    }).then((recordingId) => {
      cy.testUserTagRecording(recordingId, 0, Damian, "hedgehog");
      cy.testUserTagRecording(recordingId, 1, Damian, "false-positive");
    });

    cy.testUploadRecording(camera, {
      time: "2022-10-29T13:50:20.749Z",
      ...location14,
      tracks: [
        {
          start_s: 0,
          end_s: 17.22,
          predictions: [
            {
              confident_tag: "unidentified",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
        {
          start_s: 15.56,
          end_s: 17.22,
          predictions: [
            {
              confident_tag: "false-positive",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
        {
          start_s: 0,
          end_s: 17,
          predictions: [
            {
              confident_tag: "false-positive",
              model_id: 1,
              confidence: 0.9,
            },
          ],
        },
      ],
    }).then((recordingId) => {
      cy.testUserTagRecording(recordingId, 0, Damian, "cat");
      cy.testUserTagRecording(recordingId, 1, Damian, "false-positive");
      cy.testUserTagRecording(recordingId, 2, Damian, "false-positive");

      checkRecording(Damian, recordingId, (recording) => {
        cy.checkMonitoringTags(Damian, recording.stationId, [
          "cat",
          "hedgehog",
        ]);
      });
    });
  });
});
