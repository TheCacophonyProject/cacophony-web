/// <reference path="../../../support/index.d.ts" />
import { TestGetLocation } from "@commands/api/station";
import {ApiStationResponse} from "@typedefs/api/station";
import { TestCreateExpectedDevice, TestCreateExpectedHistoryEntry } from "@commands/api/device";
import {
  getCreds,
} from "@commands/server";
import {
  NOT_NULL,
  NOT_NULL_STRING,
} from "@commands/constants";
import { DeviceHistoryEntry, TestNameAndId } from "@commands/types";
import { getTestName } from "@commands/names";
import { DeviceType } from "@typedefs/api/consts";

const dayZero = new Date();
const dayOne = new Date(new Date().setDate(new Date().getDate() + 1));
const dayTwo = new Date(new Date().setDate(new Date().getDate() + 2));
const dayThree = new Date(new Date().setDate(new Date().getDate() + 3));
const dayFour = new Date(new Date().setDate(new Date().getDate() + 4));
const firstName = "recording 1";
const secondName = "recording 2";
const thirdName = "recording 3";
const oldLocation = TestGetLocation(1);
const newLocation = TestGetLocation(3);
const elsewhereLocation = TestGetLocation(4);
let expectedManualStation:ApiStationResponse;
let count=0;
let group:string;
let baseGroup:string = "move_location_recording_group"

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
  const Josie = "Josie_stations";

  before(() => {
    cy.apiUserAdd(Josie);
  });

  beforeEach(() => {
    expectedManualStation = JSON.parse(JSON.stringify(templateExpectedStation));
    expectedManualStation.location = newLocation;
    expectedManualStation.activeAt = dayZero.toISOString();
    expectedManualStation.lastUpdatedById = getCreds(Josie).id;
    expectedManualStation.automatic = false;

    count=count+1;
    group=baseGroup+count.toString();
    cy.apiGroupAdd(Josie, group).then(() => {
      expectedManualStation.groupId = getCreds(group).id;
      expectedManualStation.groupName = getTestName(group);
    });
  });

  // Adding recordings after a REASSIGN

  it("Move recording: add new recording on same place, after lastRecTime", () => {
    const deviceName = "update-device-10";
    const manualStationName = "Josie-station-10";
   
    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayZero.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording in same place, after lastRecordingTime using fexed location"); 
      cy.log("and check recording uses updated station");
      cy.testUploadRecording(deviceName, {...newLocation, time: dayThree}, thirdName)
      .thenCheckStationNameIs(Josie, getTestName(manualStationName))
      .then(() => {
         cy.log("Check station updated with lastRecordingTime");
         expectedManualStation.lastThermalRecordingTime=dayThree.toISOString();
         cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
  
         cy.log("Check devicehistory unchanged by new recording");
         cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
  
         cy.log("check device location still at new location");
         const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
         expectedDevice.location=newLocation;
         cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
      });
    });
  });
  
  it("Move recording: add new recording in same place, before lastRecTime", () => {
    const deviceName = "update-device-11";
    const manualStationName = "Josie-station-11";
   
    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayZero.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording in same place, before lastRecordingTime"); 
      cy.log("and check recording uses updated station");
      cy.testUploadRecording(deviceName, {...newLocation, time: dayOne}, firstName)
      .thenCheckStationNameIs(Josie, getTestName(manualStationName))
      .then(() => {
         cy.log("Check station unchanged by prior recording");
         cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
  
         cy.log("Check devicehistory backdated (automatically) by new recording");
         expectedHistory[1].fromDateTime=dayOne.toISOString();
         expectedHistory[1].setBy="automatic";
         cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
  
         cy.log("check device location still at new location");
         const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
         expectedDevice.location=newLocation;
         cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
      });
    });
  });

  //TODO: fails - manual station backdated
  it("Move recording: add new recording in same place, before station creation time", () => {
    const deviceName = "update-device-12";
    const manualStationName = "Josie-station-12";
   
    //create device and station at dayOne, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayOne.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording in same place, before manual station creation time"); 
      cy.log("and check recording creates a new station");
      cy.testUploadRecording(deviceName, {...newLocation, time: dayZero}, firstName)
      .thenCheckStationIsNew(Josie)
      .then((newStation:TestNameAndId) => {
         cy.log("Check manual station NOT backdated by prior recording");
         cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
  
         cy.log("Check new devicehistory entry created (automatically) by new recording");
         expectedHistory[2]=TestCreateExpectedHistoryEntry(deviceName, group, dayZero.toISOString(), oldLocation, "automatic", newStation.name);
         cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
  
         cy.log("check device location still at new location");
         const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
         expectedDevice.location=newLocation;
         cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
      });
    });
  });

  it("Move recording: add new recording on different place, after lastRecTime", () => {
    const deviceName = "update-device-13";
    const manualStationName = "Josie-station-13";
   
    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayZero.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording located elsewhere, after lastRecordingTime"); 
      cy.log("and check recording created new station");
      cy.testUploadRecording(deviceName, {...elsewhereLocation, time: dayThree}, thirdName)
      .thenCheckStationIsNew(Josie)
      .then((newStation:TestNameAndId) => {
         cy.log("Check old station unchanged");
         cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
  
         cy.log("Check deviceHistory has new entry for new recording locvation");
         expectedHistory[2]=TestCreateExpectedHistoryEntry(deviceName, group, dayThree.toISOString(), elsewhereLocation, "automatic", newStation.name);
         cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
  
         cy.log("check device location at elsewhere location");
         const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
         expectedDevice.location=elsewhereLocation;
         cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
      });
    });
  });
  
  it("Move recording: add new recording in different place, before lastRecTime", () => {
    const deviceName = "update-device-15";
    const manualStationName = "Josie-station-15";
   
    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayZero.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording located elsewhere, before lastRecordingTime"); 
      cy.log("and check recording creates new station");
      cy.testUploadRecording(deviceName, {...elsewhereLocation, time: dayOne}, firstName)
      .thenCheckStationIsNew(Josie)
      .then((newStation:TestNameAndId) => {
         cy.log("Check station unchanged by prior recording");
         cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
  
         cy.log("Check devicehistory has a new earlier entry for elsewhere location by new recording");
         expectedHistory[2]=TestCreateExpectedHistoryEntry(deviceName, group, dayOne.toISOString(), elsewhereLocation, "automatic", newStation.name);
         cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
  
         cy.log("check device location still at new location");
         const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
         expectedDevice.location=newLocation;
         cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
      });
    });
  });

  it("Move recording: add new recording in different place, before station creation time", () => {
    const deviceName = "update-device-16";
    const manualStationName = "Josie-station-16";
   
    //create device and station at dayTwo, recording at dayThree.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayThree.toISOString(), dayTwo.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
      expectedManualStation.activeAt=dayTwo.toISOString();
 
      cy.log("Add new recording located elsewhere, before manual station creation time (dayOne)"); 
      cy.log("and check recording creates a new station");
      cy.testUploadRecording(deviceName, {...elsewhereLocation, time: dayOne}, firstName)
      .thenCheckStationIsNew(Josie)
      .then((newStation:TestNameAndId) => {
         cy.log("Check manual station changed by prior recording");
         cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
  
         cy.log("Check new devicehistory entry created (automatically) by new recording");
         expectedHistory[2]=TestCreateExpectedHistoryEntry(deviceName, group, dayOne.toISOString(), elsewhereLocation, "automatic", newStation.name);
         cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
  
         cy.log("check device location still at new location");
         const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
         expectedDevice.location=newLocation;
         cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
      });
    });
  });

  it("Move recording: after subsequent new location & recordings, add past recordings in same location after lastRecTime for that location", () => {
    const deviceName = "update-device-17";
    const manualStationName = "Josie-station-17";
   
    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayZero.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording located elsewhere, dayFour - after lastRecordingTime"); 
      cy.log("and check recording created new station");
      cy.testUploadRecording(deviceName, {...elsewhereLocation, time: dayFour}, thirdName)
      .thenCheckStationIsNew(Josie)
      .then((newStation:TestNameAndId) => {

         expectedHistory[2]=TestCreateExpectedHistoryEntry(deviceName, group, dayFour.toISOString(), elsewhereLocation, "automatic", newStation.name);

         cy.log("Add old recording at new location after last recording at the location (dayThree)");
         cy.log("and check recording assigned to re-assigned station");
         cy.testUploadRecording(deviceName, {...newLocation, time: dayThree}, thirdName)
         .thenCheckStationNameIs(Josie, getTestName(manualStationName))
         .then(() => {

           cy.log("Check old station has new lastThermalRecordingTime");
           expectedManualStation.lastThermalRecordingTime=dayThree.toISOString();
           cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
    
           cy.log("Check deviceHistory unchanged");
           cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
    
           cy.log("check device location still at elsewhere location");
           const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
           expectedDevice.location=elsewhereLocation;
           cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
         });
      });
    });
  });
 
  //TODO: FAILS - Issue 3.  Later deviceHistory changed by fix - updates to earlier entry 
  it("Move recording: after subsequent new location & recorings, add past recordings in same location before lastRecTime for that location", () => {
    const deviceName = "update-device-18";
    const manualStationName = "Josie-station-18";
   
    //create device and station at dayZero, recording at dayTwo.
    //reassign recording from auto station to manual station
    cy.createDeviceStationRecordingAndFix(Josie, deviceName, manualStationName, secondName, group, oldLocation, newLocation, dayTwo.toISOString(), dayZero.toISOString(), true).then((expectedHistory:DeviceHistoryEntry[]) => {
 
      cy.log("Add new recording located elsewhere, dayFour - after lastRecordingTime"); 
      cy.log("and check recording created new station");
      cy.testUploadRecording(deviceName, {...elsewhereLocation, time: dayFour}, thirdName)
      .thenCheckStationIsNew(Josie)
      .then((newStation:TestNameAndId) => {

         expectedHistory[2]=TestCreateExpectedHistoryEntry(deviceName, group, dayFour.toISOString(), elsewhereLocation, "automatic", newStation.name);

         cy.log("Add old recording at new location before last recording at the location (dayOne)");
         cy.log("and check recording assigned to re-assigned station");
         cy.testUploadRecording(deviceName, {...newLocation, time: dayOne}, firstName)
         .thenCheckStationNameIs(Josie, getTestName(manualStationName))
         .then(() => {

           cy.log("Check old station unchanged");
           cy.apiStationCheck(Josie, getTestName(manualStationName), expectedManualStation);
    
           cy.log("Check deviceHistory backdated (automatically) to earlier recording time");
           expectedHistory[1].fromDateTime=dayOne.toISOString();
           expectedHistory[1].setBy="automatic";
           cy.apiDeviceHistoryCheck(Josie, deviceName, expectedHistory);
    
           cy.log("check device location still at elsewhere location");
           const expectedDevice=TestCreateExpectedDevice(deviceName, group, true, DeviceType.Thermal);
           expectedDevice.location=elsewhereLocation;
           cy.apiDeviceInGroupCheck(Josie, deviceName, group, null, expectedDevice);
         });
      });
    });
  });


});


