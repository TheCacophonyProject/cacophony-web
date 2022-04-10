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

describe("Stations: add and remove", () => {
  const Josie = "Josie_stations";
  const group = "add_stations";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group).then(() => {
      templateExpectedCypressRecording.groupId=getCreds(group).id;
      templateExpectedCypressRecording.groupName=getTestName(group);
    });
  });

  it("Adding a recording in a new location automatically creates a new station", () => {
    const deviceName = "new-device";
    const recordingTime = new Date();
    const location = TestGetLocation(1);

    cy.apiDeviceAdd(deviceName, group);
    const expectedStation1 = {
      location,
      name: NOT_NULL_STRING,
      id: NOT_NULL,
      lastThermalRecordingTime: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      activeAt: recordingTime.toISOString(),
      automatic: true,
      groupId: getCreds(group).id,
      groupName: getTestName(group),
    };
    cy.testUploadRecording(deviceName, { ...location, time: recordingTime })
      .thenCheckStationIsNew(Josie).then((station) => {
        cy.apiStationCheck(Josie, station.id.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });
      });
  });

  it("Adding a recording within the radius of an existing station assigns the existing station to the recording", () => {
    const deviceName = "new-device-2";
    const location = TestGetLocation(2);
    const nearbyLocation = TestGetLocation(2,0.0001);
    const recordingTime = new Date();
    cy.apiDeviceAdd(deviceName, group);
    cy.testUploadRecording(
      deviceName,
      { ...location, ...recordingTime }
    ).thenCheckStationIsNew(
      Josie,
    ).then((station) => {
      cy.log("Upload another recording and check assigned to same station");
      cy.testUploadRecording(deviceName, nearbyLocation).thenCheckStationNameIs(
        Josie,
        station.name 
      );
    });
  });

  it("Adding an older recording within the radius of an existing retired station which was active at the time the recording was made assigns the station to the recording", () => {
    const deviceName = "new-device-4";
    const stationName = "Josie-station-4";
    const location = TestGetLocation(4);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    const expectedStation = {
      location,
      name: stationName,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      retiredAt: now.toISOString(),
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      now.toISOString()
    ).then((stationId) => {
   //TODO. fix. not returning retired stations   cy.apiStationCheck(Josie, stationId, expectedStation,undefined,undefined,{useRawStationId: true}).then(
   //     (stationId) => {
          cy.testUploadRecording(deviceName, {
            ...location,
            time: oneWeekAgo,
          }).thenCheckStationIdIs(Josie, stationId);
   //     }
   //   );
    });
  });

  it.skip("Manually creating station with a startDate (and optionally an end-date) should try to match existing recordings on creation.", () => {
    // TODO - Not 100% sure of behaviour here
  });

  it("Adding a new recording within the radius of an existing retired station automatically creates a new station and assigns it to the recording", () => {
    const deviceName = "new-device-5";
    const stationName = "Josie-station-5";
    const location = TestGetLocation(5);
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
      }).thenCheckStationIsNew( Josie,);
    });
  });


  it("Can manually delete a station, and have all recordings belonging to the station be deleted too", () => {
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

  it("Can manually delete a station, and have the station unassigned from any recordings", () => {
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

  it("Device can have a manual location change added, and stations are reassigned to the correct device recordings", () => {
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


  //HERE
  //
  //
  it.skip("recordings are not updated if before date specified", () => {
    const Josie2 = "Josie2";
    const groupUpdate = "update-stations";
    const camera = "update-after";

    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    cy.testCreateUserGroupAndDevice(Josie2, groupUpdate, camera);
    cy.testUploadRecording(camera, {
      time: oneMonthAgo,
      lat: -43.6,
      lng: 172.8,
    });

    cy.checkRecordingsStationIs(Josie2, "");

    const stations = [
      { name: "forest", lat: -43.62367659982, lng: 172.62646754804 },
      { name: "waterfall", lat: -43.6, lng: 172.8 },
    ];
    cy.apiGroupStationsUpdate(Josie2, groupUpdate, stations);
    cy.checkRecordingsStationIs(Josie2, "");
  });

  it.skip("Stations can have bulk changes applied, with changes back-dated", () => {
    const Josie2 = "Josie3";
    const groupUpdate = "update-stations-2";
    const camera = "update-after";
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const fromDate = oneWeekAgo.toISOString();

    cy.testCreateUserGroupAndDevice(Josie2, groupUpdate, camera);
    cy.apiGroupStationsUpdate(
      Josie2,
      groupUpdate,
      [{ name: "foo", lat: 1, lng: 2 }],
      fromDate
    );

    /*
    1) Create. This stays as-currently-is
    2) Rename. This functionality should be kept - rename the existing station if the location is the same
    3) Move. This is currently broken. In this case we need to rename the old station to keep it unique and create a new one as-per trapNZ
     */

    // Stations will be matched on name, location,
  });
});

