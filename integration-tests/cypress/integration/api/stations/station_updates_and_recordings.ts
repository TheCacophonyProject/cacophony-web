/// <reference path="../../../support/index.d.ts" />
import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { TestGetLocation } from "@commands/api/station";
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
import { TestNameAndId } from "@commands/types";
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

describe("Stations: station updates also update recordings", () => {
  const Josie = "Josie_stations";
  const group = "recordings_updates_stations";
  const group2 = "recordings_updates_stations-2";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group).then(() => {
      templateExpectedCypressRecording.groupId=getCreds(group).id;
      templateExpectedCypressRecording.groupName=getTestName(group);
      templateExpectedStation.groupId = getCreds(group).id;
      templateExpectedStation.groupName = getTestName(group);
    });
    cy.apiGroupAdd(Josie, group2);
  });

  it("Delete station: Can manually delete a station, and have all recordings belonging to the station be deleted too", () => {
    const deviceName = "new-device-1";
    const stationName = "Josie-station-1";
    const location = TestGetLocation(1);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString()
    ).then((stationId: number) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneWeekAgo
      }).then((recordingId) => {
        cy.apiStationDelete(Josie, stationId.toString(), true, HTTP_OK200, { useRawStationId: true}).then(() => {
          cy.log("Check that station and its recordings are deleted");
          cy.apiStationCheck(Josie, stationId.toString(), null, null, HTTP_Forbidden, { useRawStationId: true});
          cy.apiRecordingCheck(Josie, recordingId.toString(), null, null, HTTP_Forbidden, {
            useRawRecordingId: true,
          });
        });
      });
    });
  });

  it("Delete station: Can manually delete a station, and have the station unassigned from any recordings", () => {
    const deviceName = "new-device-2";
    const stationName = "Josie-station-2";
    const recordingName = "sr-recording-2";
    const location = TestGetLocation(2);
    cy.apiDeviceAdd(deviceName, group).then(() => {
      const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
      const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
      const recording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
      recording.recordingDateTime=oneWeekAgo.toISOString();
      recording.location=[location.lat, location.lng];

      cy.apiGroupStationAdd(
          Josie,
        group,
        { name: stationName, ...location },
        oneMonthAgo.toISOString()
      ).then((stationId: number) => {
        cy.apiRecordingAdd(
          deviceName, recording, undefined, recordingName
        ).thenCheckStationIdIs(Josie, stationId).then((station: TestNameAndId)=> {
          const expectedRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, recordingName, deviceName, group, station.name, recording);

          cy.apiStationDelete(Josie, stationId.toString(),false,HTTP_OK200,{ useRawStationId: true });
   
          cy.log(
            "Check that station is deleted, and its recordings don't have the station id"
          );
          cy.apiStationCheck(Josie, stationId.toString(), null, null, HTTP_Forbidden,{useRawStationId: true});

          delete(expectedRecording.stationId);
          delete(expectedRecording.stationName);
          cy.apiRecordingCheck(Josie, recordingName, expectedRecording, EXCLUDE_IDS);
        });
      });
    });
  });

  it.only("fix-location: update recording location to match a manual station", () => {
    cy.log( "Create a device (in the past), give it a location by uploading a recording for it at a given point in time.");
    const deviceName = "new-device-3";
    const stationName = "Josie-station-3";
    const oldRecordingName = "sr-old-recording-3";
    const location = TestGetLocation(3);
    const fixedLocation = TestGetLocation(4);
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const twoWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 14));
    const now = new Date();
    const oldRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    oldRecording.recordingDateTime=oneWeekAgo.toISOString();
    oldRecording.location=[location.lat, location.lng];

    const newRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    newRecording.recordingDateTime=now.toISOString();
    newRecording.location=[location.lat, location.lng];

    cy.apiDeviceAdd(deviceName, group).then(() => {;

      cy.log("Check device location is blank");
      const expectedInitialDevice=TestCreateExpectedDevice(deviceName, group, false);
      cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedInitialDevice, DeviceType.Unknown);
 
      cy.log("Add a recording and check new station created for it"); 
      cy.apiRecordingAdd( deviceName, oldRecording, undefined, oldRecordingName)
      .thenCheckStationIsNew(Josie)
      .then(() => {
        cy.log("Check device location updated to match recording location");
        const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
        expectedDevice.location=location;
        cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);


        cy.log( "Create a new station at a point in time");
        cy.apiGroupStationAdd(
          Josie,
          group,
          { name: stationName, ...fixedLocation },
          twoWeeksAgo.toISOString()
        ).then(() => {
          cy.log( "Re-assign device to the newly created station).");
          cy.apiDeviceFixLocation(Josie, deviceName, oneWeekAgo.toISOString(), stationName, null, HTTP_OK200, { messages: ["Updated 1 recording(s)"]}).then(() => {
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

  it.only("fix-location: Correct device-station mapping for recordings without changing recording location", () => {
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
                expectedNewRecording.stationId=station.id;
                expectedNewRecording.stationName=station.name;
                expectedNewRecording.location=movedDeviceLocation;
                cy.apiRecordingCheck(Josie, movedDeviceRecordingName, expectedMovedDeviceRecording, EXCLUDE_IDS);
            });
          });
        });
      });
    });
  });


    cy.log("Create recording, station and device history at location 1");

    cy.log("Create new recording, station and device history at location 2, later");

    cy.log("Create a new station for the early device location");

    cy.log("Update initial device location to match manual station");

    cy.log("Check early recordings assigned to correct station");

    cy.log("Check later recordings not reassigned");

    cy.log("Check current device location not changed");
  });

  it("station-update: Name change applied to all recordings", () => {
  });

  it("station-update: Location change does not affect existing recordings", () => {
  });

  it("station-update: New location matched by new recordings", () => {
  });

  it("station-update: Old location not matched by new recordings", () => {
  });

  it("station-update: Retire station - old recordings unaffected if before retiredAt", () => {
  });

  it("station-update: Retire-station - new recordings match if before retiredAt", () => {
  });

  it("station-update: Retire-station - new recordings do not match if after retiredAt", () => {
  });

});

