import { getTestName } from "@commands/names";
import { checkRecording } from "@commands/api/recording-tests";

describe("Monitoring : multiple cameras and stations", () => {
  const Penny = "Penny";

  before(() => {
    cy.apiUserAdd(Penny);
  });

  it("Station name should be recorded, and reported", () => {
    // in test
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
        })
          .thenCheckStationNameIs(Penny, getTestName("forest"))
          .then(() => {
            cy.testUploadRecording(camera, {
              tags: ["cat"],
              lat: -44.0,
              lng: 172.7,
              time: new Date(),
            }).then((recordingId) => {
              checkRecording(Penny, recordingId, (recording) => {
                expect(recording.stationName).equals(getTestName("forest"));
                cy.checkMonitoring(Penny, recording.stationId, [
                  { stationName: getTestName("forest") },
                ]);
              });
            });
          });
      });
    });
  });

  it("If station changes the a new visit should be created", () => {
    // FIXME?: Not sure this is actually testing what it says it is

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
          }).then((recordingId) => {
            checkRecording(Penny, recordingId, (recording) => {
              expect(recording.stationName).equals(getTestName("forest"));
              cy.checkMonitoring(Penny, recording.stationId, [
                { stationName: getTestName("forest") },
              ]);
            });
          });

          cy.testUploadRecording(camera, {
            ...location2,
            tags: ["cat"],
            time: new Date(),
          }).then((recordingId) => {
            checkRecording(Penny, recordingId, (recording) => {
              expect(recording.stationName).equals(getTestName("waterfall"));
              cy.checkMonitoring(Penny, recording.stationId, [
                { stationName: getTestName("waterfall") },
              ]);
            });
          });
        });
      }
    );
  });
});
