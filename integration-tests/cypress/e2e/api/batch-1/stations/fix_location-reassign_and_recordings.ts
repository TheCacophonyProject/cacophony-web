import { TestGetLocation } from "@commands/api/station";
import { ApiStationResponse } from "@typedefs/api/station";
import {
  TestCreateExpectedDevice,
  TestCreateExpectedHistoryEntry,
} from "@commands/api/device";
import { getCreds } from "@commands/server";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import { DeviceHistoryEntry, TestNameAndId } from "@commands/types";
import { getTestName } from "@commands/names";
import { DeviceType } from "@typedefs/api/consts";

// NOTE: Make day zero a bit in the future still, or stations will be created before device registration time.
const dayZero = new Date(new Date().setHours(new Date().getHours() + 1));
const dayOne = new Date(new Date().setDate(new Date().getDate() + 1));
const dayTwo = new Date(new Date().setDate(new Date().getDate() + 2));
const dayThree = new Date(new Date().setDate(new Date().getDate() + 3));
const dayFour = new Date(new Date().setDate(new Date().getDate() + 4));
const firstName = "flrr_recording 1";
const secondName = "flrr_recording 2";
const thirdName = "flrr_recording 3";
const fourthName = "flrr_recording 3";
const oldLocation = TestGetLocation(1);
const newLocation = TestGetLocation(3);
const elsewhereLocation = TestGetLocation(4);
let expectedManualStation: ApiStationResponse;
let count = 0;
let group: string;
const baseGroup: string = "reassign_station_recording_group";

const templateExpectedStation = {
  location,
  name: NOT_NULL_STRING,
  id: NOT_NULL,
  lastThermalRecordingTime: NOT_NULL_STRING,
  createdAt: NOT_NULL_STRING,
  updatedAt: NOT_NULL_STRING,
  activeAt: NOT_NULL_STRING,
  automatic: true,
  groupId: NOT_NULL,
  groupName: NOT_NULL_STRING,
};

describe("Fix location: subsequent recordings", () => {
  const Josie = "Josie_reassign_rec_stations";

  before(() => {
    cy.apiUserAdd(Josie);
  });

  beforeEach(() => {
    expectedManualStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedManualStation.location = newLocation;
    expectedManualStation.activeAt = dayZero.toISOString();
    expectedManualStation.lastUpdatedById = getCreds(Josie).id;
    expectedManualStation.automatic = false;

    count = count + 1;
    group = baseGroup + count.toString();
    cy.apiGroupAdd(Josie, group).then(() => {
      expectedManualStation.groupId = getCreds(group).id;
      expectedManualStation.groupName = getTestName(group);
    });

    cy.log(`Day Zero ${dayZero.toISOString()}`);
    cy.log(`Day One ${dayOne.toISOString()}`);
    cy.log(`Day Two ${dayTwo.toISOString()}`);
    cy.log(`Day Three ${dayThree.toISOString()}`);
    cy.log(`Day Four ${dayFour.toISOString()}`);

    cy.log(`Old location ${JSON.stringify(oldLocation)}`);
    cy.log(`New location ${JSON.stringify(newLocation)}`);
  });

  // Adding recordings after a REASSIGN

  /* User adds a recording in same location as last reassigned recording
   * after lastRecTime:
   * -> existing station: lastRec Time updated
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses reassigned station
   * -> device location remains at original location
   */
  it("Reassign recording: add new recording on same place, after lastRecTime", () => {
    const deviceName = "update-device-10";
    const manualStationName = "Josie-station-10";

    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayZero.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording in same place, after lastRecordingTime");
      cy.log("and check recording uses updated station");
      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: dayThree, noTracks: true },
        thirdName,
      )
        .thenCheckStationNameIs(Josie, getTestName(manualStationName))
        .then(() => {
          cy.log("Check station updated with lastRecordingTime");
          expectedManualStation.lastThermalRecordingTime =
            dayThree.toISOString();
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log("Check deviceHistory unchanged by new recording");
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at old location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = oldLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* User adds a recording in same location as last reassigned recording
   * before firstRecTime:
   * -> existing station: unchanged
   * -> new auto station created for oldLocation
   * -> deviceHistory: new earlier entry created
   * -> recording: uses location as uploaded, creates new auto station
   * -> device location remains at original location
   */
  it("Reassign recording: add new recording in same place, before lastRecTime", () => {
    const deviceName = "update-device-11";
    const manualStationName = "Josie-station-11";

    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayZero.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording in same place, before lastRecordingTime (dayOne)",
      );
      cy.log("and check recording uses updated station");

      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: dayOne, noTracks: true },
        firstName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check original station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log("Check new deviceHistory entry creted for earlier recording");
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayOne.toISOString(),
            oldLocation,
            "automatic",
            newStation.name,
          );

          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at old location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = oldLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* User adds a recording in same location as last reassigned recording
   * before stationCreationTime:
   * -> existing station: unchanged
   * -> new auto station created
   * -> deviceHistory: new earlier record created
   * -> recording: uses location as uploaded, creates new auto station
   * -> device location remains at original location
   */
  it("Reassign recording: add new recording in same place, before station creation time", () => {
    const deviceName = "update-device-12";
    const manualStationName = "Josie-station-12";

    //create device and station at dayOne, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayOne.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording in same place, before manual station creation time",
      );
      cy.log("and check recording creates a new station");
      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: dayZero, noTracks: true },
        firstName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log(
            "Check manual station NOT backdated by prior recording",
            newStation.name,
            newStation.id,
          );
          expectedManualStation.activeAt = dayOne.toISOString();
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log(
            "Check new devicehistory entry created (automatically) by new recording",
          );
          expectedHistory[1] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayZero.toISOString(),
            oldLocation,
            "automatic",
            newStation.name,
          );
          expectedHistory.push(
            TestCreateExpectedHistoryEntry(
              deviceName,
              group,
              dayTwo.toISOString(), // Fixup date
              oldLocation,
              "user",
              getTestName(manualStationName),
            ),
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at old location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = oldLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* User adds a recording in different location to last reassigned recording
   * after lastRecTime:
   * -> existing station: unchanged
   * -> new station created
   * -> deviceHistory: new entry for new location, time
   * -> recording: uses location as uploaded, creates new auto station
   * -> device location at the new different location
   */
  it("Reassign recording: add new recording on different place, after lastRecTime", () => {
    const deviceName = "update-device-13";
    const manualStationName = "Josie-station-13";

    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayZero.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording located elsewhere, after lastRecordingTime");
      cy.log("and check recording created new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayThree, noTracks: true },
        thirdName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check old station unchanged");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log(
            "Check deviceHistory has new entry for new recording locvation",
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayThree.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name,
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location at elsewhere location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = elsewhereLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* User adds a recording in different location to last reassigned recording
   * before firstRecTime:
   * -> existing station: unchanged
   * -> new station created
   * -> deviceHistory: new entry for new location, time
   * -> recording: uses location as uploaded, creates new auto station
   * -> device location unchanged
   */
  it("Reassign recording: add new recording in different place, before lastRecTime", () => {
    const deviceName = "update-device-15";
    const manualStationName = "Josie-station-15";

    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayZero.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording located elsewhere, before lastRecordingTime");
      cy.log("and check recording creates new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayOne, noTracks: true },
        firstName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log(
            "Check devicehistory has a new earlier entry for new location by new recording",
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayOne.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name,
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at old location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = oldLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* User adds a recording in different location to last reassigned recording
   * before stationCreationTime:
   * -> existing station: unchanged
   * -> new station created
   * -> deviceHistory: new entry for new location, time
   * -> recording: uses location as uploaded, creates new auto station
   * -> device location unchanged
   */
  it("Reassign recording: add new recording in different place, before station creation time", () => {
    const deviceName = "update-device-16";
    const manualStationName = "Josie-station-16";

    //create device and station at dayTwo, recording at dayThree.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayThree.toISOString(),
      dayTwo.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      expectedManualStation.activeAt = dayTwo.toISOString();

      cy.log(
        "Add new recording located elsewhere, before manual station creation time (dayOne)",
      );
      cy.log("and check recording creates a new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayOne, noTracks: true },
        firstName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check manual station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log(
            "Check new devicehistory entry created (automatically) by new recording",
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayOne.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name,
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at old location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = oldLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* After subsequent new recordings located elsewhere, user adds a recording in
   * same location to reassigned recording after lastRecTime for that earlier
   * location:
   * -> existing reassigned station: lastRecTime updated
   * -> existing later station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses reassigned staion
   * -> device: location unchanged at elsewhere location
   */
  it("Reassign recording: after subsequent new location & recordings, add past recordings in same location after lastRecTime for that location", () => {
    const deviceName = "update-device-17";
    const manualStationName = "Josie-station-17";

    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayZero.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording located elsewhere, dayFour - after lastRecordingTime",
      );
      cy.log("and check recording created new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayFour, noTracks: true },
        fourthName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayFour.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name,
          );

          cy.log(
            "Add old recording at old location after last recording at the location (dayThree)",
          );
          cy.log("and check recording assigned to re-assigned station");
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: dayThree, noTracks: true },
            thirdName,
          )
            .thenCheckStationNameIs(Josie, getTestName(manualStationName))
            .then(() => {
              cy.log("Check old station has new lastThermalRecordingTime");
              expectedManualStation.lastThermalRecordingTime =
                dayThree.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation,
              );

              cy.log("Check deviceHistory unchanged");
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location still at elsewhere location");
              const expectedDevice = TestCreateExpectedDevice(
                deviceName,
                group,
                true,
                DeviceType.Thermal,
              );
              expectedDevice.location = elsewhereLocation;
              cy.apiDeviceInGroupCheck(
                Josie,
                deviceName,
                group,
                null,
                expectedDevice,
              );
            });
        });
    });
  });

  /* After subsequent new recordings located elsewhere, user adds a recording in
   * same location to reassigned recording before firstRecTime for that earlier
   * location:
   * -> existing reassigned station: unchanged
   * -> existing later station: unchanged
   * -> deviceHistory: new earlier entry added for new early recording time
   * -> recording: uses location as uploaded, uses reassigned staion
   * -> device: location unchanged at elsewhere location
   */
  it("Reassign recording: after subsequent new location & recordings, add past recordings in same location before lastRecTime for that location", () => {
    const deviceName = "update-device-18";
    const manualStationName = "Josie-station-18";

    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayTwo.toISOString(),
      dayZero.toISOString(),
      false,
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording located elsewhere, dayFour - after lastRecordingTime",
      );
      cy.log("and check recording created new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayFour, noTracks: true },
        fourthName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          const elseWhereLocationEntry = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayFour.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name,
          );

          cy.log(
            "Add old recording at old location before last recording at the location (dayOne)",
          );
          cy.log("and check recording assigned to re-assigned station");
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: dayOne, noTracks: true },
            firstName,
          )
            .thenCheckStationIsNew(Josie)
            .then((newerStation: TestNameAndId) => {
              cy.log("Check old station unchanged");
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation,
              );

              cy.log(
                "Check deviceHistory added for earlier recording time prior to fixup",
              );
              expectedHistory[1].fromDateTime = dayOne.toISOString();
              expectedHistory[1].setBy = "automatic";

              // User fixup time
              expectedHistory.push({
                ...expectedHistory[1],
                fromDateTime: dayTwo.toISOString(),
                setBy: "user",
              });
              expectedHistory[1].stationId = newerStation.id;

              // Later recording elsewhere
              expectedHistory.push(elseWhereLocationEntry);
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location still at elsewhere location");
              const expectedDevice = TestCreateExpectedDevice(
                deviceName,
                group,
                true,
                DeviceType.Thermal,
              );
              expectedDevice.location = elsewhereLocation;
              cy.apiDeviceInGroupCheck(
                Josie,
                deviceName,
                group,
                null,
                expectedDevice,
              );
            });
        });
    });
  });

  /* User adds a recording in same location as last reassigned recording
   * between first and lastRecTime:
   * -> existing station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses reassigned station
   * -> device location remains at original location
   */
  it("Reassign recording: add new recording in same place, between first and lastRecTime", () => {
    const deviceName = "update-device-19";
    const manualStationName = "Josie-station-19";

    //create device and station at dayZero, recordings at dayOne, dayThree.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayOne.toISOString(),
      dayZero.toISOString(),
      false,
      dayThree.toISOString(),
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording in same place, before lastRecordingTime");
      cy.log("and check recording uses updated station");

      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: dayTwo, noTracks: true },
        firstName,
      )
        .thenCheckStationNameIs(Josie, getTestName(manualStationName))
        .then(() => {
          cy.log("Check station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation,
          );

          cy.log("Check deviceHistory unchanged");
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at old location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal,
          );
          expectedDevice.location = oldLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice,
          );
        });
    });
  });

  /* After subsequent new recordings located elsewhere, user adds a recording in
   * same location to reassigned recording between first and lastRecTime for
   * that earlier location:
   * -> existing reassigned station: unchanged
   * -> existing later station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses reassigned staion
   * -> device: location unchanged at elsewhere location
   */
  it("Reassign recording: after subsequent new location & recordings, add past recordings in same location between first and lastRecTime for that location", () => {
    const deviceName = "update-device-20";
    const manualStationName = "Josie-station-20";

    //create device and station at dayZero, recordings at dayOne, dayThree.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(
      Josie,
      deviceName,
      manualStationName,
      secondName,
      group,
      oldLocation,
      newLocation,
      dayOne.toISOString(),
      dayZero.toISOString(),
      false,
      dayThree.toISOString(),
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording located elsewhere, dayFour - after lastRecordingTime",
      );
      cy.log("and check recording created new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayFour, noTracks: true },
        fourthName,
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          const elseWhereLocationEntry = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayFour.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name,
          );

          cy.log(
            "Add old recording at old location between first and last recording at the location (dayTwo)",
          );
          cy.log("and check recording assigned to re-assigned station");
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: dayTwo, noTracks: true },
            firstName,
          )
            .thenCheckStationNameIs(Josie, getTestName(manualStationName))
            .then(() => {
              cy.log("Check old station unchanged");
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation,
              );

              cy.log("Check deviceHistory uncganged");

              // User fixup time
              (expectedHistory[1].setBy = "user"),
                // Later recording elsewhere
                expectedHistory.push(elseWhereLocationEntry);
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location still at elsewhere location");
              const expectedDevice = TestCreateExpectedDevice(
                deviceName,
                group,
                true,
                DeviceType.Thermal,
              );
              expectedDevice.location = elsewhereLocation;
              cy.apiDeviceInGroupCheck(
                Josie,
                deviceName,
                group,
                null,
                expectedDevice,
              );
            });
        });
    });
  });
});
