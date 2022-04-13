/// <reference path="../../../support/index.d.ts" />
import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { TestGetLocation } from "@commands/api/station";
import { TestCreateExpectedHistoryEntry } from "@commands/api/device";
import { TestCreateExpectedDevice } from "@commands/api/device";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import {
  getCreds,
} from "@commands/server";
import {
  EXCLUDE_IDS,
  HTTP_Forbidden,
  HTTP_OK200,
  NOT_NULL,
  NOT_NULL_STRING,
} from "@commands/constants";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { TestNameAndId, DeviceHistoryEntry } from "@commands/types";
import { getTestName } from "@commands/names";
import { DeviceType } from "@typedefs/api/consts";

const templateExpectedCypressRecording: ApiThermalRecordingResponse = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
);

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

describe("Stations: fix device and recording location", () => {
  const Josie = "Josie_stations";
  const group = "fix_location_group"
  const group2 = "fil_location_group2";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group).then(() => {
      templateExpectedCypressRecording.groupId=getCreds(group).id;
      templateExpectedCypressRecording.groupName=getTestName(group);
      templateExpectedStation.groupId = getCreds(group).id;
      templateExpectedStation.groupName = getTestName(group);
    });
    cy.apiGroupAdd(Josie, group2);
  });

  it("fix-location: update recording location to match a manual station", () => {
    // Long test verifying following use case:
    // User add a device
    // -> Unassigned device history entry created
    // One week later, Recording added for that device
    // -> Station auto-created at recording location
    // -> DeviceHistory entry created for that device, location, station, time
    // User adds a manual station
    // User corrects that recording (and device) to be at that station location
    // -> Recording updated to be at corrected location
    // -> DeviceHistory updated to be at corrected location and station
    // -> Old station lastThermalRecordingTime recalculated (now undefined) --- NOT TESTED
    // -> New station lastThermalRecordingTime updated to recording's time --- NOT TESTED
    // User adds a new recoding in the corrected location
    // -> recording assigned to the manual station
    // -> DeviceHistory is unchanged
    // -> Station has lastThermalRecordingztime updated --- NOT TESTED
    // Another week later User adds a new recording in a new loaction
    // -> recording assigned to a new station in new location
    // -> additional deviceHistory entry created for new location, new station and new recording's time
    const deviceName = "new-device-3";
    const stationName = "Josie-station-3";
    const oldRecordingName = "sr-old-recording-3";
    const newRecordingName = "sr-new-recording-3";
    const movedDeviceRecordingName = "sr-moved-recording-3";
    const location = TestGetLocation(3);
    const fixedLocation = TestGetLocation(4);
    const movedLocation = TestGetLocation(5);
    const oneWeekFromNow = new Date(new Date().setDate(new Date().getDate() + 7));
    const twoWeeksFromNow = new Date(new Date().setDate(new Date().getDate() + 14));
    const now = new Date();
    const expectedHistory:DeviceHistoryEntry[]=[];

    const oldRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    oldRecording.recordingDateTime=oneWeekFromNow.toISOString();
    oldRecording.location=[location.lat, location.lng];

    const newRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    newRecording.recordingDateTime=twoWeeksFromNow.toISOString();
    newRecording.location=[fixedLocation.lat, fixedLocation.lng];

    const movedDeviceRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    movedDeviceRecording.recordingDateTime=twoWeeksFromNow.toISOString();
    movedDeviceRecording.location=[movedLocation.lat, movedLocation.lng];

    const expectedAutoStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedAutoStation.location = location;
    expectedAutoStation.activeAt = oneWeekFromNow.toISOString();
    expectedAutoStation.lastThermalRecordingTime = oneWeekFromNow.toISOString();

    const expectedManualStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedManualStation.location = fixedLocation;
    expectedManualStation.activeAt = now.toISOString();
    expectedManualStation.lastUpdatedById = getCreds(Josie).id;
    expectedManualStation.automatic = false;

    cy.log( "Create a device now");
    cy.apiDeviceAdd(deviceName, group).then(() => {; 

      expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, NOT_NULL_STRING, null, "register", null));
      cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

      cy.log("Check device location is blank");
      const expectedInitialDevice=TestCreateExpectedDevice(deviceName, group, false);
      cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedInitialDevice, DeviceType.Unknown);
 
      cy.log("Add a recording and check new station created for it"); 
      cy.apiRecordingAdd( deviceName, oldRecording, undefined, oldRecordingName)
      .thenCheckStationIsNew(Josie)
      .then((autoStation: TestNameAndId) => {

        cy.log("Verify auto-created station has lastThermalRecordingTime = recordingDateTime");
        cy.apiStationCheck(Josie, autoStation.id.toString(), expectedAutoStation, undefined, undefined, {useRawStationId: true});

        cy.log("Check device location updated to match recording location");
        const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
        expectedDevice.location=location;
        cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

        cy.log("Check device history is updated as expected");
        expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, oneWeekFromNow.toISOString(), location, "automatic", autoStation.name));
        cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

        ///Now we create a station and correct the recording to use that station & location
        cy.log( "Create a new station at a point in time");
        cy.apiGroupStationAdd( Josie, group, { name: stationName, ...fixedLocation }, now.toISOString()).then(() => {
          cy.log( "Re-assign recording to the newly created station).");
          cy.apiDeviceFixLocation(Josie, deviceName, oneWeekFromNow.toISOString(), stationName, null, HTTP_OK200, { messages: ["Updated 1 recording(s)"]}).then(() => {

            cy.log( "Make sure the old recording is reassigned to the correct station, and the location updated.");
            const expectedOldRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, oldRecordingName, deviceName, group, getTestName(stationName), oldRecording);
            expectedOldRecording.stationId=getCreds(getTestName(stationName)).id;
            expectedOldRecording.stationName=getTestName(stationName);
            expectedOldRecording.location=fixedLocation;
            cy.apiRecordingCheck(Josie, oldRecordingName, expectedOldRecording, EXCLUDE_IDS); 
          
            cy.log( "Make sure the device location is updated since there are no future DeviceHistory entries for this device");
            const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
            expectedDevice.location=fixedLocation;
            cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

            cy.log("Check device history is updated as expected");
            expectedHistory[1]=TestCreateExpectedHistoryEntry(deviceName, group, oneWeekFromNow.toISOString(), fixedLocation, "user", getTestName(stationName));
            cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

            cy.log("Verify auto-created station now has no lastThermalRecordingTime");
            delete(expectedAutoStation.lastThermalRecordingTime);
            cy.apiStationCheck(Josie, autoStation.id.toString(), expectedAutoStation, undefined, undefined, {useRawStationId: true});
            
            cy.log("Verify manual station now has lastThermalRecordingTime=recordingDateTime");
            expectedManualStation.lastThermalRecordingTime=oneWeekFromNow.toISOString();
            cy.apiStationCheck(Josie, stationName, expectedManualStation).then(() => {

              cy.log("Add a new recording in fixed location, check assigned correctly, does not create new history entry");
              cy.apiRecordingAdd( deviceName, newRecording, undefined, newRecordingName)
              .thenCheckStationIdIs(Josie, getCreds(getTestName(stationName)).id);
  
              cy.log("Check device history is unchanged");
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory).then(() => {

                cy.log("Check new recording in a different location assigned correctly, DOES create station, new history entry");
                cy.apiRecordingAdd( deviceName, movedDeviceRecording, undefined, movedDeviceRecordingName)
                  .thenCheckStationIsNew(Josie).then((station2:TestNameAndId) => {

                  cy.log("Check new device history entry added");
                  expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, twoWeeksFromNow.toISOString(), movedLocation, "automatic", station2.name));
                  cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
                });
              });
            });
          });
        });
      });
    });
  });

  it("fix-location: update recording location to match later recordings", () => {
    const deviceName = "new-device-5";
    const oldRecordingName = "sr-old-recording-5";
    const newRecordingName = "sr-new-recording-5";
    const oldLocation = TestGetLocation(5);
    const newLocation = TestGetLocation(6);
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const twoWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 14));

    const oldRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    oldRecording.recordingDateTime=twoWeeksAgo.toISOString();
    oldRecording.location=[oldLocation.lat, oldLocation.lng];

    const newRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    newRecording.recordingDateTime=oneWeekAgo.toISOString();
    newRecording.location=[newLocation.lat, newLocation.lng];

    cy.apiDeviceAdd(deviceName, group).then(() => {;

      cy.log("Create recording, station and device history at location 1");
      cy.apiRecordingAdd( deviceName, oldRecording, undefined, oldRecordingName)
      .thenCheckStationIsNew(Josie).then((oldStation:TestNameAndId) => {

        cy.log("Check device location updated to match recording location");
        const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
        expectedDevice.location=oldLocation;
        cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

        cy.log("Create new recording, station and device history at location 2, later");
        cy.apiRecordingAdd( deviceName, newRecording, undefined, newRecordingName)
        .thenCheckStationIsNew(Josie).then((newStation:TestNameAndId) => {
          expect(oldStation.id,"Stations are different").to.not.equal(newStation.id);

          cy.log("Check device location updated to match recording location");
          const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
          expectedDevice.location=newLocation;
          cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

          cy.log("Check initial recording was correctly assigned to old station, location, etc");
          const expectedOldRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, oldRecordingName, deviceName, group, oldStation.name, oldRecording);
          expectedOldRecording.stationId=oldStation.id;
          expectedOldRecording.stationName=oldStation.name;
          expectedOldRecording.location=oldLocation;
          cy.apiRecordingCheck(Josie, oldRecordingName, expectedOldRecording, EXCLUDE_IDS);

          cy.log("Update initial device location to match later");
          cy.apiDeviceFixLocation(Josie, deviceName, twoWeeksAgo.toISOString(), newStation.id.toString(), null, HTTP_OK200, { messages: ["Updated 1 recording(s)"], useRawStationId: true}).then(() => {

            cy.log("Check old recording re-assigned to new station, recording location updated");
            expectedOldRecording.stationId=newStation.id;
            expectedOldRecording.stationName=newStation.name;
            expectedOldRecording.location=newLocation;
            cy.apiRecordingCheck(Josie, oldRecordingName, expectedOldRecording, EXCLUDE_IDS);
  
            cy.log("Check device location preserved unchanged");
            cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
  
          });
        });
      });
    });
  });

  it("fix-location: Correct device-station mapping for recordings without changing recording location", () => {
    const deviceName = "new-device-6";
    const stationName = "new-station-6";
    const oldRecordingName = "sr-old-recording-6";
    const newRecordingName = "sr-new-recording-6";
    const movedDeviceRecordingName = "sr-new-recording-6";
    const stationLocation = TestGetLocation(6);
    const recordingLocation = TestGetLocation(6,0.001); //~100m off-target location
    const movedDeviceLocation = TestGetLocation(6,-0.001); //~100m in the oppsite direction
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const twoWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 14));
    const threeWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 21));
    const now = new Date();

  
    const oldRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    oldRecording.recordingDateTime=twoWeeksAgo.toISOString();
    oldRecording.location=[recordingLocation.lat, recordingLocation.lng];

    const newRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    newRecording.recordingDateTime=oneWeekAgo.toISOString();
    newRecording.location=[recordingLocation.lat, recordingLocation.lng];

    const movedDeviceRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    movedDeviceRecording.recordingDateTime=now.toISOString();
    movedDeviceRecording.location=[movedDeviceLocation.lat, movedDeviceLocation.lng];

    const expectedStation1 = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation1.location = stationLocation;
    expectedStation1.activeAt = threeWeeksAgo.toISOString();
    expectedStation1.lastThermalRecordingTime = twoWeeksAgo.toISOString(),
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
 

    cy.apiDeviceAdd(deviceName, group).then(() => {

      cy.log("Check device location is blank");
      const expectedInitialDevice=TestCreateExpectedDevice(deviceName, group, false);
      cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedInitialDevice, DeviceType.Unknown);
 
      cy.log( "Create a new station");
      cy.apiGroupStationAdd( Josie, group, { name: stationName, ...stationLocation }, threeWeeksAgo.toISOString()
        ).then((stationId:number ) => {
        cy.log("Add a recording too far from exisiting station and check new station created for it"); 
        cy.apiRecordingAdd( deviceName, oldRecording, undefined, oldRecordingName)
        .thenCheckStationIsNew(Josie)
        .then(() => {
          cy.log("Check device location updated to match recording location");
          const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
          expectedDevice.location=recordingLocation;
          cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

          cy.log( "Re-assign recording to the correct station preserving recording locations.");
          cy.apiDeviceFixLocation(Josie, deviceName, twoWeeksAgo.toISOString(), stationId.toString(), recordingLocation, HTTP_OK200, { messages: ["Updated 1 recording(s)"], useRawStationId: true}).then(() => {
            cy.log( "Make sure the old recording is reassigned to the correct station, and the recording location retained.");
            const expectedOldRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, oldRecordingName, deviceName, group, getTestName(stationName), oldRecording);
            expectedOldRecording.stationId=stationId;
            expectedOldRecording.stationName=getTestName(stationName);
            expectedOldRecording.location=recordingLocation;
            cy.apiRecordingCheck(Josie, oldRecordingName, expectedOldRecording, EXCLUDE_IDS); 
          
            cy.log( "Make sure the device location is unaffected (still matches recording location)");
            const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
            expectedDevice.location=recordingLocation;
            cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
 
            cy.log("Make sure station location in unaffected (still matches original station location)"); 
            cy.apiStationCheck(Josie, stationName, expectedStation1);

            cy.log("Make sure future recordings are correctly assigned");
            cy.apiRecordingAdd( deviceName, newRecording, undefined, newRecordingName).then(() => {
    
              cy.log( "Make sure the new recording in same loction is assigned to the corrected station, but the location is preserved.");
              const expectedNewRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, newRecordingName, deviceName, group, getTestName(stationName), newRecording);
              expectedNewRecording.stationId=getCreds(getTestName(stationName)).id;
              expectedNewRecording.stationName=getTestName(stationName);
              expectedNewRecording.location=recordingLocation;
              cy.apiRecordingCheck(Josie, newRecordingName, expectedNewRecording, EXCLUDE_IDS); 

              cy.log("Make sure a new recording in a new location triggers a new station, etc");
              cy.apiRecordingAdd( deviceName, movedDeviceRecording, undefined, movedDeviceRecordingName).thenCheckStationIsNew(Josie).then((station:TestNameAndId) => {
    
                cy.log( "Make sure the new recording created a correct new station in the new location.");
                const expectedMovedDeviceRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, movedDeviceRecordingName, deviceName, group, station.name, movedDeviceRecording);
                expectedMovedDeviceRecording.stationId=station.id;
                expectedMovedDeviceRecording.stationName=station.name;
                expectedMovedDeviceRecording.location=movedDeviceLocation;
                cy.apiRecordingCheck(Josie, movedDeviceRecordingName, expectedMovedDeviceRecording, EXCLUDE_IDS);
              });
            });
          });
        });
      });
    });
  });
});
