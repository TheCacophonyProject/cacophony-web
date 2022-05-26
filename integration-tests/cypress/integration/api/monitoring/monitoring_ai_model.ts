/// <reference path="../../../support/index.d.ts" />

import { checkRecording } from "@commands/api/recording-tests";

describe("Monitoring : evaluate ai model", () => {
  const Claris = "Claris";
  const group = "Visit-ai";

  before(() => {
    cy.testCreateUserAndGroup(Claris, group);
  });

  it("By default, AI-tag returns what the AI Master model produces.  ", () => {
    const camera = "ai-default";
    const location = { lat: -45.29115, lng: 169.30845 };
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      model: "Master",
      tags: ["possum"],
      ...location,
    });
    cy.testUploadRecording(camera, {
      model: "Catter",
      tags: ["cat"],
      ...location,
    }).then((recordingId) => {
      // Get the station assigned to the recording.
      checkRecording(Claris, recordingId, (recording) => {
        cy.log("Check monitoring", JSON.stringify(recording));
        cy.checkMonitoring(Claris, recording.stationId, [
          { tag: "possum", aiTag: "possum" },
        ]);
      });
    });
  });

  it("If an ai model is specified then it uses that model to calculate the results.  ", () => {
    const camera = "ai-different";
    const location = { lat: -45.29115, lng: 170.30845 };
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      model: "Master",
      tags: ["possum"],
      ...location,
    });
    cy.testUploadRecording(camera, {
      model: "Catter",
      tags: ["cat"],
      ...location,
    }).then((recordingId) => {
      // Get the station assigned to the recording.
      checkRecording(Claris, recordingId, (recording) => {
        cy.checkMonitoringWithFilter(
          Claris,
          recording.stationId,
          { ai: "Catter" },
          [{ tag: "possum", aiTag: "cat" }]
        );
      });
    });
  });

  it("If an ai model is specified then it uses that model to calculate the results.  ", () => {
    const camera = "ai-users-best";
    const location = { lat: -45.29115, lng: 171.30845 };
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      model: "Catter",
      tags: ["rat"],
      ...location,
    });
    cy.testUploadRecording(camera, {
      model: "Catter",
      tags: ["cat"],
      ...location,
    });
    cy.testUploadRecording(camera, {
      model: "Catter",
      tags: ["cat"],
      ...location,
    }).then((recordingId) => {
      checkRecording(Claris, recordingId, (recording) => {
        cy.checkMonitoringWithFilter(
          Claris,
          recording.stationId,
          { ai: "Catter" },
          [{ tag: "none", aiTag: "cat" }]
        );
      });
    });
  });
});
