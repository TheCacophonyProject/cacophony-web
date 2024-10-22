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
const firstName = "flmr_recording 1";
const secondName = "flmr_recording 2";
const thirdName = "flmr_recording 3";
const fourthName = "flmr_recording 4";
const oldLocation = TestGetLocation(1);
const newLocation = TestGetLocation(3);
const elsewhereLocation = TestGetLocation(4);
let expectedManualStation: ApiStationResponse;
let count = 0;
let group: string;
const baseGroup: string = "move_location_recording_group";

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
  const Josie = "Josie_move_rec__stations";

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
    cy.log(`Elsewhere location ${JSON.stringify(elsewhereLocation)}`);
  });

  // Adding recordings after a REASSIGN

  /* User adds a recording in same location as last moved recording location
   * after lastRecTime:
   * -> existing station: lastRec Time updated
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses corrected station
   * -> device location remains at updated location
   */
  it("Move recording: add new recording in same place, after lastRecTime", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording in same place, after lastRecordingTime using fixed location"
      );
      cy.log("and check recording uses updated station");
      cy.testUploadRecording(
        deviceName,
        { ...newLocation, time: dayThree, noTracks: true },
        thirdName
      )
        .thenCheckStationNameIs(Josie, getTestName(manualStationName))
        .then(() => {
          cy.log("Check station updated with lastRecordingTime");
          expectedManualStation.lastThermalRecordingTime =
            dayThree.toISOString();
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log("Check deviceHistory unchanged by new recording");
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at new location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = newLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* User adds a recording in same location as last moved recording location, before firstRec:
   * -> existing station: unchanged
   * -> deviceHistory: new entry for the new earlier recording
   * -> recording: uses location as uploaded, uses moved station
   * -> device location remains at updated location
   */
  it("Move recording: add new recording in same place, before lastRecTime", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording in same place, before lastRecordingTime");
      cy.log("and check recording uses updated station");

      cy.testUploadRecording(
        deviceName,
        { ...newLocation, time: dayOne, noTracks: true },
        firstName
      )
        .thenCheckStationNameIs(Josie, getTestName(manualStationName))
        .then(() => {
          cy.log("Check station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log("Check devicehistory entry created by new recording");
          expectedHistory[1].fromDateTime = dayOne.toISOString();
          expectedHistory[1].setBy = "automatic";

          expectedHistory.push({
            ...expectedHistory[1],
            fromDateTime: dayTwo.toISOString(),
            setBy: "user",
          });

          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at new location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = newLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* User adds a recording in same location as last moved recording location, before station creation:
   * -> existing station: unchanged
   * -> deviceHistory: new entry created for earlier recording
   * -> recording: uses location as uploaded, creates new automatic station
   * -> device location remains at updated location
   */
  it("Move recording: add new recording in same place, before station creation time", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording in same place, day0 - before manual station creation time"
      );
      cy.log("and check recording creates a new station");
      cy.testUploadRecording(
        deviceName,
        { ...newLocation, time: dayZero, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check manual station NOT backdated by prior recording");
          expectedManualStation.activeAt = dayOne.toISOString();
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log(
            "Check new devicehistory entry created (automatically) by new recording"
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayZero.toISOString(),
            newLocation,
            "automatic",
            newStation.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at new location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = newLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* User adds a recording in a different location to last moved recording
   * after lastRecTime:
   * -> existing station: unchanged
   * -> deviceHistory: new entry for new location
   * -> recording: uses location as uploaded, creates new auto station
   * -> device: location updated to different location
   */
  it("Move recording: add new recording on different place, after lastRecTime", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording located elsewhere, after lastRecordingTime");
      cy.log("and check recording created new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayThree, noTracks: true },
        thirdName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check old station unchanged");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log(
            "Check deviceHistory has new entry for new recording location"
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayThree.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location at elsewhere location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = elsewhereLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* User adds a recording in a different location to last moved recording
   * before lastRecTime:
   * -> existing station: unchanged
   * -> deviceHistory: new entry for new location
   * -> recording: uses location as uploaded, creates new auto station
   * -> device: location unchanged at updated location
   */
  it("Move recording: add new recording in different place, before lastRecTime", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log("Add new recording located elsewhere, before lastRecordingTime");
      cy.log("and check recording creates new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayOne, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log(
            "Check devicehistory has a new earlier entry for elsewhere location by new recording"
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayOne.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at new location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = newLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* User adds a recording in a different location to last moved recording
   * before station creation time:
   * -> existing station: unchanged
   * -> deviceHistory: new entry for new location
   * -> recording: uses location as uploaded, creates new auto station
   * -> device: location unchanged at updated location
   */
  it("Move recording: add new recording in different place, before station creation time", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      expectedManualStation.activeAt = dayTwo.toISOString();

      cy.log(
        "Add new recording located elsewhere, before manual station creation time (dayOne)"
      );
      cy.log("and check recording creates a new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayOne, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          cy.log("Check manual station unchanged by prior recording");
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log(
            "Check new deviceHistory entry created (automatically) by new recording"
          );
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayOne.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name
          );
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at new location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = newLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* After subsequent new recordings located elsewhere, user adds a recording in
   * same location as moved recording after lastRecTime for that earlier location:
   * -> existing moved station: lastRecTime updated
   * -> existing later station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses updated staion
   * -> device: location unchanged at elsewhere location
   */
  it("Move recording: after subsequent recordings located elsewhere, add past recordings in moved location after lastRecTime for that location", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording located elsewhere, dayFour - after lastRecordingTime"
      );
      cy.log("and check recording created new station");
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayFour, noTracks: true },
        fourthName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          expectedHistory[2] = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayFour.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name
          );

          cy.log(
            "Add old recording at new location after last recording at the location (dayThree)"
          );
          cy.log("and check recording assigned to re-assigned station");
          cy.testUploadRecording(
            deviceName,
            { ...newLocation, time: dayThree, noTracks: true },
            thirdName
          )
            .thenCheckStationNameIs(Josie, getTestName(manualStationName))
            .then(() => {
              cy.log("Check old station has new lastThermalRecordingTime");
              expectedManualStation.lastThermalRecordingTime =
                dayThree.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              cy.log("Check deviceHistory unchanged");
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location still at elsewhere location");
              const expectedDevice = TestCreateExpectedDevice(
                deviceName,
                group,
                true,
                DeviceType.Thermal
              );
              expectedDevice.location = elsewhereLocation;
              cy.apiDeviceInGroupCheck(
                Josie,
                deviceName,
                group,
                null,
                expectedDevice
              );
            });
        });
    });
  });

  /* After subsequent new recordings located elsewhere, user adds a recording in
   * same location as moved recording before lastRecTime for that earlier location:
   * -> existing moved station: unchanged
   * -> existing later station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses existing updated station
   * -> device: location unchanged at elsewhere loction
   */
  it("Move recording: after subsequent recordings located elsewhere, add past recordings in moved location before lastRecTime for that location", () => {
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
      true
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording located elsewhere, dayFour - after lastRecordingTime"
      );
      cy.log("and check recording created new station");
      cy.log("Expected history length", expectedHistory.length);
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayFour, noTracks: true },
        fourthName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          const elsewhereHistory = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayFour.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name
          );

          cy.log(
            "Add old recording at new location before last recording at the location (dayOne)"
          );
          cy.log("and check recording assigned to re-assigned station");
          cy.testUploadRecording(
            deviceName,
            { ...newLocation, time: dayOne, noTracks: true },
            firstName
          )
            .thenCheckStationNameIs(Josie, getTestName(manualStationName))
            .then(() => {
              cy.log("Check old station unchanged");
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              cy.log("Check deviceHistory created for earlier recording time");
              expectedHistory[1].fromDateTime = dayOne.toISOString();
              expectedHistory[1].location = newLocation;
              expectedHistory[1].setBy = "automatic";

              // User fixup time
              expectedHistory.push({
                ...expectedHistory[1],
                fromDateTime: dayTwo.toISOString(),
                setBy: "user",
              });

              // Later automatic recording in different location
              expectedHistory.push(elsewhereHistory);

              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location still at elsewhere location");
              const expectedDevice = TestCreateExpectedDevice(
                deviceName,
                group,
                true,
                DeviceType.Thermal
              );
              expectedDevice.location = elsewhereLocation;
              cy.apiDeviceInGroupCheck(
                Josie,
                deviceName,
                group,
                null,
                expectedDevice
              );
            });
        });
    });
  });

  /* User adds a recording in same location as last moved recording location, between firstRec and lastRec:
   * -> existing station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses uploaded location, uses corrected station
   * -> device location remains at updated location
   */
  it("Move recording: add new recording in same place, between first and lastRecordingTime", () => {
    const deviceName = "update-device-19";
    const manualStationName = "Josie-station-19";

    //create device and station at dayOne, recordings at dayTwo and day4.
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
      true,
      dayFour.toISOString()
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording in same place, day3 - in middle of existing recordings"
      );
      cy.log("and check recording uses existing station");
      cy.testUploadRecording(
        deviceName,
        { ...newLocation, time: dayThree, noTracks: true },
        firstName
      )
        .thenCheckStationNameIs(Josie, getTestName(manualStationName))
        .then(() => {
          cy.log("Check manual station unchanged");
          expectedManualStation.activeAt = dayOne.toISOString();
          cy.apiStationCheck(
            Josie,
            getTestName(manualStationName),
            expectedManualStation
          );

          cy.log("Check devicehistory unchanged");
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          cy.log("check device location still at new location");
          const expectedDevice = TestCreateExpectedDevice(
            deviceName,
            group,
            true,
            DeviceType.Thermal
          );
          expectedDevice.location = newLocation;
          cy.apiDeviceInGroupCheck(
            Josie,
            deviceName,
            group,
            null,
            expectedDevice
          );
        });
    });
  });

  /* After subsequent new recordings located elsewhere, user adds a recording in
   * same location as moved recording between first & last RecTime for that
   * earlier location:
   * -> existing moved station: unchanged
   * -> existing later station: unchanged
   * -> deviceHistory: unchanged
   * -> recording: uses location as uploaded, uses existing updated station
   * -> device: location unchanged at elsewhere loction
   */
  it("Move recording: after subsequent recordings located elsewhere, add past recordings in moved location between first and lastRecTime for that location", () => {
    const deviceName = "update-device-20";
    const manualStationName = "Josie-station-20";

    //create device and station at dayZero, recordings at dayOne and dayThree.
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
      true,
      dayThree.toISOString()
    ).then((expectedHistory: DeviceHistoryEntry[]) => {
      cy.log(
        "Add new recording located elsewhere, dayFour - after lastRecordingTime"
      );
      cy.log("and check recording created new station");
      cy.log("Expected history length", expectedHistory.length);
      cy.testUploadRecording(
        deviceName,
        { ...elsewhereLocation, time: dayFour, noTracks: true },
        fourthName
      )
        .thenCheckStationIsNew(Josie)
        .then((newStation: TestNameAndId) => {
          const elsewhereHistory = TestCreateExpectedHistoryEntry(
            deviceName,
            group,
            dayFour.toISOString(),
            elsewhereLocation,
            "automatic",
            newStation.name
          );

          cy.log(
            "Add old recording at new location between first & last recording at old location (dayTwo)"
          );
          cy.log("and check recording assigned to re-assigned station");
          cy.testUploadRecording(
            deviceName,
            { ...newLocation, time: dayTwo, noTracks: true },
            firstName
          )
            .thenCheckStationNameIs(Josie, getTestName(manualStationName))
            .then(() => {
              cy.log("Check old station unchanged");
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              // User fixup time
              expectedHistory[1].setBy = "user";
              expectedHistory[1].location = newLocation;

              // Later automatic recording in different location
              expectedHistory.push(elsewhereHistory);

              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location still at elsewhere location");
              const expectedDevice = TestCreateExpectedDevice(
                deviceName,
                group,
                true,
                DeviceType.Thermal
              );
              expectedDevice.location = elsewhereLocation;
              cy.apiDeviceInGroupCheck(
                Josie,
                deviceName,
                group,
                null,
                expectedDevice
              );
            });
        });
    });
  });
});
