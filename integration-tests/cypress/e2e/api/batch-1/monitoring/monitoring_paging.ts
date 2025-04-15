import { checkRecording } from "@commands/api/recording-tests";

describe("Monitoring : pagings", () => {
  const Veronica = "Veronica_visits";

  const group = "visits-paging";

  before(() => {
    cy.testCreateUserAndGroup(Veronica, group);
  });

  it("recordings are broken into approximate pages by start date", () => {
    const camera = "basic";

    cy.apiDeviceAdd(camera, group);
    cy.testAddRecordingsAtTimes(
      camera,
      ["21:03", "21:23", "21:43", "22:03", "22:23", "22:43", "23:03"],
      { lat: -44.0, lng: 172.7 },
    ).then((recordingIds) => {
      checkRecording(Veronica, recordingIds[0], (recording) => {
        cy.checkMonitoringWithFilter(
          Veronica,
          recording.stationId,
          { "page-size": 3, page: 1 },
          [{ start: "22:23" }, { start: "22:43" }, { start: "23:03" }],
        );
        cy.checkMonitoringWithFilter(
          Veronica,
          recording.stationId,
          { "page-size": 3, page: 2 },
          [{ start: "21:23" }, { start: "21:43" }, { start: "22:03" }],
        );
        cy.checkMonitoringWithFilter(
          Veronica,
          recording.stationId,
          { "page-size": 3, page: 3 },
          [{ start: "21:03" }],
        );
      });
    });
  });

  it("visits can finish for some cameras beyond the start time for others", () => {
    const Henry = "Henry";
    const group = "visits-two-cams";
    cy.testCreateUserAndGroup(Henry, group).then(({ groupId }) => {
      const camera1 = "cam-1";
      const camera2 = "cam-2";
      const location1 = { lat: -44.0, lng: 172.7 };
      const location2 = { lat: -45.0, lng: 172.7 };
      cy.apiDeviceAdd(camera1, group);
      cy.apiDeviceAdd(camera2, group);
      cy.testAddRecordingsAtTimes(
        camera1,
        ["21:03", "21:14", "21:25"],
        location1,
      );
      cy.testAddRecordingsAtTimes(
        camera2,
        ["21:13", "21:18", "21:27"],
        location2,
      ); // all one visit

      cy.checkMonitoringWithFilter(
        Henry,
        null,
        { "page-size": 3, page: 1, groups: groupId },
        [
          { recordings: 3, start: "21:13" },
          { recordings: 1, start: "21:14" },
          { recordings: 1, start: "21:25" },
        ],
      );
      cy.checkMonitoringWithFilter(
        Henry,
        null,
        { "page-size": 3, page: 2, groups: groupId },
        [{ recordings: 1, start: "21:03" }],
      );
    });
  });

  it("visits can start at exactly the same time on multiple cameras and paging still works (even if all pages won't be equal size).", () => {
    const Bobletta = "Bobletta";
    const group = "visits-same-time";
    const camera1 = "cam-1";
    const camera2 = "cam-2";
    const camera3 = "cam-3";
    const visitTime = "21:10";
    const nextVisitTime = "21:33";
    const location1 = { lat: -44.0, lng: 172.7 };
    const location2 = { lat: -45.0, lng: 172.7 };
    const location3 = { lat: -46.0, lng: 172.7 };
    cy.apiUserAdd(Bobletta);
    cy.testCreateGroupAndDevices(
      Bobletta,
      group,
      camera1,
      camera2,
      camera3,
    ).then(({ groupId }) => {
      cy.testUploadRecording(camera1, { time: visitTime, ...location1 });
      cy.testUploadRecording(camera2, { time: visitTime, ...location2 });
      cy.testUploadRecording(camera3, { time: visitTime, ...location3 });
      cy.testUploadRecording(camera1, { time: nextVisitTime, ...location1 });

      cy.checkMonitoringWithFilter(
        Bobletta,
        null,
        { "page-size": 2, page: 2, groups: groupId },
        [{ start: visitTime }, { start: visitTime }, { start: visitTime }],
      );
      cy.checkMonitoringWithFilter(
        Bobletta,
        null,
        { "page-size": 2, page: 1, groups: groupId },
        [{ start: nextVisitTime }],
      );
    });
  });

  it("visits that start before search period but cross into search period are only shown on the last page", () => {
    const camera = "close recordings";
    cy.apiDeviceAdd(camera, group);
    const location3 = { lat: -46.0, lng: 172.7 };
    cy.testAddRecordingsAtTimes(
      camera,
      ["21:03", "21:13", "21:40", "21:45", "22:10", "22:40", "23:10"],
      location3,
    ).then((recordingIds) => {
      checkRecording(Veronica, recordingIds[0], (recording) => {
        cy.checkMonitoringWithFilter(
          Veronica,
          recording.stationId,
          { "page-size": 3, page: 1, from: "21:10" },
          [{ start: "22:10" }, { start: "22:40" }, { start: "23:10" }],
        );

        cy.checkMonitoringWithFilter(
          Veronica,
          recording.stationId,
          { "page-size": 3, page: 2, from: "21:10" },
          [{ start: "21:03", incomplete: "true" }, { start: "21:40" }],
        );
      });
    });
  });
});
