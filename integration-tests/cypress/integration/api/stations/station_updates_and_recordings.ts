/// <reference path="../../../support/index.d.ts" />
import {
  checkRecording,
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
import { ApiRecordingSet } from "@commands/types";
import { getTestName } from "@commands/names";
import { DeviceType } from "@typedefs/api/consts";

const templateRecording: ApiRecordingSet = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING)
);

const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
);
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
  const group = "recordings_stations";
  const group2 = "recordings_stations-2";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group).then(() => {
      templateExpectedCypressRecording.groupId=getCreds(group).id;
      templateExpectedCypressRecording.groupName=getTestName(group);
      templateExpectedStation.groupId = getCreds(group).id;
      templateExpectedStation.groupName = getTestName(group);
    });
    cy.apiGroupAdd(Josie, group2);
  });


  it.skip("Manually creating station with a startDate (and optionally an end-date) should try to match existing recordings on creation.", () => {
    // TODO - Not 100% sure of behaviour here
  });

  it("Delete station: Can manually delete a station, and have all recordings belonging to the station be deleted too", () => {
    const deviceName = "new-device-8";
    const stationName = "Josie-station-8";
    const location = TestGetLocation(8);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString()
    ).then((stationId) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneWeekAgo
      }).then((recordingId) => {
        cy.apiStationDelete(Josie, stationId, true, HTTP_OK200, { useRawStationId: true}).then(() => {
          cy.log("Check that station and its recordings are deleted");
          cy.apiStationCheck(Josie, stationId, null, null, HTTP_Forbidden, { useRawStationId: true});
          cy.apiRecordingCheck(Josie, recordingId.toString(), null, null, HTTP_Forbidden, {
            useRawRecordingId: true,
          });
        });
      });
    });
  });

  it("Delete station: Can manually delete a station, and have the station unassigned from any recordings", () => {
    const deviceName = "new-device-9";
    const stationName = "Josie-station-9";
    const recordingName = "sr-recording-9";
    const location = TestGetLocation(9);
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
      ).then((stationId) => {
        cy.apiRecordingAdd(
          deviceName, recording, undefined, recordingName
        ).thenCheckStationIdIs(Josie, stationId).then((station)=> {
          const expectedRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, recordingName, deviceName, group, station.name, recording);

          cy.apiStationDelete(Josie, stationId,false,HTTP_OK200,{ useRawStationId: true });
   
          cy.log(
            "Check that station is deleted, and its recordings don't have the station id"
          );
          cy.apiStationCheck(Josie, stationId, null, null, HTTP_Forbidden,{useRawStationId: true});

          delete(expectedRecording.stationId);
          delete(expectedRecording.stationName);
          cy.apiRecordingCheck(Josie, recordingName, expectedRecording, EXCLUDE_IDS);
        });
      });
    });
  });

  it("fix-location: Device can have a manual location change added, and stations are reassigned to the correct device recordings", () => {
    cy.log( "Create a device (in the past), give it a location by uploading a recording for it at a given point in time.");
    const deviceName = "new-device-99";
    const stationName = "Josie-station-99";
    const recordingName = "sr-recording-99";
    const newRecordingName = "sr-new-recording-99";
    const location = TestGetLocation(10);
    const fixedLocation = TestGetLocation(11);
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const twoWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 14));
    const recording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    recording.recordingDateTime=oneWeekAgo.toISOString();
    recording.location=[location.lat, location.lng];
    cy.apiDeviceAdd(deviceName, group).then(() => {;

      cy.log("Check device location is blank");
      const expectedInitialDevice=TestCreateExpectedDevice(deviceName, group, false);
      cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedInitialDevice, DeviceType.Unknown);
 
      cy.log("Add a recording and check new station created for it"); 
      cy.apiRecordingAdd( deviceName, recording, undefined, recordingName)
      .thenCheckStationIsNew(Josie)
      .then(() => {

        cy.log("Check device location updated to match recording location");
        const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
        expectedDevice.location=location;
        cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
 
      }); 


      cy.log( "Create a new station at a point in time, and correct device assignation to use it");
      cy.apiGroupStationAdd(
        Josie,
        group,
        { name: stationName, ...fixedLocation },
        twoWeeksAgo.toISOString()
      ).then(() => {
  
        cy.log( "Re-assign device to the newly created station).");
        cy.apiDeviceFixLocation(Josie, deviceName, oneWeekAgo.toISOString(), stationName, HTTP_OK200, { messages: "Updated 1 recording(s)"});
    
        cy.log( "Make sure the recording is reassigned to the correct station, and the location updated.");
        const expectedRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, recordingName, deviceName, group, getTestName(stationName), recording);
        expectedRecording.stationId=getCreds(getTestName(stationName)).id;
        expectedRecording.stationName=getTestName(stationName);
        expectedRecording.location=fixedLocation;
        cy.apiRecordingCheck(Josie, recordingName, expectedRecording, EXCLUDE_IDS); 
      
        cy.log( "Make sure the device location is updated since there are no future DeviceHistory entries for this device");
        const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
        expectedDevice.location=fixedLocation;
        cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
 
      });


      cy.log( "Add a new recording for the device in the correct time range, check it uses the corrected station");
      const newRecording=TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
      newRecording.recordingDateTime=(new Date()).toISOString();
      newRecording.location=[fixedLocation.lat, fixedLocation.lng];
      cy.apiRecordingAdd( deviceName, newRecording, undefined, newRecordingName).then(() => {

        const expectedNewRecording=TestCreateExpectedRecordingData(TEMPLATE_THERMAL_RECORDING_RESPONSE, newRecordingName, deviceName, group, getTestName(stationName), newRecording);
        expectedNewRecording.stationId=getCreds(getTestName(stationName)).id;
        expectedNewRecording.stationName=getTestName(stationName);
        expectedNewRecording.location=fixedLocation;
        cy.apiRecordingCheck(Josie, newRecordingName, expectedNewRecording, EXCLUDE_IDS); 
      });
    });
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

