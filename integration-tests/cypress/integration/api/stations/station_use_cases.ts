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

describe("Stations: use cases", () => {
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

  it("Use case: camera deployed without setting location, create manual station and move recordings to it", () => {
    //Test verifying following use case:
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

      cy.log("Check deviceHistory created as expected");
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

  it("Use case: camera location updated after initial recordings have been uploaded. Correct location, station of early recordings to match later recordings", () => {
    //Test verifying following use case:
    // User add a device
    // -> Unassigned device history entry created
    // One week later, first recording uploaded
    // -> Station auto-created at recording location
    // -> DeviceHistory entry created for that device, location, station, time
    // --- USER MOVES THE DEVICE BUT DOES NOT UPDATE LOCATION ---
    // Another week later, a 2nd recording uploaded for that device showing wrong (old) location
    // -> DeviceHistory unchanged
    // -> Station lastThermalRecordingTime updated
    // --- USER UPDATES THE LOCTION ON THE DEVICE TO THE CORRECT LOCATION ---
    // Another week later, third recording uploaded, showing new location
    // -> Station auto-created at new recording location
    // -> DeviceHistory entry created for that device, new location, new station, time
    // -> Device location updated 
    // User corrects the second recording to be at the third recording's station/location
    // -> Recording updated to be at corrected new location
    // -> DeviceHistory updated to be at corrected new location and new station
    // -> Old station lastThermalRecordingTime recalculated (now 1st recording time)
    // -> New station lastThermalRecordingTime unchanged at 3rd recording time
    // -> New station activeAt pushed back to 2nd recording time

    const deviceName = "new-device-5";
    const firstRecordingName = "sr-first-recording-5";
    const secondRecordingName = "sr-second-recording-5";
    const thirdRecordingName = "sr-third-recording-5";
    const oldLocation = TestGetLocation(5);
    const newLocation = TestGetLocation(6);
    const firstRecordingTime = new Date(new Date().setDate(new Date().getDate() + 7));
    const secondRecordingTime = new Date(new Date().setDate(new Date().getDate() + 14));
    const thirdRecordingTime = new Date(new Date().setDate(new Date().getDate() + 21));
    const expectedHistory:DeviceHistoryEntry[]=[];

    const firstRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    firstRecording.recordingDateTime=firstRecordingTime.toISOString();
    firstRecording.location=[oldLocation.lat, oldLocation.lng];

    const secondRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    secondRecording.recordingDateTime=secondRecordingTime.toISOString();
    secondRecording.location=[oldLocation.lat, oldLocation.lng];

    const thirdRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    thirdRecording.recordingDateTime=thirdRecordingTime.toISOString();
    thirdRecording.location=[newLocation.lat, newLocation.lng];

    const expectedOldStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedOldStation.location = oldLocation;
    expectedOldStation.activeAt = firstRecordingTime.toISOString();
    expectedOldStation.lastThermalRecordingTime = secondRecordingTime.toISOString();

    const expectedNewStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedNewStation.location = newLocation;
    expectedNewStation.activeAt = thirdRecordingTime.toISOString();
    expectedNewStation.lastThermalRecordingTime = thirdRecordingTime.toISOString();

    cy.apiDeviceAdd(deviceName, group).then(() => {;

      cy.log("Check deviceHistory created as expected");
      expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, NOT_NULL_STRING, null, "register", null));
      cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

      cy.log("Check device location is blank");
      const expectedInitialDevice=TestCreateExpectedDevice(deviceName, group, false);
      cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedInitialDevice, DeviceType.Unknown);

      // First recording

      cy.log("Create first recording, station and device history at location 1");
      cy.apiRecordingAdd( deviceName, firstRecording, undefined, firstRecordingName)
      .thenCheckStationIsNew(Josie).then((oldStation:TestNameAndId) => {

        cy.log("Check first recording was correctly assigned to old station, location, etc");
        const expectedFirstRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, firstRecordingName, deviceName, group, oldStation.name, firstRecording);
        expectedFirstRecording.stationId=oldStation.id;
        expectedFirstRecording.stationName=oldStation.name;
        expectedFirstRecording.location=oldLocation;
        cy.apiRecordingCheck(Josie, firstRecordingName, expectedFirstRecording, EXCLUDE_IDS);
  
        cy.log("Check station lastThermalRecordingTime updated");
        expectedOldStation.lastThermalRecordingTime=firstRecordingTime.toISOString();
        cy.apiStationCheck(Josie, oldStation.id.toString(), expectedOldStation, undefined, undefined, { useRawStationId: true });

        cy.log("Check deviceHistory updated as expected");
        expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, firstRecordingTime.toISOString(), oldLocation, "automatic", oldStation.name));
        cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

        cy.log("Check device location updated to match recording location");
        const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
        expectedDevice.location=oldLocation;
        cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

        // Second recording, same location as 1st

        cy.log("Later, add second recording at same location");
        cy.apiRecordingAdd(deviceName, secondRecording, undefined, secondRecordingName)
        .thenCheckStationIdIs(Josie, oldStation.id).then(() => {

          cy.log("Check second recording was correctly assigned to old station, location, etc");
          const expectedSecondRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, secondRecordingName, deviceName, group, oldStation.name, secondRecording);
          expectedSecondRecording.stationId=oldStation.id;
          expectedSecondRecording.stationName=oldStation.name;
          expectedSecondRecording.location=oldLocation;
          cy.apiRecordingCheck(Josie, secondRecordingName, expectedSecondRecording, EXCLUDE_IDS);
  
          cy.log("Check device location unchanged");
          cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

          cy.log("Check station lastThermalRecordingTime updated");
          expectedOldStation.lastThermalRecordingTime=secondRecordingTime.toISOString();
          cy.apiStationCheck(Josie, oldStation.id.toString(), expectedOldStation, undefined, undefined, { useRawStationId: true });
       
          cy.log("Check deviceHistory unchanged");
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

          //Now a 3rd recording with a new location
         
          cy.log("Create third recording, station and device history at new location, later");
          cy.apiRecordingAdd( deviceName, thirdRecording, undefined, thirdRecordingName)
          .thenCheckStationIsNew(Josie).then((newStation:TestNameAndId) => {

            expect(oldStation.id,"Stations are different").to.not.equal(newStation.id);

            cy.log("Check third recording has correct new location, new station");
            const expectedThirdRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, thirdRecordingName, deviceName, group, newStation.name, thirdRecording);
            expectedThirdRecording.stationId=newStation.id;
            expectedThirdRecording.stationName=newStation.name;
            expectedThirdRecording.location=newLocation;
            cy.apiRecordingCheck(Josie, thirdRecordingName, expectedThirdRecording, EXCLUDE_IDS);
  
            cy.log("Check device location updated to match third recording location");
            expectedDevice.location=newLocation;
            cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
 
            cy.log("Check new station lastThermalRecordingTime correct");
            expectedNewStation.lastThermalRecordingTime=thirdRecordingTime.toISOString();
            cy.apiStationCheck(Josie, newStation.id.toString(), expectedNewStation, undefined, undefined, { useRawStationId: true });
       
            cy.log("Check new deviceHistory entry created");
            expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, thirdRecordingTime.toISOString(), newLocation, "automatic", newStation.name));
            cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

            // now correct the second recording to be where it should be - third recording location
            
            cy.log("Update second recording location to match third recording/station");
            cy.apiDeviceFixLocation(Josie, deviceName, secondRecordingTime.toISOString(), newStation.id.toString(), null, HTTP_OK200, { messages: ["Updated 1 recording(s)"], useRawStationId: true}).then(() => {
 
              cy.log("Check first recording unchanged");
              cy.apiRecordingCheck(Josie, firstRecordingName, expectedFirstRecording, EXCLUDE_IDS);

              cy.log("Check second recording re-assigned to new station, recording location updated");
              expectedSecondRecording.stationId=newStation.id;
              expectedSecondRecording.stationName=newStation.name;
              expectedSecondRecording.location=newLocation;
              cy.apiRecordingCheck(Josie, secondRecordingName, expectedSecondRecording, EXCLUDE_IDS);

              cy.log("Check third recording unchanged");
              cy.apiRecordingCheck(Josie, thirdRecordingName, expectedThirdRecording, EXCLUDE_IDS);

              cy.log("Check device location preserved unchanged");
              cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
     
              cy.log("Check old station lastThermalRecordingTime updated correctly");
              expectedOldStation.lastThermalRecordingTime=firstRecordingTime.toISOString();
              cy.apiStationCheck(Josie, oldStation.id.toString(), expectedOldStation, undefined, undefined, { useRawStationId: true });

              cy.log("Check new station activeAt updated correctly");
              expectedNewStation.activeAt=secondRecordingTime.toISOString();
              cy.apiStationCheck(Josie, newStation.id.toString(), expectedNewStation, undefined, undefined, { useRawStationId: true });

              cy.log("Check device history updated correctly");
              expectedHistory[1]=TestCreateExpectedHistoryEntry(deviceName, group, secondRecordingTime.toISOString(), newLocation, "automatic", newStation.name);
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

            });
          });
        });
      });
    });
  });

  it("Use case: recordings being assigned to wrong nearby station. Manually assign device, past & future recordings at that location to an existing station", () => {
    //Test verifying following use case:
    // User adds a device
    // -> Unassigned device history entry created
    // User adds a station to use with that device
    // -> Station created
    // User uploads a recording that is too far away from station to be matched
    // -> New automatic station created for actual recording location, activeAt, 
    //    lastThermalRecordingTime=recodingDateTime
    // -> Device location updated to recording location
    // -> Device history entry created with device, station and recording location at recordingDateTime
    // User corrects recording station assignment without changing recording location
    // -> Recording station assignment changed, location unchanged
    // -> Automatic station lastThermalRecordingTime updated (undefined) now it has no recordings
    // -> Manual station lastThermalRecordingTime updated to recordingDateTime
    // -> deviceHistory entry updated to show correct station Id, but location unchanged at recording location
    // 
    // Another week later, another recording added for that device in the same location
    // -> recoding assigned to 'corrected' station chosen above
    // -> DeviceHistory unchanged
    // -> Station lastThermalRecordingTime updated
    //
    // Another week later, user adds another recording at another location
    // -> Station auto-created at recording location
    // -> DeviceHistory entry created for that device, location, station, time
    // -> Device location updated 

    const deviceName = "new-device-6";
    const manualStationName = "new-station-6";
    const firstRecordingName = "sr-old-recording-6";
    const secondRecordingName = "sr-new-recording-6";
    const thirdRecordingName = "sr-new-recording-6";
    const stationLocation = TestGetLocation(6);
    const firstRecordingLocation = TestGetLocation(6,0.001); //~100m off-target location
    const thirdRecordingLocation = TestGetLocation(6,-0.001); //~100m in the oppsite direction
    const thirdRecordingTime = new Date(new Date().setDate(new Date().getDate() + 21));
    const secondRecordingTime = new Date(new Date().setDate(new Date().getDate() + 14));
    const firstRecordingTime = new Date(new Date().setDate(new Date().getDate() + 7));
    const createStationTime = new Date();
    const expectedHistory:DeviceHistoryEntry[]=[];

  
    const firstRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    firstRecording.recordingDateTime=firstRecordingTime.toISOString();
    firstRecording.location=[firstRecordingLocation.lat, firstRecordingLocation.lng];

    const secondRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    secondRecording.recordingDateTime=secondRecordingTime.toISOString();
    secondRecording.location=[firstRecordingLocation.lat, firstRecordingLocation.lng];

    const thirdRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    thirdRecording.recordingDateTime=thirdRecordingTime.toISOString();
    thirdRecording.location=[thirdRecordingLocation.lat, thirdRecordingLocation.lng];

    const expectedAutoStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedAutoStation.automatic = true;

    const expectedManualStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedManualStation.location = stationLocation;
    expectedManualStation.activeAt = createStationTime.toISOString();
    expectedManualStation.lastUpdatedById = getCreds(Josie).id;
    expectedManualStation.automatic = false;
     

    cy.apiDeviceAdd(deviceName, group).then(() => {
      cy.log("Check deviceHistory created as expected");
      expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, NOT_NULL_STRING, null, "register", null));
      cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

      cy.log("Check device location is blank");
      const expectedInitialDevice=TestCreateExpectedDevice(deviceName, group, false);
      cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedInitialDevice, DeviceType.Unknown);
 
      cy.log( "Create a new station");
      cy.apiGroupStationAdd( Josie, group, { name: manualStationName, ...stationLocation }, createStationTime.toISOString()
        ).then((manualStationId:number ) => {

        cy.log("Check station created correctly with no lastThermalRecordigTime");
        delete (expectedManualStation.lastThermalRecordingTime);
        cy.apiStationCheck(Josie, manualStationId.toString(), expectedManualStation, undefined, undefined, { useRawStationId: true });

        cy.log("Add a recording too far from exisiting station and check new station created for it"); 
        cy.apiRecordingAdd( deviceName, firstRecording, undefined, firstRecordingName)
        .thenCheckStationIsNew(Josie)
        .then((autoStation:TestNameAndId) => {

          cy.log("Check first recording was correct");
          let expectedFirstRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, firstRecordingName, deviceName, group, getTestName(manualStationName), firstRecording);
          expectedFirstRecording.location=firstRecordingLocation;
          cy.apiRecordingCheck(Josie, firstRecordingName, expectedFirstRecording, EXCLUDE_IDS);
  
          cy.log("Check device location updated to match recording location");
          const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
          expectedDevice.location=firstRecordingLocation;
          cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

          cy.log("Check auto station is correct: activeAt, lastThermalRecordingTime, location = recording");
          expectedAutoStation.location = firstRecordingLocation;
          expectedAutoStation.activeAt = firstRecordingTime.toISOString();
          expectedAutoStation.lastThermalRecordingTime = firstRecordingTime.toISOString();
          cy.apiStationCheck(Josie, autoStation.id.toString(), expectedAutoStation, undefined, undefined, { useRawStationId: true });

          cy.log("Check device history entry created");
          expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, firstRecordingTime.toISOString(), firstRecordingLocation, "automatic", autoStation.name));
          cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
 
          cy.log( "Re-assign recording to the correct station preserving recording locations");
          cy.apiDeviceFixLocation(Josie, deviceName, firstRecordingTime.toISOString(), manualStationId.toString(), firstRecordingLocation, HTTP_OK200, { messages: ["Updated 1 recording(s)"], useRawStationId: true}).then(() => {

            cy.log( "Make sure the first recording is reassigned to the correct station, and the recording location retained.");
            expectedFirstRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, firstRecordingName, deviceName, group, getTestName(manualStationName), firstRecording);
            expectedFirstRecording.stationId=manualStationId;
            expectedFirstRecording.stationName=getTestName(manualStationName);
            expectedFirstRecording.location=firstRecordingLocation;
            cy.apiRecordingCheck(Josie, firstRecordingName, expectedFirstRecording, EXCLUDE_IDS); 
          
            cy.log( "Make sure the device location is unaffected (still matches recording location)");
            const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
            expectedDevice.location=firstRecordingLocation;
            cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
 
            cy.log("Make sure manual station location in unaffected, lastThermalRecordingTime updated, activeAt unchanged");
            expectedManualStation.lastThermalRecordingTime = firstRecordingTime.toISOString();
            cy.apiStationCheck(Josie, manualStationName, expectedManualStation);

            cy.log("Make sure auto station is updated (lastThermalRecordingTime undefined)");
            delete(expectedAutoStation.lastThermalRecordingTime);
            cy.apiStationCheck(Josie, autoStation.id.toString(), expectedAutoStation, undefined, undefined, { useRawStationId: true});

            cy.log("Make sure device history is updated to correct station, location unchanged, setBy: user");
            expectedHistory[1]=TestCreateExpectedHistoryEntry(deviceName, group, firstRecordingTime.toISOString(), firstRecordingLocation, "user", getTestName(manualStationName));
            cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
 
            // Try adding more recordings and check assignment
            
            cy.log("Make sure future recordings are correctly assigned");
            cy.apiRecordingAdd( deviceName, secondRecording, undefined, secondRecordingName).then(() => {
    
              cy.log( "Make sure the new recording in same location is assigned to the corrected station, but the location is preserved.");
              const expectedNewRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, secondRecordingName, deviceName, group, getTestName(manualStationName), secondRecording);
              expectedNewRecording.stationId=getCreds(getTestName(manualStationName)).id;
              expectedNewRecording.stationName=getTestName(manualStationName);
              expectedNewRecording.location=firstRecordingLocation;
              cy.apiRecordingCheck(Josie, secondRecordingName, expectedNewRecording, EXCLUDE_IDS); 

              cy.log("Check device history unchanged");
              cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

              cy.log( "Make sure the device location is unaffected (still matches recording location)");
              cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);

              // Finally - a new recoridng in a new location

              cy.log("Make sure a new recording in a new location triggers a new station, etc");
              cy.apiRecordingAdd( deviceName, thirdRecording, undefined, thirdRecordingName).thenCheckStationIsNew(Josie).then((movedStation:TestNameAndId) => {
    

                cy.log( "Make sure the new recording created a correct new station in the new location.");
                const expectedMovedDeviceRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, thirdRecordingName, deviceName, group, movedStation.name, thirdRecording);
                expectedMovedDeviceRecording.stationId=movedStation.id;
                expectedMovedDeviceRecording.stationName=movedStation.name;
                expectedMovedDeviceRecording.location=thirdRecordingLocation;
                cy.apiRecordingCheck(Josie, thirdRecordingName, expectedMovedDeviceRecording, EXCLUDE_IDS);

                cy.log("Check new device history entry created");
                expectedHistory.push(TestCreateExpectedHistoryEntry(deviceName, group, thirdRecordingTime.toISOString(), thirdRecordingLocation, "automatic", movedStation.name));
                cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);

                cy.log( "Make sure the device location is updated to thirdRecordingLocation");
                expectedDevice.location=thirdRecordingLocation;
                cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
              });
            });
          });
        });
      });
    });
  });
});
