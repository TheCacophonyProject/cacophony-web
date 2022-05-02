import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";

describe("Monitoring : multiple cameras and stations", () => {
  const Penny = "Penny";

  before(() => {
    cy.apiUserAdd(Penny);
  });

  it("Recordings at the same time on different cameras are never grouped together", () => {
    const group = "cameras-2";
    const cameraA = "cameraA";
    const cameraB = "cameraB";
    cy.testCreateGroupAndDevices(Penny, group, cameraA, cameraB);
    cy.testUploadRecording(cameraA, { tags: ["possum"] });
    cy.testUploadRecording(cameraB, { tags: ["cat"] });
    cy.checkMonitoring(Penny, null, [
      { camera: cameraA, tag: "possum" },
      { camera: cameraB, tag: "cat" },
    ]);
  });

  it("Station name should be recorded, and reported", () => {
    const group = "stations";
    const camera = "camera2";
    cy.testCreateGroupAndDevices(Penny, group, camera);

    const station1 = { name: "forest", lat: -44.0, lng: 172.7 };
    const station2 = { name: "waterfall", lat: -43.6, lng: 172.8 };

    cy.apiGroupStationAdd(Penny, group, station1).then(() => {
      cy.apiGroupStationAdd(Penny, group, station2).then(() => {
        cy.testUploadRecording(camera, {
          tags: ["possum"],
          lat: -44.0,
          lng: 172.7,
          time: new Date(),
        }).thenCheckStationNameIs(Penny, getTestName("forest"));
        cy.testUploadRecording(camera, {
          tags: ["cat"],
          lat: -44.0,
          lng: 172.7,
          time: new Date(),
        }).thenCheckStationNameIs(Penny, getTestName("forest"));
        cy.checkMonitoring(Penny, camera, [{ station: getTestName("forest") }]);
      });
    });
  });

  it("If station changes the a new visit should be created", () => {
    const group = "stations-diff";
    const camera = "camera3";
    cy.testCreateGroupAndDevices(Penny, group, camera);

    const location1 = { lat: -44.0, lng: 172.7 };
    const location2 = { lat: -43.6, lng: 172.8 };

    cy.apiGroupStationAdd(Penny, group, { ...location1, name: "forest" }).then(
      () => {
        cy.apiGroupStationAdd(Penny, group, {
          ...location2,
          name: "waterfall",
        }).then(() => {
          cy.testUploadRecording(camera, {
            ...location1,
            tags: ["possum"],
            time: new Date(),
          }).thenCheckStationNameIs(Penny, getTestName("forest"));

          cy.testUploadRecording(camera, {
            ...location2,
            tags: ["cat"],
            time: new Date(),
          }).thenCheckStationNameIs(Penny, getTestName("waterfall"));
          cy.checkMonitoring(Penny, camera, [
            { station: getTestName("waterfall") },
            { station: getTestName("forest") },
          ]);
        });
      }
    );
  });
});
