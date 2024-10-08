import { TestGetLocation } from "@commands/api/station";
import { TestCreateExpectedHistoryEntry } from "@commands/api/device";
import { checkRecording } from "@commands/api/recording-tests";
import { TestCreateExpectedDevice } from "@commands/api/device";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { LatLng } from "@typedefs/api/common";

import { getCreds } from "@commands/server";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import { TEMPLATE_THERMAL_RECORDING_RESPONSE } from "@commands/dataTemplate";
import { TestNameAndId, DeviceHistoryEntry } from "@commands/types";
import { getTestName } from "@commands/names";
import { DeviceType, HttpStatusCode } from "@typedefs/api/consts";
import { ApiStationResponse } from "@typedefs/api/station";

const templateExpectedCypressRecording: ApiThermalRecordingResponse =
  JSON.parse(JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE));

const templateExpectedStation = {
  location,
  name: NOT_NULL_STRING,
  id: NOT_NULL,
  lastThermalRecordingTime: NOT_NULL_STRING,
  // lastActiveThermalTime: NOT_NULL_STRING,
  createdAt: NOT_NULL_STRING,
  updatedAt: NOT_NULL_STRING,
  activeAt: NOT_NULL_STRING,
  automatic: true,
  needsRename: true,
  groupId: NOT_NULL,
  groupName: NOT_NULL_STRING,
};

const beforeRecordings = new Date();
const firstTime = new Date(new Date().setDate(new Date().getDate() + 1));
const secondTime = new Date(new Date().setDate(new Date().getDate() + 2));
const thirdTime = new Date(new Date().setDate(new Date().getDate() + 3));
const fourthTime = new Date(new Date().setDate(new Date().getDate() + 4));
const afterRecordings = new Date(new Date().setDate(new Date().getDate() + 5));
const fifthTime = new Date(new Date().setDate(new Date().getDate() + 6));
const firstName = "recording 1";
const secondName = "recording 2";
const thirdName = "recording 3";
const fourthName = "recording 4";
const fifthName = "recording 5";
let expectedAutoStation: ApiStationResponse;
let expectedManualStation: ApiStationResponse;
const oldLocation = TestGetLocation(1);
const intermediateLocation = TestGetLocation(2);
const newLocation = TestGetLocation(3);
const elsewhereLocation = TestGetLocation(4);
let expectedHistory: DeviceHistoryEntry[] = [];
let count = 0;
let group: string;
const baseGroup: string = "fix_location_move_group";
const Josie = "Josie_move_stations";

describe("Device: fix-location of device and/or recordings", () => {
  before(() => {
    cy.apiUserAdd(Josie);
  });

  beforeEach(() => {
    count = count + 1;
    group = baseGroup + count.toString();
    cy.apiGroupAdd(Josie, group).then(() => {
      templateExpectedCypressRecording.groupId = getCreds(group).id;
      templateExpectedCypressRecording.groupName = getTestName(group);
      templateExpectedStation.groupId = getCreds(group).id;
      templateExpectedStation.groupName = getTestName(group);

      //Reset expected templates to default
      expectedAutoStation = JSON.parse(JSON.stringify(templateExpectedStation));
      expectedAutoStation.location = oldLocation;
      expectedAutoStation.activeAt = firstTime.toISOString();
      expectedAutoStation.lastThermalRecordingTime = fourthTime.toISOString();
      expectedAutoStation.needsRename = true;

      expectedManualStation = JSON.parse(
        JSON.stringify(templateExpectedStation)
      );
      expectedManualStation.location = newLocation;
      expectedManualStation.activeAt = beforeRecordings.toISOString();
      expectedManualStation.lastUpdatedById = getCreds(Josie).id;
      expectedManualStation.automatic = false;
      delete expectedManualStation.needsRename;

      expectedHistory = [];
    });
  });

  // Initial tests - move recordings to corrected location

  it("correct location: Move all recordings from auto to manual, after current activeAt", () => {
    const deviceName = "new-device-1";
    const manualStationName = "Josie-station-1";

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added
      expectedHistory.push(
        TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          NOT_NULL_STRING,
          null,
          "register",
          null
        )
      );

      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: firstTime, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((autoStation: TestNameAndId) => {
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: secondTime, noTracks: true },
            secondName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: thirdTime, noTracks: true },
            thirdName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: fourthTime, noTracks: true },
            fourthName
          );
          //Device history for frstTime, oldLocation, autoStation added
          expectedHistory.push(
            TestCreateExpectedHistoryEntry(
              deviceName,
              group,
              firstTime.toISOString(),
              oldLocation,
              "automatic",
              autoStation.name
            )
          );

          // USER ADDS STATION AND FIXES RECORDINGS

          cy.log("Create a new station");
          cy.apiGroupStationAdd(
            Josie,
            group,
            { name: manualStationName, ...newLocation },
            beforeRecordings.toISOString()
          ).then((manualStationId: number) => {
            cy.log(
              "Update first and subsequect recording's location to match manual station"
            );
            cy.apiDeviceFixLocation(
              Josie,
              deviceName,
              firstTime.toISOString(),
              manualStationId.toString(),
              null,
              HttpStatusCode.Ok,
              { messages: ["Updated 4 recording(s)"], useRawStationId: true }
            ).then(() => {
              cy.log("Check 4 recording reassigned, moved");
              checkRecordingLocationAndStation(
                Josie,
                firstName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                secondName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                thirdName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                fourthName,
                newLocation,
                getTestName(manualStationName)
              );

              cy.log("check old station now undefined");
              cy.apiStationCheck(
                Josie,
                autoStation.name,
                undefined,
                undefined,
                HttpStatusCode.Forbidden
              );

              cy.log(
                "check new station lastThermalRecordingTime now fourthTime"
              );
              expectedManualStation.lastThermalRecordingTime =
                fourthTime.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              cy.log("check device history updated to new location, station");
              expectedHistory[1] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                firstTime.toISOString(),
                newLocation,
                "user",
                getTestName(manualStationName)
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location updated to new location");
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
    });
  });

  it("correct location: Move all recordings from auto to manual, before current activeAt ", () => {
    const deviceName = "new-device-2";
    const manualStationName = "Josie-station-2";

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added
      expectedHistory.push(
        TestCreateExpectedHistoryEntry(
          deviceName,
          group,
          NOT_NULL_STRING,
          null,
          "register",
          null
        )
      );

      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: firstTime, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((autoStation: TestNameAndId) => {
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: secondTime, noTracks: true },
            secondName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: thirdTime, noTracks: true },
            thirdName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: fourthTime, noTracks: true },
            fourthName
          );
          //Device history for frstTime, oldLocation, autoStation added
          expectedHistory.push(
            TestCreateExpectedHistoryEntry(
              deviceName,
              group,
              firstTime.toISOString(),
              oldLocation,
              "automatic",
              autoStation.name
            )
          );

          // USER ADDS STATION AND FIXES RECORDINGS

          cy.log("Create a new station after the last recording time");
          cy.apiGroupStationAdd(
            Josie,
            group,
            { name: manualStationName, ...newLocation },
            afterRecordings.toISOString()
          ).then((manualStationId: number) => {
            //set expectedStation time to match
            expectedManualStation.activeAt = afterRecordings.toISOString();

            cy.log(
              "Update first and subsequect recording's location to match manual station"
            );
            cy.apiDeviceFixLocation(
              Josie,
              deviceName,
              firstTime.toISOString(),
              manualStationId.toString(),
              null,
              HttpStatusCode.Ok,
              { messages: ["Updated 4 recording(s)"], useRawStationId: true }
            ).then(() => {
              //check all 4 recordings updated
              cy.log("Check 4 recording reassigned, moved");
              checkRecordingLocationAndStation(
                Josie,
                firstName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                secondName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                thirdName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                fourthName,
                newLocation,
                getTestName(manualStationName)
              );

              cy.log("check old station now undefined");
              cy.apiStationCheck(
                Josie,
                autoStation.name,
                undefined,
                undefined,
                HttpStatusCode.Forbidden
              );

              cy.log(
                "check new station lastThermalRecordingTime now fourthTime"
              );
              cy.log("check new station activeAt now firstTime");
              expectedManualStation.lastThermalRecordingTime =
                fourthTime.toISOString();
              expectedManualStation.activeAt = firstTime.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              cy.log("check device history updated to new location, station");
              expectedHistory[1] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                firstTime.toISOString(),
                newLocation,
                "user",
                getTestName(manualStationName)
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location updated to new location");
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
    });
  });

  it("correct location: Move all recordings from auto to manual, before current lastRecTime", () => {
    const deviceName = "new-device-3";
    const manualStationName = "Josie-station-3";

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added

      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: firstTime, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((autoStation: TestNameAndId) => {
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: secondTime, noTracks: true },
            secondName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: thirdTime, noTracks: true },
            thirdName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: fourthTime, noTracks: true },
            fourthName
          );
          //Device history for firstTime, oldLocation, autoStation added

          // USER ADDS STATION AND FIXES RECORDINGS

          cy.log("Create a new station after the last recording time");
          cy.apiGroupStationAdd(
            Josie,
            group,
            { name: manualStationName, ...newLocation },
            afterRecordings.toISOString()
          ).then((manualStationId: number) => {
            //set expectedStation time to match
            expectedManualStation.activeAt = afterRecordings.toISOString();

            cy.log(
              "Add a pre-existing recording to the new station",
              manualStationId
            );
            cy.testUploadRecording(
              deviceName,
              { ...newLocation, time: fifthTime, noTracks: true },
              fifthName
            ).then(() => {
              cy.log(
                "Check pre-existing recording is correctly added to manual station"
              );
              checkRecordingLocationAndStation(
                Josie,
                fifthName,
                newLocation,
                getTestName(manualStationName)
              );
            });

            cy.log(
              "Update first and subsequent recording's location to match manual station"
            );
            cy.apiDeviceFixLocation(
              Josie,
              deviceName,
              firstTime.toISOString(),
              manualStationId.toString(),
              null,
              HttpStatusCode.Ok,
              { messages: ["Updated 4 recording(s)"], useRawStationId: true }
            ).then(() => {
              //check all 4 recordings updated
              cy.log("Check 4 recording reassigned, moved");
              checkRecordingLocationAndStation(
                Josie,
                firstName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                secondName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                thirdName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                fourthName,
                newLocation,
                getTestName(manualStationName)
              );

              //check 5th recording unaffected
              checkRecordingLocationAndStation(
                Josie,
                fifthName,
                newLocation,
                getTestName(manualStationName)
              );

              cy.log("check old station now undefined");
              cy.apiStationCheck(
                Josie,
                autoStation.name,
                undefined,
                undefined,
                HttpStatusCode.Forbidden
              );

              cy.log("check new station lastThermalRecordingTime unchanged");
              cy.log("check new station activeAt now firstTime");
              expectedManualStation.lastThermalRecordingTime =
                fifthTime.toISOString();
              expectedManualStation.activeAt = firstTime.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              cy.log("check device history updated to new location, station");
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
                firstTime.toISOString(),
                newLocation,
                "user",
                getTestName(manualStationName)
              );
              expectedHistory[2] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                fifthTime.toISOString(),
                newLocation,
                "automatic",
                getTestName(manualStationName)
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location unchanged at new location");
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
    });
  });

  //TODO fails: issue 3 - later recordings at different location,station also changed
  it("correct location: Move earlier recordings from auto to manual", () => {
    const deviceName = "new-device-4";
    const manualStationName = "Josie-station-4";
    const expectedIntermediateStation: ApiStationResponse = JSON.parse(
      JSON.stringify(expectedAutoStation)
    );
    expectedIntermediateStation.location = intermediateLocation;
    expectedHistory = [];

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added

      //2 recordings at old location
      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: firstTime, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((autoStation: TestNameAndId) => {
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: secondTime, noTracks: true },
            secondName
          );

          //Device history for firstTime, oldLocation, autoStation added

          //2 more recordings at intermediate location
          cy.testUploadRecording(
            deviceName,
            { ...intermediateLocation, time: thirdTime, noTracks: true },
            thirdName
          )
            .thenCheckStationIsNew(Josie)
            .then((intermediateStation: TestNameAndId) => {
              cy.testUploadRecording(
                deviceName,
                { ...intermediateLocation, time: fourthTime, noTracks: true },
                fourthName
              );
              //Device history for thirdTime, intermediateLocation, intermediateStation added

              // USER ADDS STATION AND FIXES RECORDINGS

              cy.log("Create a new station before all recordings");
              cy.apiGroupStationAdd(
                Josie,
                group,
                { name: manualStationName, ...newLocation },
                beforeRecordings.toISOString()
              ).then((manualStationId: number) => {
                //set expectedStation time to match
                expectedManualStation.activeAt = beforeRecordings.toISOString();

                cy.log(
                  "Update first and subsequent recording's location to match manual station"
                );
                cy.apiDeviceFixLocation(
                  Josie,
                  deviceName,
                  firstTime.toISOString(),
                  manualStationId.toString(),
                  null,
                  HttpStatusCode.Ok,
                  {
                    messages: ["Updated 2 recording(s)"],
                    useRawStationId: true,
                  }
                ).then(() => {
                  cy.log("Check 1st 2 recordings moved");
                  checkRecordingLocationAndStation(
                    Josie,
                    firstName,
                    newLocation,
                    getTestName(manualStationName)
                  );
                  checkRecordingLocationAndStation(
                    Josie,
                    secondName,
                    newLocation,
                    getTestName(manualStationName)
                  );
                  cy.log("Check last 2 recordings unchanged");
                  checkRecordingLocationAndStation(
                    Josie,
                    thirdName,
                    intermediateLocation,
                    intermediateStation.name
                  );
                  checkRecordingLocationAndStation(
                    Josie,
                    fourthName,
                    intermediateLocation,
                    intermediateStation.name
                  );

                  cy.log("check old station now undefined");
                  cy.apiStationCheck(
                    Josie,
                    autoStation.name,
                    undefined,
                    undefined,
                    HttpStatusCode.Forbidden
                  );

                  cy.log(
                    "check intermediate station lastThermalRecordingTime still fourthTime"
                  );
                  expectedIntermediateStation.lastThermalRecordingTime =
                    fourthTime.toISOString();
                  expectedIntermediateStation.activeAt =
                    thirdTime.toISOString();
                  cy.apiStationCheck(
                    Josie,
                    intermediateStation.name,
                    expectedIntermediateStation
                  );

                  cy.log(
                    "check new station lastThermalRecordingTime now secondTime"
                  );
                  expectedManualStation.lastThermalRecordingTime =
                    secondTime.toISOString();
                  expectedManualStation.activeAt =
                    beforeRecordings.toISOString();
                  cy.apiStationCheck(
                    Josie,
                    getTestName(manualStationName),
                    expectedManualStation
                  );

                  cy.log(
                    "check device history updated to reflect the 2 locations, stations"
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
                    firstTime.toISOString(),
                    newLocation,
                    "user",
                    getTestName(manualStationName)
                  );
                  expectedHistory[2] = TestCreateExpectedHistoryEntry(
                    deviceName,
                    group,
                    thirdTime.toISOString(),
                    intermediateLocation,
                    "automatic",
                    intermediateStation.name
                  );
                  cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

                  cy.log(
                    "check device location unchanged at intermediate location"
                  );
                  const expectedDevice = TestCreateExpectedDevice(
                    deviceName,
                    group,
                    true,
                    DeviceType.Thermal
                  );
                  expectedDevice.location = intermediateLocation;
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
  });

  it("correct location: Move later recordings from auto to manual", () => {
    const deviceName = "new-device-5";
    const manualStationName = "Josie-station-5";

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: firstTime, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((autoStation: TestNameAndId) => {
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: secondTime, noTracks: true },
            secondName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: thirdTime, noTracks: true },
            thirdName
          );
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: fourthTime, noTracks: true },
            fourthName
          );

          // USER ADDS STATION AND FIXES RECORDINGS

          cy.log("Create a new station before all recordings");
          cy.apiGroupStationAdd(
            Josie,
            group,
            { name: manualStationName, ...newLocation },
            beforeRecordings.toISOString()
          ).then((manualStationId: number) => {
            //set expectedStation time to match
            expectedManualStation.activeAt = beforeRecordings.toISOString();

            cy.log(
              "Update third subsequent recording's location to match manual station"
            );
            cy.apiDeviceFixLocation(
              Josie,
              deviceName,
              thirdTime.toISOString(),
              manualStationId.toString(),
              null,
              HttpStatusCode.Ok,
              { messages: ["Updated 2 recording(s)"], useRawStationId: true }
            ).then(() => {
              cy.log("Check 1st 2 recordings unchanged");
              checkRecordingLocationAndStation(
                Josie,
                firstName,
                oldLocation,
                autoStation.name
              );
              checkRecordingLocationAndStation(
                Josie,
                secondName,
                oldLocation,
                autoStation.name
              );
              cy.log("Check last 2 recordings reassigned, moved");
              checkRecordingLocationAndStation(
                Josie,
                thirdName,
                newLocation,
                getTestName(manualStationName)
              );
              checkRecordingLocationAndStation(
                Josie,
                fourthName,
                newLocation,
                getTestName(manualStationName)
              );

              cy.log(
                "check old station lastThermalRecordingTime now secondTime"
              );
              expectedAutoStation.lastThermalRecordingTime =
                secondTime.toISOString();
              cy.apiStationCheck(Josie, autoStation.name, expectedAutoStation);

              cy.log(
                "check new station lastThermalRecordingTime now fourthTime"
              );
              cy.log("check new station activeAt now firstTime");
              expectedManualStation.lastThermalRecordingTime =
                fourthTime.toISOString();
              expectedManualStation.activeAt = beforeRecordings.toISOString();
              cy.apiStationCheck(
                Josie,
                getTestName(manualStationName),
                expectedManualStation
              );

              cy.log(
                "check new device history entry added for new location, station"
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
                firstTime.toISOString(),
                oldLocation,
                "automatic",
                autoStation.name
              );
              expectedHistory[2] = TestCreateExpectedHistoryEntry(
                deviceName,
                group,
                thirdTime.toISOString(),
                newLocation,
                "user",
                getTestName(manualStationName)
              );
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log("check device location unchanged at new location");
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
    });
  });

  //TODO fails: issue 3 - later recordings at different location,station also changed
  it("correct location: Move intermediate recordings from auto to manual", () => {
    const deviceName = "new-device-6";
    const manualStationName = "Josie-station-6";
    const expectedIntermediateStation: ApiStationResponse = JSON.parse(
      JSON.stringify(expectedAutoStation)
    );
    expectedIntermediateStation.location = intermediateLocation;
    const expectedElsewhereStation: ApiStationResponse = JSON.parse(
      JSON.stringify(expectedAutoStation)
    );
    expectedElsewhereStation.location = elsewhereLocation;
    expectedElsewhereStation.activeAt = fourthTime.toISOString();
    expectedElsewhereStation.lastThermalRecordingTime =
      fourthTime.toISOString();

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added

      // 1 recording at old location, 2 at intermediate, then one elsewhere
      cy.testUploadRecording(
        deviceName,
        { ...oldLocation, time: firstTime, noTracks: true },
        firstName
      )
        .thenCheckStationIsNew(Josie)
        .then((autoStation: TestNameAndId) => {
          //Device history for firstTime, oldLocation, autoStation added

          //2 more recordings at intermediate location
          cy.testUploadRecording(
            deviceName,
            { ...intermediateLocation, time: secondTime, noTracks: true },
            secondName
          )
            .thenCheckStationIsNew(Josie)
            .then((intermediateStation: TestNameAndId) => {
              cy.testUploadRecording(
                deviceName,
                { ...intermediateLocation, time: thirdTime, noTracks: true },
                thirdName
              );

              // then one recording elsewhere
              cy.testUploadRecording(
                deviceName,
                { ...elsewhereLocation, time: fourthTime, noTracks: true },
                fourthName
              )
                .thenCheckStationIsNew(Josie)
                .then((elsewhereStation: TestNameAndId) => {
                  //Device history for secondTime, intermediateLocation, intermediateStation added
                  //Device history for fourthTime, elsewhereLocation, elsewhereStation added

                  // USER ADDS STATION AND FIXES RECORDINGS

                  cy.log("Create a new station before all recordings");
                  cy.apiGroupStationAdd(
                    Josie,
                    group,
                    { name: manualStationName, ...newLocation },
                    beforeRecordings.toISOString()
                  ).then((manualStationId: number) => {
                    //set expectedStation time to match
                    expectedManualStation.activeAt =
                      beforeRecordings.toISOString();

                    cy.log(
                      "Update second and subsequect recording's location to match manual station"
                    );
                    cy.apiDeviceFixLocation(
                      Josie,
                      deviceName,
                      secondTime.toISOString(),
                      manualStationId.toString(),
                      null,
                      HttpStatusCode.Ok,
                      {
                        messages: ["Updated 2 recording(s)"],
                        useRawStationId: true,
                      }
                    ).then(() => {
                      cy.log("Check first recording unchanged");
                      checkRecordingLocationAndStation(
                        Josie,
                        firstName,
                        oldLocation,
                        autoStation.name
                      );

                      cy.log("Check 2nd and 3rd recordings moved");
                      checkRecordingLocationAndStation(
                        Josie,
                        secondName,
                        newLocation,
                        getTestName(manualStationName)
                      );
                      checkRecordingLocationAndStation(
                        Josie,
                        thirdName,
                        newLocation,
                        getTestName(manualStationName)
                      );
                      cy.log("Check last recording unchanged");
                      checkRecordingLocationAndStation(
                        Josie,
                        fourthName,
                        elsewhereLocation,
                        elsewhereStation.name
                      );

                      cy.log(
                        "check old station lastThermalRecordingTime now firstTime"
                      );
                      expectedAutoStation.lastThermalRecordingTime =
                        firstTime.toISOString();
                      cy.apiStationCheck(
                        Josie,
                        autoStation.name,
                        expectedAutoStation
                      );

                      cy.log("check intermediate station now undefined");
                      cy.apiStationCheck(
                        Josie,
                        intermediateStation.name,
                        undefined,
                        undefined,
                        HttpStatusCode.Forbidden
                      );

                      cy.log(
                        "check new station lastThermalRecordingTime now thirdTime"
                      );
                      expectedManualStation.lastThermalRecordingTime =
                        thirdTime.toISOString();
                      expectedManualStation.activeAt =
                        beforeRecordings.toISOString();
                      cy.apiStationCheck(
                        Josie,
                        getTestName(manualStationName),
                        expectedManualStation
                      );

                      cy.log("check elsewhere station unchanged");
                      cy.apiStationCheck(
                        Josie,
                        elsewhereStation.name,
                        expectedElsewhereStation
                      );

                      cy.log(
                        "check device history updated to new location, station"
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
                        firstTime.toISOString(),
                        oldLocation,
                        "automatic",
                        autoStation.name
                      );
                      expectedHistory[2] = TestCreateExpectedHistoryEntry(
                        deviceName,
                        group,
                        secondTime.toISOString(),
                        newLocation,
                        "user",
                        getTestName(manualStationName)
                      );
                      expectedHistory[3] = TestCreateExpectedHistoryEntry(
                        deviceName,
                        group,
                        fourthTime.toISOString(),
                        elsewhereLocation,
                        "automatic",
                        elsewhereStation.name
                      );
                      cy.apiDeviceHistoryCheck(
                        Josie,
                        deviceName,
                        expectedHistory
                      );

                      cy.log(
                        "check device location unchanged at elsewhere location"
                      );
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
    });
  });

  it("correct-location: Verify empty manual station NOT deleted by fix-location, move", () => {
    const deviceName = "new-device-7";
    const oldStationName = "Josie-station-7-old";
    const newStationName = "Josie-station-7-new";

    const expectedOldStation: ApiStationResponse = JSON.parse(
      JSON.stringify(expectedManualStation)
    );
    expectedOldStation.location = oldLocation;
    const expectedNewStation: ApiStationResponse = JSON.parse(
      JSON.stringify(expectedManualStation)
    );

    cy.log("Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {
      // Initial device history entry added

      cy.log("Create a new station before all recordings");
      cy.apiGroupStationAdd(
        Josie,
        group,
        { name: oldStationName, ...oldLocation },
        beforeRecordings.toISOString()
      ).then((oldStationId: number) => {
        cy.log("Create another new station before all recordings");
        cy.apiGroupStationAdd(
          Josie,
          group,
          { name: newStationName, ...newLocation },
          beforeRecordings.toISOString()
        ).then((newStationId: number) => {
          // 1 recording at old location, 2 at intermediate, then one elsewhere
          cy.testUploadRecording(
            deviceName,
            { ...oldLocation, time: firstTime, noTracks: true },
            firstName
          )
            .thenCheckStationIdIs(Josie, oldStationId)
            .then(() => {
              //Device history for firstTime, oldLocation, autoStation added

              cy.log("Update recording's location to match new manual station");
              cy.apiDeviceFixLocation(
                Josie,
                deviceName,
                firstTime.toISOString(),
                newStationId.toString(),
                null,
                HttpStatusCode.Ok,
                { messages: ["Updated 1 recording(s)"], useRawStationId: true }
              ).then(() => {
                cy.log("Check recording moved");
                checkRecordingLocationAndStation(
                  Josie,
                  firstName,
                  newLocation,
                  getTestName(newStationName)
                );

                cy.log(
                  "check new station lastThermalRecordingTime now firstTime"
                );
                expectedNewStation.lastThermalRecordingTime =
                  firstTime.toISOString();
                expectedNewStation.activeAt = beforeRecordings.toISOString();
                cy.apiStationCheck(
                  Josie,
                  getTestName(newStationName),
                  expectedNewStation
                );

                cy.log(
                  "check old station still defined, with lastRecordingTime=undefined"
                );
                delete expectedOldStation.lastThermalRecordingTime;
                expectedOldStation.activeAt = beforeRecordings.toISOString();
                expectedOldStation.location = oldLocation;
                cy.apiStationCheck(
                  Josie,
                  getTestName(oldStationName),
                  expectedOldStation
                );
              });
            });
        });
      });
    });
  });
});

function checkRecordingLocationAndStation(
  userName: string,
  recordingName: string,
  expectedLocation: LatLng,
  stationName: string
): any {
  checkRecording(userName, getCreds(recordingName).id, (recording: any) => {
    expect(recording.location.lat).to.equal(expectedLocation.lat);
    expect(recording.location.lng).to.equal(expectedLocation.lng);
    expect(recording.stationId).to.equal(getCreds(stationName).id);
    expect(recording.stationName).to.equal(stationName);
  });
}
