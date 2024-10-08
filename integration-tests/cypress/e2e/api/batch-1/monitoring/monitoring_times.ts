import { addSeconds, checkRecording } from "@commands/api/recording-tests";

describe("Monitoring : times and recording groupings", () => {
  const Dexter = "Dexter";
  const group = "Monitoring_visits";

  before(() => {
    cy.testCreateUserAndGroup(Dexter, group);
  });

  it("recordings less than 10 mins apart are considered a single visit", () => {
    const camera = "cam-close";
    cy.apiDeviceAdd(camera, group);
    const location1 = { lat: -44.0, lng: 172.7 };
    cy.testAddRecordingsAtTimes(
      camera,
      ["21:04", "21:13", "21:22"],
      location1
    ).then((recordingIds) => {
      checkRecording(Dexter, recordingIds[0], (recording) => {
        cy.checkMonitoring(Dexter, recording.stationId, [{ recordings: 3 }]);
      });
    });
  });

  it("recordings more 10 mins apart are different visits", () => {
    const camera = "cam-apart";
    cy.apiDeviceAdd(camera, group);
    const location2 = { lat: -45.0, lng: 172.7 };
    cy.testAddRecordingsAtTimes(camera, ["21:04", "21:15"], location2).then(
      (recordingIds) => {
        checkRecording(Dexter, recordingIds[0], (recording) => {
          cy.checkMonitoring(Dexter, recording.stationId, [
            { recordings: 1 },
            { recordings: 1 },
          ]);
        });
      }
    );
  });

  it("recordings exactly 10 mins apart end to start are different visits", () => {
    const camera = "cam-exactly-10-apart";
    cy.apiDeviceAdd(camera, group);
    const location2 = { lat: -46.0, lng: 172.7 };
    cy.testUploadRecording(camera, { duration: 60, ...location2 });
    cy.testUploadRecording(camera, { minsLater: 11, ...location2 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          cy.checkMonitoring(Dexter, recording.stationId, [
            { recordings: 1 },
            { recordings: 1 },
          ]);
        });
      }
    );
  });

  it("recordings can start more than 10 mins apart so long as gap between one finishing and the next starting is less than 10 mins", () => {
    const camera = "cam-just-close";
    cy.apiDeviceAdd(camera, group);
    const location3 = { lat: -47.0, lng: 172.7 };
    cy.testUploadRecording(camera, { duration: 61, ...location3 });
    cy.testUploadRecording(camera, { minsLater: 11, ...location3 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          cy.checkMonitoring(Dexter, recording.stationId, [{ recordings: 2 }]);
        });
      }
    );
  });

  //  This feature has been disabled by Clare
  //    it("recordings with no tracks are not visits", () => {
  //    const camera = "cam-notracks";
  //    cy.apiDeviceAdd(camera, group);
  //    cy.testUploadRecording(camera, { tracks:[]});
  //    cy.checkMonitoring(Dexter, camera, []);
  //  });

  //    it("recordings with no tracks are not included in visits the fall within", () => {
  //    const camera = "cam-notracks-within-visit-timespan";
  //    cy.apiDeviceAdd(camera, group);
  //    cy.testUploadRecording(camera, { });
  //    cy.testUploadRecording(camera, { minsLater: 5, tracks:[]});
  //    cy.testUploadRecording(camera, { minsLater: 10});
  //    cy.checkMonitoring(Dexter, camera, [{ recordings: 2 }]);
  //  });

  it("Visits where the first recording is before the start time, but overlap with search period are marked as incomplete", () => {
    const camera = "cam-start-before";
    cy.apiDeviceAdd(camera, group);
    const location4 = { lat: -48.0, lng: 172.7 };
    cy.testUploadRecording(camera, {
      time: "20:49",
      duration: 300,
      ...location4,
    });
    cy.testUploadRecording(camera, { time: "21:02", ...location4 });
    cy.testUploadRecording(camera, { time: "21:22", ...location4 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          const filter = {
            from: "21:00",
          };
          cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, [
            { start: "20:49", incomplete: "true" },
            { start: "21:22" },
          ]);
        });
      }
    );
  });

  it("Visits where the first recording is just before the search period, but don't overlap with the search period are ignored.", () => {
    const camera = "cam-before-ignore";
    cy.apiDeviceAdd(camera, group);
    const location5 = { lat: -49.0, lng: 172.7 };
    cy.testUploadRecording(camera, { time: "20:51", ...location5 });
    cy.testUploadRecording(camera, { time: "21:22", ...location5 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          const filter = {
            from: "21:00",
          };

          cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, [
            { start: "21:22" },
          ]);
        });
      }
    );
  });

  //boundary cases

  it("Visits where the last recording starts on period start time boundary is not included.", () => {
    const camera = "cam-start-boundary-case";
    cy.apiDeviceAdd(camera, group);
    const location6 = { lat: -49.0, lng: 173.7 };
    cy.testUploadRecording(camera, { time: "20:40", ...location6 });
    cy.testUploadRecording(camera, { time: "20:50", ...location6 });
    cy.testUploadRecording(camera, { time: "21:00", ...location6 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          const filter = {
            from: "21:00",
          };
          cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, []);
        });
      }
    );
  });

  it("Visits where the last recording ends on period end time boundary is included and complete.", () => {
    const camera = "cam-end-boundary-case";
    cy.apiDeviceAdd(camera, group);
    const location7 = { lat: -48.0, lng: 173.7 };
    cy.testUploadRecording(camera, { time: "20:40", ...location7 });
    cy.testUploadRecording(camera, { time: "20:50", ...location7 });
    cy.testUploadRecording(camera, { time: "21:00", ...location7 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          const filter = {
            until: "21:00",
          };
          cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, [
            { recordings: 3, start: "20:40", incomplete: "false" },
          ]);
        });
      }
    );
  });

  it("Visits which span the end-time but fall withing the collection window are included and marked as complete", () => {
    const camera = "cam-start-justbefore";
    cy.apiDeviceAdd(camera, group);
    const location8 = { lat: -47.0, lng: 173.7 };
    cy.testUploadRecording(camera, {
      time: "20:59",
      duration: 300,
      ...location8,
    });
    cy.testUploadRecording(camera, { time: "21:05", ...location8 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          const filter = {
            until: "21:00",
          };
          cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, [
            { recordings: 2, start: "20:59", incomplete: "false" },
          ]);
        });
      }
    );
  });

  it("Visits where the first recording is after the end time are ignored", () => {
    const camera = "cam-start-after";
    cy.apiDeviceAdd(camera, group);
    const location9 = { lat: -46.0, lng: 173.7 };
    cy.testUploadRecording(camera, {
      time: "21:01",
      duration: 300,
      ...location9,
    });
    cy.testUploadRecording(camera, { time: "21:13", ...location9 }).then(
      (recordingId) => {
        checkRecording(Dexter, recordingId, (recording) => {
          const filter = {
            until: "21:00",
          };
          cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, []);
        });
      }
    );
  });

  it("Visits where maybe there are even more recordings than collected are marked as incomplete", () => {
    const camera = "justLater";
    // add 12 recordings
    cy.apiDeviceAdd(camera, group);
    const location10 = { lat: -45.0, lng: 173.7 };
    const recording = cy.testUploadRecording(camera, {
      time: "20:55",
      duration: 300,
      ...location10,
    });
    for (let i = 0; i < 11; i++) {
      cy.testUploadRecording(camera, { minsLater: 9, ...location10 });
    }
    recording.then((recordingId) => {
      checkRecording(Dexter, recordingId, (recording) => {
        const filter = {
          until: "21:00",
        };

        // only 9 recordings are collected from the database
        cy.checkMonitoringWithFilter(Dexter, recording.stationId, filter, [
          { recordings: 9, incomplete: "true" },
        ]);
      });
    });
  });

  it("test start and end date of visits", () => {
    const camera = "dateTimes";
    const videoStart = new Date(2021, 1, 20, 21);
    cy.apiDeviceAdd(camera, group);
    const location11 = { lat: -44.0, lng: 173.7 };
    cy.testUploadRecording(camera, {
      time: videoStart,
      duration: 15,
      ...location11,
    }).then((recordingId) => {
      checkRecording(Dexter, recordingId, (recording) => {
        cy.checkMonitoring(Dexter, recording.stationId, [
          { start: videoStart, end: addSeconds(videoStart, 15) },
        ]);
      });
    });
  });

  it("test start and end date of visits with multiple videos", () => {
    const camera = "dateTimes3";
    const videoStart = new Date(2021, 1, 20, 21);
    const location12 = { lat: -43.0, lng: 173.7 };
    cy.apiDeviceAdd(camera, group);
    cy.testUploadRecording(camera, {
      time: videoStart,
      duration: 23,
      ...location12,
    });
    cy.testUploadRecording(camera, {
      secsLater: 66,
      duration: 41,
      ...location12,
    }).then((recordingId) => {
      checkRecording(Dexter, recordingId, (recording) => {
        cy.checkMonitoring(Dexter, recording.stationId, [
          { start: videoStart, end: addSeconds(videoStart, 66 + 41) },
        ]);
      });
    });
  });
});
