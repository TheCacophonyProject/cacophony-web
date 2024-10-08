import { TestCreateRecordingData } from "@commands/api/recording-tests";
import { TestGetLocation } from "@commands/api/station";
import { TestCreateExpectedHistoryEntry } from "@commands/api/device";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { TEMPLATE_AUDIO_RECORDING } from "@commands/dataTemplate";
import { getCreds } from "@commands/server";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { getTestName } from "@commands/names";
import { DeviceHistoryEntry, TestNameAndId } from "@commands/types";

const templateExpectedCypressRecording: ApiThermalRecordingResponse =
  JSON.parse(JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE));

const templateExpectedStation = {
  location,
  name: NOT_NULL_STRING,
  id: NOT_NULL,
  lastThermalRecordingTime: NOT_NULL_STRING,
  createdAt: NOT_NULL_STRING,
  updatedAt: NOT_NULL_STRING,
  activeAt: NOT_NULL_STRING,
  automatic: true,
  needsRename: true,
  groupId: NOT_NULL,
  groupName: NOT_NULL_STRING,
};

describe("Stations: assign recordings to stations", () => {
  const Josie = "Josie_recordings_stations";
  const group = "recordings_stations";
  const group2 = "recordings_stations-2";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group).id;
      templateExpectedCypressRecording.groupName = getTestName(group);
      templateExpectedStation.groupId = getCreds(group).id;
      templateExpectedStation.groupName = getTestName(group);
    });
    cy.apiGroupAdd(Josie, group2);
  });

  it("Adding a recording in a new location automatically creates a new station, deviceHistory", () => {
    const deviceName = "new-device";
    const recordingTime = new Date(
      new Date().setDate(new Date().getDate() + 1)
    );
    const location = TestGetLocation(1);
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];

    expectedStation1.location = location;
    expectedStation1.activeAt = recordingTime.toISOString();
    expectedStation1.lastThermalRecordingTime = recordingTime.toISOString();
    cy.apiDeviceAdd(deviceName, group).then(() => {
      cy.log("Add a recording and check new station is created");
      cy.testUploadRecording(deviceName, {
        ...location,
        time: recordingTime,
        noTracks: true,
      })
        .thenCheckStationIsNew(Josie)
        .then((station: TestNameAndId) => {
          cy.log("Check station created correctly");
          cy.apiStationCheck(Josie, station.name, expectedStation1);

          cy.log("Check device has a new valid deviceHistory created");
          expectedHistory[0] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            NOT_NULL_STRING,
            null,
            "register",
            null
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            recordingTime.toISOString(),
            location,
            "automatic",
            station.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
        });
    });
  });

  it("Adding a recording within the radius of an existing station assigns the existing station to the recording, updates lastThermalRecording", () => {
    const deviceName = "new-device-2";
    const location = TestGetLocation(2);
    const nearbyLocation = TestGetLocation(2, 0.0001);
    const oneDayLater = new Date(new Date().setDate(new Date().getDate() + 1));
    const twoDaysLater = new Date(new Date().setDate(new Date().getDate() + 2));
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];

    expectedStation1.location = location;
    expectedStation1.activeAt = oneDayLater.toISOString();
    expectedStation1.lastThermalRecordingTime = oneDayLater.toISOString();
    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add a recording and check new station created");
    cy.testUploadRecording(deviceName, {
      ...location,
      time: oneDayLater,
      noTracks: true,
    })
      .thenCheckStationIsNew(Josie)
      .then((station: TestNameAndId) => {
        cy.log(
          "Check activeAt and lastThermalRecording match recordingDateTime"
        );
        cy.apiStationCheck(Josie, station.name, expectedStation1);

        cy.log("Check device has a new valid deviceHistory created");
        expectedHistory[0] = TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          NOT_NULL_STRING,
          null,
          "register",
          null
        );
        expectedHistory[1] = TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          oneDayLater.toISOString(),
          location,
          "automatic",
          station.name
        );
        cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

        cy.log(
          "Upload another recording and check assigned to existing station"
        );
        cy.testUploadRecording(deviceName, {
          ...nearbyLocation,
          time: twoDaysLater,
        })
          .thenCheckStationNameIs(Josie, station.name)
          .then(() => {
            cy.log(
              "Check activeAt unchanged, lastThermalRecording matches new recordingDateTime"
            );
            expectedStation1.lastThermalRecordingTime =
              twoDaysLater.toISOString();
            cy.apiStationCheck(Josie, station.name, expectedStation1);

            cy.log("Check new deviceHistoery for new location");
            expectedHistory[2] = TestCreateExpectedHistoryEntry(
              deviceName,
              group,
              twoDaysLater.toISOString(),
              nearbyLocation,
              "automatic",
              station.name
            );
            cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
          });
      });
  });

  it("Adding an earlier recording within the radius of an existing station assigns the existing station to the recording, does not update lastThermalRecording", () => {
    const deviceName = "new-device-3";
    const stationName = "new-station-3";
    const location = TestGetLocation(3);
    const nearbyLocation = TestGetLocation(3, 0.0001);
    const oneDaysTime = new Date(new Date().setDate(new Date().getDate() + 1));
    const twoDaysTime = new Date(new Date().setDate(new Date().getDate() + 2));
    const threeDaysTime = new Date(
      new Date().setDate(new Date().getDate() + 3)
    );
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];
    expectedStation1.location = location;
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
    delete expectedStation1.needsRename;

    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add a station active day 1");
    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneDaysTime.toISOString()
    ).then((stationId: number) => {
      cy.log(
        "Check activeAt matches set value, no retiredAt, no lastThermalRecording"
      );
      expectedStation1.activeAt = oneDaysTime.toISOString();
      delete expectedStation1.lastThermalRecordingTime;
      delete expectedStation1.retiredAt;
      cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

      cy.log(
        "Add a matching recording, dated day 3 and check assigned to existing station"
      );
      cy.testUploadRecording(deviceName, { ...location, time: threeDaysTime })
        .thenCheckStationIdIs(Josie, stationId)
        .then((station: TestNameAndId) => {
          cy.log(
            "Check activeAt unchanged, lastThermalRecording now matches recordingDateTime"
          );
          expectedStation1.activeAt = oneDaysTime.toISOString();
          expectedStation1.lastThermalRecordingTime =
            threeDaysTime.toISOString();
          cy.apiStationCheck(Josie, station.name, expectedStation1);

          cy.log("Check device has a new valid deviceHistory created");
          expectedHistory[0] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            NOT_NULL_STRING,
            null,
            "register",
            null
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            threeDaysTime.toISOString(),
            location,
            "automatic",
            station.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log(
            "Upload an earlier recording dated day 2 and check assigned to existing station"
          );
          cy.testUploadRecording(deviceName, {
            ...nearbyLocation,
            time: twoDaysTime,
            noTracks: true,
          })
            .thenCheckStationNameIs(Josie, station.name)
            .then(() => {
              cy.log(
                "Check station activeAt unchanged, lastThermalRecording not changed (as 2nd recording was earlier than 1st)"
              );
              expectedStation1.activeAt = oneDaysTime.toISOString();
              expectedStation1.lastThermalRecordingTime =
                threeDaysTime.toISOString();
              cy.apiStationCheck(Josie, station.name, expectedStation1);

              cy.log(
                "Check earlier deviceHistory entry added backdated to earlier recording time"
              );
              expectedHistory[2] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                twoDaysTime.toISOString(),
                nearbyLocation,
                "automatic",
                station.name
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
            });
        });
    });
  });

  it("Adding an earlier recording matching exactly an existing station assigns the existing station to the recording, does not update lastThermalRecording", () => {
    const deviceName = "new-device-22";
    const stationName = "new-station-22";
    const location = TestGetLocation(22);
    const oneDaysTime = new Date(new Date().setDate(new Date().getDate() + 1));
    const twoDaysTime = new Date(new Date().setDate(new Date().getDate() + 2));
    const threeDaysTime = new Date(
      new Date().setDate(new Date().getDate() + 3)
    );
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];
    expectedStation1.location = location;
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
    delete expectedStation1.needsRename;

    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add a station active day 1");
    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneDaysTime.toISOString()
    ).then((stationId: number) => {
      cy.log(
        "Check activeAt matches set value, no retiredAt, no lastThermalRecording"
      );
      expectedStation1.activeAt = oneDaysTime.toISOString();
      delete expectedStation1.lastThermalRecordingTime;
      delete expectedStation1.retiredAt;
      cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

      cy.log(
        "Add a matching recording, dated day 3 and check assigned to existing station"
      );
      cy.testUploadRecording(deviceName, {
        ...location,
        time: threeDaysTime,
        noTracks: true,
      })
        .thenCheckStationIdIs(Josie, stationId)
        .then((station: TestNameAndId) => {
          cy.log(
            "Check activeAt unchanged, lastThermalRecording now matches recordingDateTime"
          );
          expectedStation1.activeAt = oneDaysTime.toISOString();
          expectedStation1.lastThermalRecordingTime =
            threeDaysTime.toISOString();
          cy.apiStationCheck(Josie, station.name, expectedStation1);

          cy.log("Check device has a new valid deviceHistory created");
          expectedHistory[0] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            NOT_NULL_STRING,
            null,
            "register",
            null
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            threeDaysTime.toISOString(),
            location,
            "automatic",
            station.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log(
            "Upload an earlier recording dated day 2 and check assigned to existing station"
          );
          cy.testUploadRecording(deviceName, {
            ...location,
            time: twoDaysTime,
            noTracks: true,
          })
            .thenCheckStationNameIs(Josie, station.name)
            .then(() => {
              cy.log(
                "Check station activeAt unchanged, lastThermalRecording not changed (as 2nd recording was earlier than 1st)"
              );
              expectedStation1.activeAt = oneDaysTime.toISOString();
              expectedStation1.lastThermalRecordingTime =
                threeDaysTime.toISOString();
              cy.apiStationCheck(Josie, station.name, expectedStation1);

              cy.log(
                "Check existing deviceHistory entry backdated to earlier recording time"
              );
              expectedHistory[1] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                twoDaysTime.toISOString(),
                location,
                "automatic",
                station.name
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
            });
        });
    });
  });

  it("Adding a recording matching location but in another group creates new station", () => {
    const device1Name = "new-device-4-1";
    const device2Name = "new-device-4-2";
    const location = TestGetLocation(4);
    const nearbyLocation = TestGetLocation(4, 0.0001);

    cy.apiDeviceAdd(device1Name, group);
    cy.apiDeviceAdd(device2Name, group2);

    cy.testUploadRecording(device1Name, { ...location, noTracks: true })
      .thenCheckStationIsNew(Josie)
      .then((station1: any) => {
        cy.log("Upload another recording and check assigned to same station");
        cy.testUploadRecording(device2Name, {
          ...nearbyLocation,
          noTracks: true,
        })
          .thenCheckStationIsNew(Josie)
          .then((station2: any) => {
            cy.log("Check stations were different");
            expect(
              station1.id,
              "Both recordings get different new stations"
            ).to.not.equal(station2.id);
          });
      });
  });

  it("Adding a recording matching location before automatic start-time extends start-time backwards", () => {
    const deviceName = "new-device-5";
    const nearbyLocation = TestGetLocation(5, 0.0001);
    const oneDaysTime = new Date(new Date().setDate(new Date().getDate() + 1));
    const twoDaysTime = new Date(new Date().setDate(new Date().getDate() + 2));
    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];
    expectedStation1.location = nearbyLocation;
    expectedStation1.activeAt = twoDaysTime.toISOString();
    cy.apiDeviceAdd(deviceName, group);
    cy.testUploadRecording(deviceName, {
      ...nearbyLocation,
      time: twoDaysTime,
      noTracks: true,
    })
      .thenCheckStationIsNew(Josie)
      .then((station: TestNameAndId) => {
        cy.log("Check startDate is same as recording (day 2)");
        cy.apiStationCheck(Josie, station.name, expectedStation1);

        cy.log("Check device has a new valid deviceHistory created");
        expectedHistory[0] = TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          NOT_NULL_STRING,
          null,
          "register",
          null
        );
        expectedHistory[1] = TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          twoDaysTime.toISOString(),
          nearbyLocation,
          "automatic",
          station.name
        );
        cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

        cy.log("Upload another recording and check assigned to same station");
        cy.testUploadRecording(deviceName, {
          ...nearbyLocation,
          time: oneDaysTime,
          noTracks: true,
        })
          .thenCheckStationIdIs(Josie, station.id)
          .then(() => {
            cy.log("Check station start time extended backwards (now day 1)");
            expectedStation1.activeAt = oneDaysTime.toISOString();
            cy.apiStationCheck(Josie, station.name, expectedStation1);

            cy.log(
              "Check existing deviceHistory entry backdated to earlier recording time"
            );
            expectedHistory[1] = TestCreateExpectedHistoryEntry(
              deviceName,
              group,
              oneDaysTime.toISOString(),
              nearbyLocation,
              "automatic",
              station.name
            );
            cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
          });
      });
  });

  it("Subsequent recording in new location creates new station", () => {
    const deviceName = "new-device-6";
    const station1Name = "new-station-6-1";
    const location1 = TestGetLocation(6);
    const location1Nearby = TestGetLocation(6, 0.0001);
    const location2 = TestGetLocation(0);
    const oneDaysTime = new Date(new Date().setDate(new Date().getDate() + 1));
    const twoDaysTime = new Date(new Date().setDate(new Date().getDate() + 2));
    const threeDaysTime = new Date(
      new Date().setDate(new Date().getDate() + 3)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];
    cy.apiDeviceAdd(deviceName, group);
    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: station1Name, ...location1 },
      oneDaysTime.toISOString()
    );

    cy.log("Upload recording in location1, check matched to station1");
    cy.testUploadRecording(deviceName, {
      ...location1Nearby,
      time: twoDaysTime,
      noTracks: true,
    })
      .thenCheckStationNameIs(Josie, getTestName(station1Name))
      .then(() => {
        cy.log("Check device has a new valid deviceHistory created");
        expectedHistory[0] = TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          NOT_NULL_STRING,
          null,
          "register",
          null
        );
        expectedHistory[1] = TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          twoDaysTime.toISOString(),
          location1Nearby,
          "automatic",
          getTestName(station1Name)
        );
        cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

        cy.log(
          "Upload later recording in location2, check new station created"
        );
        cy.testUploadRecording(deviceName, {
          ...location2,
          time: threeDaysTime,
          noTracks: true,
        })
          .thenCheckStationIsNew(Josie)
          .then((station2: TestNameAndId) => {
            cy.log("Check device has a new valid deviceHistory created");
            expectedHistory[2] = TestCreateExpectedHistoryEntry(
              deviceName,
              group,
              threeDaysTime.toISOString(),
              location2,
              "automatic",
              station2.name
            );
            cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
          });
      });
  });

  it("Multiple recordings match multiple stations", () => {
    const deviceName = "new-device-7";
    const station1Name = "new-station-7-1";
    const station2Name = "new-station-7-2";
    const location1 = TestGetLocation(7);
    const location1Nearby = TestGetLocation(7, 0.0001);
    const location2 = TestGetLocation(8);
    const oneDaysTime = new Date(new Date().setDate(new Date().getDate() + 1));
    const twoDaysTime = new Date(new Date().setDate(new Date().getDate() + 2));
    const threeDaysTime = new Date(
      new Date().setDate(new Date().getDate() + 3)
    );
    const expectedHistory: DeviceHistoryEntry[] = [];
    cy.apiDeviceAdd(deviceName, group);
    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: station1Name, ...location1 },
      oneDaysTime.toISOString()
    ).then(() => {
      cy.apiGroupStationAdd(
        Josie,
        group,
        { name: station2Name, ...location2 },
        oneDaysTime.toISOString()
      ).then(() => {
        cy.log("Upload recording in location1, check matched to station1");
        cy.testUploadRecording(deviceName, {
          ...location1Nearby,
          time: twoDaysTime,
          noTracks: true,
        })
          .thenCheckStationNameIs(Josie, getTestName(station1Name))
          .then(() => {
            cy.log("Upload recording in location2, check matched to station2");
            cy.testUploadRecording(deviceName, {
              ...location2,
              time: threeDaysTime,
              noTracks: true,
            })
              .thenCheckStationNameIs(Josie, getTestName(station2Name))
              .then(() => {
                cy.log("Check device has two new valid deviceHistory created");
                expectedHistory[0] = TestCreateExpectedHistoryEntry(
                  deviceName,
                  group,
                  NOT_NULL_STRING,
                  null,
                  "register",
                  null
                );
                expectedHistory[1] = TestCreateExpectedHistoryEntry(
                  deviceName,
                  group,
                  twoDaysTime.toISOString(),
                  location1Nearby,
                  "automatic",
                  getTestName(station1Name)
                );
                expectedHistory[2] = TestCreateExpectedHistoryEntry(
                  deviceName,
                  group,
                  threeDaysTime.toISOString(),
                  location2,
                  "automatic",
                  getTestName(station2Name)
                );
                cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
              });
          });
      });
    });
  });

  it("Adding a recording matching location before manual start-time creates new station", () => {
    const deviceName = "new-device-9";
    const stationName = "new-station-9";
    const location = TestGetLocation(9);
    const nearbyLocation = TestGetLocation(9, 0.0001);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    cy.apiDeviceAdd(deviceName, group);
    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneWeekAgo.toISOString()
    ).then(() => {
      cy.log("Upload another recording and check assigned to same station");
      cy.testUploadRecording(deviceName, {
        ...nearbyLocation,
        time: oneMonthAgo,
        noTracks: true,
      }).thenCheckStationIsNew(Josie);
    });
  });

  it("Adding recording matching location during time-period of now-retired station assigns retired station", () => {
    const deviceName = "new-device-10";
    const stationName = "Josie-station-10";
    const location = TestGetLocation(10);
    cy.apiDeviceAdd(deviceName, group);
    const dayOne = new Date(new Date().setDate(new Date().getDate() + 1));
    const dayTwo = new Date(new Date().setDate(new Date().getDate() + 2));
    const dayThree = new Date(new Date().setDate(new Date().getDate() + 3));
    const expectedHistory: DeviceHistoryEntry[] = [];

    const expectedStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation.location = location;
    expectedStation.name = stationName;
    expectedStation.automatic = false;
    delete expectedStation.needsRename;
    expectedStation.activeAt = dayOne.toISOString();
    expectedStation.retiredAt = dayThree.toISOString();

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      dayOne.toISOString(),
      dayThree.toISOString()
    ).then((stationId: number) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: dayTwo,
        noTracks: true,
      })
        .thenCheckStationIdIs(Josie, stationId)
        .then(() => {
          cy.log("Check device valid deviceHistory created");
          expectedHistory[0] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            NOT_NULL_STRING,
            null,
            "register",
            null
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayTwo.toISOString(),
            location,
            "automatic",
            getTestName(stationName)
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
        });
    });
  });

  it("Adding recording matching location at start of time-period of now-retired station assigns retired station", () => {
    const deviceName = "new-device-11";
    const stationName = "Josie-station-11";
    const location = TestGetLocation(11);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      oneWeekAgo.toISOString()
    ).then((stationId: number) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneMonthAgo,
        noTracks: true,
      }).thenCheckStationIdIs(Josie, stationId);
    });
  });

  it("Adding recording matching location at end of time-period of now-retired station creates new", () => {
    const deviceName = "new-device-12";
    const stationName = "Josie-station-12";
    const location = TestGetLocation(12);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      oneWeekAgo.toISOString()
    ).then(() => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneWeekAgo,
        noTracks: true,
      }).thenCheckStationIsNew(Josie);
    });
  });

  it("Adding recording matching location after time-period of now-retired station creates new", () => {
    const deviceName = "new-device-13";
    const stationName = "Josie-station-13";
    const location = TestGetLocation(13);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    const expectedNewStation = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedNewStation.location = location;
    expectedNewStation.activeAt = now.toISOString();

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      oneWeekAgo.toISOString()
    ).then(() => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: now,
        noTracks: true,
      })
        .thenCheckStationIsNew(Josie)
        .then((station: TestNameAndId) => {
          cy.apiStationCheck(Josie, station.name, expectedNewStation);
        });
    });
  });

  it("Adding a new recording within the radius of an existing retired station automatically creates a new station and assigns it to the recording", () => {
    const deviceName = "new-device-14";
    const stationName = "Josie-station-14";
    const location = TestGetLocation(14);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      oneWeekAgo.toISOString()
    ).then(() => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: now,
        noTracks: true,
      }).thenCheckStationIsNew(Josie);
    });
  });

  it("Verify audio recording correctly assigned to and updates station", () => {
    const deviceName = "new-device-15";
    const stationName = "new-station-15";
    const recording1Name = "new-recording-15-1";
    const recording2Name = "new-recording-15-2";
    const location = TestGetLocation(15);
    const nearbyLocation = TestGetLocation(15, 0.0001);
    const dayOne = new Date(new Date().setDate(new Date().getDate() + 1));
    const dayTwo = new Date(new Date().setDate(new Date().getDate() + 2));
    const dayThree = new Date(new Date().setDate(new Date().getDate() + 3));
    const expectedHistory: DeviceHistoryEntry[] = [];

    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedStation1.location = location;
    expectedStation1.activeAt = dayOne.toISOString();
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
    delete expectedStation1.needsRename;

    const audioRecording = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
    audioRecording.recordingDateTime = dayTwo.toISOString();
    audioRecording.location = [nearbyLocation.lat, nearbyLocation.lng];

    cy.apiDeviceAdd(deviceName, group);

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      dayOne.toISOString()
    ).then(() => {
      cy.log("Check station created correctly");
      delete expectedStation1.lastAudioRecordingTime;
      delete expectedStation1.lastThermalRecordingTime;
      cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

      cy.log("Add an audio recording and check is updated correctly");
      cy.apiRecordingAdd(deviceName, audioRecording, undefined, recording1Name)
        .thenCheckStationNameIs(Josie, getTestName(stationName))
        .then(() => {
          cy.log(
            "Check station updated correctly with lastAudioRecordingTime`"
          );
          expectedStation1.lastAudioRecordingTime = dayTwo.toISOString();
          cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

          cy.log("Check device valid deviceHistory created");
          expectedHistory[0] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            NOT_NULL_STRING,
            null,
            "register",
            null
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayTwo.toISOString(),
            nearbyLocation,
            "automatic",
            getTestName(stationName)
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("Add a 2nd audio recording");
          audioRecording.recordingDateTime = dayThree.toISOString();
          cy.apiRecordingAdd(
            deviceName,
            audioRecording,
            undefined,
            recording2Name
          )
            .thenCheckStationNameIs(Josie, getTestName(stationName))
            .then(() => {
              cy.log(
                "Check station updated correctly with lastThermalRecordingTime"
              );
              expectedStation1.lastAudioRecordingTime = dayThree.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(stationName),
                expectedStation1
              );
            });
        });
    });
  });

  it("Verify audio recording correctly creates station", () => {
    const deviceName = "new-device-16";
    const recording1Name = "new-recording-16-1";
    const recording2Name = "new-recording-16-2";
    const location = TestGetLocation(17);
    const nearbyLocation = TestGetLocation(17, 0.0001);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedStation1.location = location;
    expectedStation1.activeAt = oneMonthAgo.toISOString();
    expectedStation1.automatic = true;

    const audioRecording = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
    audioRecording.recordingDateTime = oneMonthAgo.toISOString();
    audioRecording.location = [location.lat, location.lng];

    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add an audio recording and check station is created correctly");
    cy.apiRecordingAdd(deviceName, audioRecording, undefined, recording1Name)
      .thenCheckStationIsNew(Josie)
      .then((station: TestNameAndId) => {
        cy.log("Check station created correctly with lastAudioRecordingTime`");
        expectedStation1.lastAudioRecordingTime = oneMonthAgo.toISOString();
        delete expectedStation1.lastThermalRecordingTime;
        cy.apiStationCheck(Josie, station.name, expectedStation1);

        cy.log(
          "Add another audio recording and check station is updated correctly"
        );
        audioRecording.location = [nearbyLocation.lat, nearbyLocation.lng];
        audioRecording.recordingDateTime = oneWeekAgo.toISOString();
        cy.apiRecordingAdd(
          deviceName,
          audioRecording,
          undefined,
          recording2Name
        )
          .thenCheckStationIdIs(Josie, station.id)
          .then(() => {
            cy.log(
              "Check station updated correctly with lastAudioRecordingTime`"
            );
            expectedStation1.lastAudioRecordingTime = oneWeekAgo.toISOString();
            cy.apiStationCheck(Josie, station.name, expectedStation1);
          });
      });
  });

  it("Verify separate audio and thermal device can share a station (manual station)", () => {
    const audioDeviceName = "new-device-18a";
    const thermalDeviceName = "new-device-18t";
    const audioRecordingName = "new-recording-18a";
    const thermalRecordingName = "new-recording-18t";

    const stationName = "new-station-18";
    const location = TestGetLocation(18);
    const nearbyLocation = TestGetLocation(18, 0.0001);
    const now = new Date();
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedStation1.location = location;
    expectedStation1.activeAt = oneMonthAgo.toISOString();
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
    delete expectedStation1.needsRename;

    const audioRecording = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
    audioRecording.recordingDateTime = oneWeekAgo.toISOString();
    audioRecording.location = [nearbyLocation.lat, nearbyLocation.lng];

    const thermalRecording = TestCreateRecordingData(
      TEMPLATE_THERMAL_RECORDING
    );
    thermalRecording.recordingDateTime = now.toISOString();
    thermalRecording.location = [nearbyLocation.lat, nearbyLocation.lng];

    cy.apiDeviceAdd(audioDeviceName, group);
    cy.apiDeviceAdd(thermalDeviceName, group);

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString()
    ).then(() => {
      cy.log("Check station created correctly");
      delete expectedStation1.lastAudioRecordingTime;
      delete expectedStation1.lastThermalRecordingTime;
      cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

      cy.log("Add an audio recording and check is updated correctly");
      cy.apiRecordingAdd(
        audioDeviceName,
        audioRecording,
        undefined,
        audioRecordingName
      )
        .thenCheckStationNameIs(Josie, getTestName(stationName))
        .then(() => {
          cy.log(
            "Check station updated correctly with lastAudioRecordingTime`"
          );
          expectedStation1.lastAudioRecordingTime = oneWeekAgo.toISOString();
          cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

          cy.log(
            "Add a thermal recording and check station is updated correctly"
          );
          cy.apiRecordingAdd(
            thermalDeviceName,
            thermalRecording,
            undefined,
            thermalRecordingName
          )
            .thenCheckStationNameIs(Josie, getTestName(stationName))
            .then(() => {
              cy.log(
                "Check station updated correctly with lastThermalRecordingTime"
              );
              expectedStation1.lastAudioRecordingTime =
                oneWeekAgo.toISOString();
              expectedStation1.lastThermalRecordingTime = now.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(stationName),
                expectedStation1
              );
            });
        });
    });
  });

  it("Verify separate audio and thermal device can share a station (auto station)", () => {
    const audioDeviceName = "new-device-19a";
    const thermalDeviceName = "new-device-19t";
    const audioRecordingName = "new-recording-19a";
    const thermalRecordingName = "new-recording-19t";
    const location = TestGetLocation(19);
    const nearbyLocation = TestGetLocation(19, 0.0001);
    const now = new Date();
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedStation1.location = location;
    expectedStation1.activeAt = oneMonthAgo.toISOString();
    expectedStation1.automatic = true;

    const audioRecording = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
    audioRecording.recordingDateTime = oneMonthAgo.toISOString();
    audioRecording.location = [location.lat, location.lng];

    const thermalRecording = TestCreateRecordingData(
      TEMPLATE_THERMAL_RECORDING
    );
    thermalRecording.recordingDateTime = now.toISOString();
    thermalRecording.location = [nearbyLocation.lat, nearbyLocation.lng];

    cy.apiDeviceAdd(audioDeviceName, group);
    cy.apiDeviceAdd(thermalDeviceName, group);

    cy.log("Add an audio recording and check station is created correctly");
    cy.apiRecordingAdd(
      audioDeviceName,
      audioRecording,
      undefined,
      audioRecordingName
    )
      .thenCheckStationIsNew(Josie)
      .then((station: TestNameAndId) => {
        cy.log("Check station created correctly with lastAudioRecordingTime`");
        expectedStation1.lastAudioRecordingTime = oneMonthAgo.toISOString();
        delete expectedStation1.lastThermalRecordingTime;
        cy.apiStationCheck(Josie, station.name, expectedStation1);

        cy.log(
          "Add a thermal recording and check station is updated correctly"
        );
        cy.apiRecordingAdd(
          thermalDeviceName,
          thermalRecording,
          undefined,
          thermalRecordingName
        )
          .thenCheckStationIdIs(Josie, station.id)
          .then(() => {
            cy.log(
              "Check station updated correctly with lastThermalRecordingTime"
            );
            expectedStation1.lastAudioRecordingTime = oneMonthAgo.toISOString();
            expectedStation1.lastThermalRecordingTime = now.toISOString();
            cy.apiStationCheck(Josie, station.name, expectedStation1);
          });
      });
  });

  it("Verify single device can support both audio and thermal recordings (auto station)", () => {
    const deviceName = "new-device-20";
    const audioRecordingName = "new-recording-20a";
    const thermalRecordingName = "new-recording-20t";
    const location = TestGetLocation(20);
    const nearbyLocation = TestGetLocation(20, 0.0001);
    const anotherNearbyLocation = TestGetLocation(20, -0.0001);
    const now = new Date();
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedStation1.location = location;
    expectedStation1.activeAt = oneMonthAgo.toISOString();
    expectedStation1.automatic = true;

    const audioRecording = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
    audioRecording.recordingDateTime = oneMonthAgo.toISOString();
    audioRecording.location = [location.lat, location.lng];

    const thermalRecording = TestCreateRecordingData(
      TEMPLATE_THERMAL_RECORDING
    );
    thermalRecording.recordingDateTime = now.toISOString();
    thermalRecording.location = [anotherNearbyLocation.lat, nearbyLocation.lng];

    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add an audio recording and check station is created correctly");
    cy.apiRecordingAdd(
      deviceName,
      audioRecording,
      undefined,
      audioRecordingName
    )
      .thenCheckStationIsNew(Josie)
      .then((station: TestNameAndId) => {
        cy.log("Check station created correctly with lastAudioRecordingTime`");
        expectedStation1.lastAudioRecordingTime = oneMonthAgo.toISOString();
        delete expectedStation1.lastThermalRecordingTime;
        cy.apiStationCheck(Josie, station.name, expectedStation1);

        cy.log(
          "Add a thermal recording and check station is updated correctly"
        );
        cy.apiRecordingAdd(
          deviceName,
          thermalRecording,
          undefined,
          thermalRecordingName
        )
          .thenCheckStationNameIs(Josie, station.name)
          .then(() => {
            cy.log(
              "Check station updated correctly with lastThermalRecordingTime"
            );
            expectedStation1.lastAudioRecordingTime = oneMonthAgo.toISOString();
            expectedStation1.lastThermalRecordingTime = now.toISOString();
            cy.apiStationCheck(Josie, station.name, expectedStation1);
          });
      });
  });

  it("Verify single device can support both audio and thermal recordings (manual station)", () => {
    const deviceName = "new-device-21";
    const stationName = "new-station-21";
    const audioRecordingName = "new-recording-21a";
    const thermalRecordingName = "new-recording-21t";
    const location = TestGetLocation(21);
    const nearbyLocation = TestGetLocation(21, 0.0001);
    const dayOne = new Date(new Date().setDate(new Date().getDate() + 1));
    const dayTwo = new Date(new Date().setDate(new Date().getDate() + 2));
    const dayThree = new Date(new Date().setDate(new Date().getDate() + 3));
    const expectedHistory: DeviceHistoryEntry[] = [];

    const expectedStation1 = JSON.parse(
      JSON.stringify(templateExpectedStation)
    );
    expectedStation1.location = location;
    expectedStation1.activeAt = dayOne.toISOString();
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
    delete expectedStation1.needsRename;

    const audioRecording = TestCreateRecordingData(TEMPLATE_AUDIO_RECORDING);
    audioRecording.recordingDateTime = dayTwo.toISOString();
    audioRecording.location = [nearbyLocation.lat, nearbyLocation.lng];

    const thermalRecording = TestCreateRecordingData(
      TEMPLATE_THERMAL_RECORDING
    );
    thermalRecording.recordingDateTime = dayThree.toISOString();
    thermalRecording.location = [nearbyLocation.lat, nearbyLocation.lng];

    cy.apiDeviceAdd(deviceName, group);

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      dayOne.toISOString()
    ).then(() => {
      cy.log("Check station created correctly");
      delete expectedStation1.lastAudioRecordingTime;
      delete expectedStation1.lastThermalRecordingTime;
      cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

      cy.log("Add an audio recording and check is updated correctly");
      cy.apiRecordingAdd(
        deviceName,
        audioRecording,
        undefined,
        audioRecordingName
      )
        .thenCheckStationNameIs(Josie, getTestName(stationName))
        .then(() => {
          cy.log(
            "Check station updated correctly with lastAudioRecordingTime`"
          );
          expectedStation1.lastAudioRecordingTime = dayTwo.toISOString();
          cy.apiStationCheck(Josie, getTestName(stationName), expectedStation1);

          cy.apiRecordingAdd(
            deviceName,
            thermalRecording,
            undefined,
            thermalRecordingName
          )
            .thenCheckStationNameIs(Josie, getTestName(stationName))
            .then(() => {
              cy.log(
                "Check station updated correctly with lastThermalRecordingTime"
              );
              expectedStation1.lastAudioRecordingTime = dayTwo.toISOString();
              expectedStation1.lastThermalRecordingTime =
                dayThree.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(stationName),
                expectedStation1
              );

              cy.log(
                "Check device has just one valid deviceHistory location created"
              );
              expectedHistory[0] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                NOT_NULL_STRING,
                null,
                "register",
                null
              );
              expectedHistory[1] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                dayTwo.toISOString(),
                nearbyLocation,
                "automatic",
                getTestName(stationName)
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
            });
        });
    });
  });
});
