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

describe("Stations: assign recordings to stations", () => {
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

  it("Adding a recording in a new location automatically creates a new station, station has correct values", () => {
    const deviceName = "new-device";
    const recordingTime = new Date();
    const location = TestGetLocation(1);
    const expectedStation1 = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation1.location = location;
    expectedStation1.activeAt = recordingTime.toISOString(),
    expectedStation1.lastThermalRecordingTime = recordingTime.toISOString(),

    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add a recording and check new station is created");
    cy.testUploadRecording(deviceName, { ...location, time: recordingTime })
      .thenCheckStationIsNew(Josie).then((station) => {
        cy.log("Check station created correctly");
        cy.apiStationCheck(Josie, station.id.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });
      });
  });

  it("Adding a recording within the radius of an existing station assigns the existing station to the recording, updates lastThermalRecording", () => {
    const deviceName = "new-device-2";
    const location = TestGetLocation(2);
    const nearbyLocation = TestGetLocation(2,0.0001);
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();
    const expectedStation1 = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation1.location = location;
    expectedStation1.activeAt = oneWeekAgo.toISOString(),
    expectedStation1.lastThermalRecordingTime = oneWeekAgo.toISOString(),

    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add a recording and check new station created");
    cy.testUploadRecording(
      deviceName,
      { ...location, time: oneWeekAgo }
    ).thenCheckStationIsNew(
      Josie,
    ).then((station) => {
      cy.log("Check activeAt and lastThermalRecording match recordingDateTime");
      cy.apiStationCheck(Josie, station.id.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });

      cy.log("Upload another recording and check assigned to existing station");
      cy.testUploadRecording(deviceName, {...nearbyLocation, time: now}).thenCheckStationNameIs(
        Josie,
        station.name 
      ).then(() => {
      cy.log("Check activeAt unchanged, lastThermalRecording matches new recordingDateTime");
        expectedStation1.lastThermalRecordingTime = now.toISOString(),
        cy.apiStationCheck(Josie, station.id.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });

      });
    });
  });

  it("Adding an earlier recording within the radius of an existing station assigns the existing station to the recording, does not update lastThermalRecording", () => {
    const deviceName = "new-device-25";
    const stationName = "new-station-25";
    const location = TestGetLocation(25);
    const nearbyLocation = TestGetLocation(25,0.0001);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();
    const expectedStation1 = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation1.location = location;
    expectedStation1.lastUpdatedById = getCreds(Josie).id;
    expectedStation1.automatic = false;
  
    cy.apiDeviceAdd(deviceName, group);

    cy.log("Add a station active since a month ago");
    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
    ).then((stationId) => {
      cy.log("Check activeAt matches set value, no retiredAt, no lastThermalRecording");
      expectedStation1.activeAt = oneMonthAgo.toISOString(),
      delete(expectedStation1.lastThermalRecordingTime);
      delete(expectedStation1.retiredAt);
      cy.apiStationCheck(Josie, stationId.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });

      cy.log("Add a matching recording, dated now and check assinged to exsiting station");
      cy.testUploadRecording(
        deviceName,
        { ...location, time: now }
      ).thenCheckStationIdIs(
        Josie,
        stationId
      ).then((station) => {
        cy.log("Check activeAt unchanged, lastThermalRecordingi now matches recordingDateTime");
        expectedStation1.activeAt = oneMonthAgo.toISOString(),
        expectedStation1.lastThermalRecordingTime = now.toISOString(),
        cy.apiStationCheck(Josie, station.id.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });
  
        cy.log("Upload another recording dated 1 week ago and check assigned to exsitng station");
        cy.testUploadRecording(deviceName, {...nearbyLocation, time: oneWeekAgo}).thenCheckStationNameIs(
          Josie,
          station.name
        ).then(() => {
        cy.log("Check activeAt unchanged, lastThermalRecording not changed (as 2nd recording was earlier than 1st)");
          expectedStation1.activeAt = oneMonthAgo.toISOString(),
          expectedStation1.lastThermalRecordingTime = now.toISOString(),
          cy.apiStationCheck(Josie, station.id.toString(), expectedStation1, undefined, undefined, { useRawStationId: true });
        });
      });
    });
  });

  it("Adding a recording matching location but in another group creates new station", () => {
    const device1Name = "new-device-26-1";
    const device2Name = "new-device-26-2";
    const location = TestGetLocation(26);
    const nearbyLocation = TestGetLocation(26,0.0001);

    cy.apiDeviceAdd(device1Name, group);
    cy.apiDeviceAdd(device2Name, group2);

    cy.testUploadRecording( device1Name, location)
      .thenCheckStationIsNew( Josie ).then((station1: any) => {

      cy.log("Upload another recording and check assigned to same station");
      cy.testUploadRecording(device2Name, nearbyLocation).thenCheckStationIsNew(Josie).then((station2:any) => {
        cy.log("Check stations were different");
        expect(station1.id,"Both recordings get different new stations").to.not.equal(station2.id);
      });
    });
  });

  //TODO FAILS - Issue 17
  it.skip("Adding a recording matching location before automatic start-time extends start-time backwards", () => {
    const deviceName = "new-device-20";
    const location = TestGetLocation(20);
    const nearbyLocation = TestGetLocation(20,0.0001);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const expectedStation1 = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation1.location = location;
    expectedStation1.activeAt = oneWeekAgo.toISOString(),

    cy.apiDeviceAdd(deviceName, group);
    cy.testUploadRecording( deviceName, { ...location, time: oneWeekAgo })
      .thenCheckStationIsNew( Josie,).then((station: any) => {
      cy.log("Check startDate is same as recording (oneWeekAgo)");
      cy.apiStationCheck(Josie, station.id, expectedStation1, undefined, undefined, { useRawStationId: true });

      cy.log("Upload another recording and check assigned to same station");
      cy.testUploadRecording(deviceName, { ...nearbyLocation, time: oneMonthAgo}).thenCheckStationIdIs(Josie, station.id).then(() => {
        cy.log("Check station start time extended backwards (now oneMonthAgo)");
        expectedStation1.activeAt=oneMonthAgo.toISOString();
        cy.apiStationCheck(Josie, station.id, expectedStation1, undefined, undefined, { useRawStationId: true });
      });
    });
  });


  it("Subsequent recording in new location creates new station", () => {
    const deviceName = "new-device-28";
    const station1Name = "new-station-28-1";
    const location1 = TestGetLocation(28);
    const location1Nearby = TestGetLocation(28,0.0001);
    const location2 = TestGetLocation(29);
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const sixDaysAgo = new Date(new Date().setDate(new Date().getDate() - 6));
    const now = new Date();
    cy.apiDeviceAdd(deviceName, group);
    cy.apiGroupStationAdd(Josie, group, { name: station1Name, ...location1 },oneWeekAgo.toISOString());

    cy.log("Upload recording in location1, check matched to station1");
    cy.testUploadRecording(deviceName, { ...location1Nearby, time: sixDaysAgo}).thenCheckStationNameIs(Josie, getTestName(station1Name));

    cy.log("Upload later recording in location2, check new station created");
    cy.testUploadRecording(deviceName, { ...location2, time: now}).thenCheckStationIsNew(Josie);
  });

  it("Multiple recordings match multiple stations", () => {
    const deviceName = "new-device-30";
    const station1Name = "new-station-30-1";
    const station2Name = "new-station-30-2";
    const location1 = TestGetLocation(30);
    const location1Nearby = TestGetLocation(30,0.0001);
    const location2 = TestGetLocation(31);
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const sixDaysAgo = new Date(new Date().setDate(new Date().getDate() - 6));
    const now = new Date();
    cy.apiDeviceAdd(deviceName, group);
    cy.apiGroupStationAdd(Josie, group, { name: station1Name, ...location1 },oneWeekAgo.toISOString()).then(() => {
      cy.apiGroupStationAdd(Josie, group, { name: station2Name, ...location2 },sixDaysAgo.toISOString()).then(() => {
        cy.log("Upload recording in location1, check matched to station1");
        cy.testUploadRecording(deviceName, { ...location2, time: now}).thenCheckStationNameIs(Josie, getTestName(station2Name));
        cy.testUploadRecording(deviceName, { ...location1Nearby, time: oneWeekAgo}).thenCheckStationNameIs(Josie, getTestName(station1Name));

        cy.log("Upload recording in location2, check matched to station2");
      });
    });
  });


  it("Adding a recording matching location before manual start-time creates new station", () => {
    const deviceName = "new-device-21";
    const stationName = "new-station-21";
    const location = TestGetLocation(21);
    const nearbyLocation = TestGetLocation(21,0.0001);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    cy.apiDeviceAdd(deviceName, group);
    cy.apiGroupStationAdd(Josie, group, { name: stationName, ...location }, oneWeekAgo.toISOString()).then(() =>   {

      cy.log("Upload another recording and check assigned to same station");
      cy.testUploadRecording(deviceName, { ...nearbyLocation, time: oneMonthAgo}).thenCheckStationIsNew(Josie);
    });
  });


  it("Adding recording matching location during time-period of now-retired station assigns retired station", () => {
    const deviceName = "new-device-4";
    const stationName = "Josie-station-4";
    const location = TestGetLocation(4);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    const expectedStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedStation.location=location;
    expectedStation.name=stationName;
    expectedStation.automatic=false;
    expectedStation.activeAt= oneMonthAgo.toISOString();
    expectedStation.retiredAt= now.toISOString();

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      now.toISOString()
    ).then((stationId) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneWeekAgo,
      }).thenCheckStationIdIs(Josie, stationId);
    });
  });


  it("Adding recording matching location at start of time-period of now-retired station assigns retired station", () => {
    const deviceName = "new-device-23";
    const stationName = "Josie-station-23";
    const location = TestGetLocation(23);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.apiGroupStationAdd(
      Josie,
      group,
      { name: stationName, ...location },
      oneMonthAgo.toISOString(),
      oneWeekAgo.toISOString()
    ).then((stationId:number) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneMonthAgo,
      }).thenCheckStationIdIs(Josie, stationId);
    });
  });

  it("Adding recording matching location at end of time-period of now-retired station creates new", () => {
    const deviceName = "new-device-24";
    const stationName = "Josie-station-24";
    const location = TestGetLocation(24);
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
      }).thenCheckStationIsNew(Josie);
    });
  });

  it("Adding recording matching location after time-period of now-retired station creates new", () => {
    const deviceName = "new-device-22";
    const stationName = "Josie-station-22";
    const location = TestGetLocation(22);
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    const expectedNewStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedNewStation.location=location;
    expectedNewStation.activeAt= now.toISOString();

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
      }).thenCheckStationIsNew(Josie).then((station:any) => {
        cy.apiStationCheck(Josie, station.id, expectedNewStation,undefined,undefined,{useRawStationId: true});
      });
    });
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

  //TODO write me!
  it.skip("Staions and audio recordings");
});

