/// <reference path="../../../support/index.d.ts" />
import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { ApiStationResponse } from "@typedefs/api/station";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";
import { NOT_NULL, NOT_NULL_STRING, HTTP_OK200, HTTP_Unprocessable } from "@commands/constants";
import { TestCreateStationData, TestCreateExpectedStation, TestGetLocation } from "@commands/api/station";

import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { ApiRecordingSet, ApiStationData } from "@commands/types";

const templateRecording: ApiRecordingSet = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING)
);

const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
);

describe("Stations: adding", () => {

  const TemplateStation: ApiStationData = {
    name: "saStation1",
    lat: -43.62367659982,
    lng: 172.62646754804 
  };
  const TemplateExpectedStation: ApiStationResponse  = {
    id: NOT_NULL,
    name: "saStation1",
    location: {lat: -43.62367659982, lng: 172.62646754804 },
    lastUpdatedById: NOT_NULL,
    createdAt: NOT_NULL_STRING,
    activeAt: NOT_NULL_STRING,
    updatedAt: NOT_NULL_STRING,
    automatic: false,
    groupId: NOT_NULL,
    groupName: NOT_NULL_STRING
  };
    

  before(() => {
    cy.testCreateUserGroupAndDevice("staAdmin", "staGroup", "staCamera1").then(() => {
      TemplateExpectedStation.groupId=getCreds("staGroup").id;
      TemplateExpectedStation.groupName=getTestName("staGroup");
      TemplateExpectedStation.name=getTestName("staStation1");
    });

    // second group and device
    cy.apiGroupAdd("staAdmin", "staGroup2");
    cy.apiDeviceAdd("staCamera2","staGroup2");
  });

  it("Can add a station with unique name and location", () => {
    let station1=TestCreateStationData("staStation", 1);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 1);

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1).then(() => {
      cy.log("Check station exists")
      cy.apiStationCheck("staAdmin", "staStation1", expectedStation1);
    });
  });

  it("Cannot add a station with duplicate name in this group", () => {
    let station1=TestCreateStationData("staStation", 2);
    let stationWithSameName={
      name: "staStation2",
      lat: -47,
      lng: 177
    };
    
    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1);
   
    cy.log("Cannot add duplicate-named station");
    cy.apiGroupStationAdd("staAdmin","staGroup",stationWithSameName, null, null, HTTP_Unprocessable);
  });

  it("Can add a station with duplicate name in another group", () => {
    let station1=TestCreateStationData("staStation", 3);
    let stationWithSameName={
      name: "staStation3",
      lat: -47,
      lng: 177
    };

    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 3);
    let expectedStation2=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 3);
    expectedStation2.location.lat=-47;
    expectedStation2.location.lng=177;
    expectedStation2.groupId=getCreds("staGroup2").id;
    expectedStation2.groupName=getTestName("staGroup2");

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1);

    cy.log("Can add duplicate-named station in another group");
    cy.apiGroupStationAdd("staAdmin","staGroup2",stationWithSameName);

    cy.log("Check station1 exists")
    cy.apiGroupStationCheck("staAdmin", "staGroup", "staStation3", expectedStation1);

    cy.log("Check station2 exists")
    cy.apiGroupStationCheck("staAdmin", "staGroup2", "staStation3", expectedStation2);
  });

  it("Station with duplicate name to retired station", () => {
    let station1=TestCreateStationData("staStation", 4);
    let stationWithSameName={
      name: "staStation4",
      lat: -47,
      lng: 177
    };

    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 4);
    let expectedStation2=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 4);
    expectedStation2.location.lat=-47;
    expectedStation2.location.lng=177;

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1,"2020-01-01T00:00:00.000Z").then(() => {

      let station1Id=getCreds(getTestName("staStation4")).id;

      cy.log("Retire that station");
      cy.testStationRetire("staAdmin","staStation4","2020-02-01T00:00:00.000Z");
 
      cy.log("Can add duplicate-named station");
      cy.apiGroupStationAdd("staAdmin","staGroup",stationWithSameName);
  
      cy.log("Check station1 exists")
      //TODO bug: cy.apiStationCheck("staAdmin", station1Id.toString(), expectedStation1, null, null, {useRawStationId: true, additionalParams: {"only-active": false}});
      cy.log("Check station2 exists")
      cy.apiGroupStationCheck("staAdmin", "staGroup", "staStation4", expectedStation2);
    });
  });

  it("No warning on add station with unique location", () => {
    let station1=TestCreateStationData("staStation", 5);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 5);

    cy.log("Adding station and check no warnings returned");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1,undefined,undefined,HTTP_OK200,{warnings: "none"});
  });

  it("Warning given for station too close in same group", () => {
    let station1=TestCreateStationData("staStation", 6);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 6);
    let stationTooClose=TestCreateStationData("staStation", 6);
    stationTooClose.name="stationTooClose6";
    let expectedStationTooClose=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 6);
    expectedStationTooClose.name="stationTooClose6";
    
    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1);
   
    cy.log("Can add duplicate-located station but earning given");
    cy.apiGroupStationAdd("staAdmin","staGroup",stationTooClose, undefined, undefined, HTTP_OK200, {warnings: [`New station is too close to ${getTestName(station1.name)}`]});

    cy.log("Check stations both exist")
    cy.apiGroupStationCheck("staAdmin", "staGroup2", "staStation6", expectedStation1);
    cy.apiGroupStationCheck("staAdmin", "staGroup2", "stationTooClose6", expectedStationTooClose);
  });

  it("No warning given for station too close in another group", () => {
    let station1=TestCreateStationData("staStation", 7);
    let stationTooClose=TestCreateStationData("staStation", 7);
    stationTooClose.name="stationTooClose7";
    
    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin","staGroup",station1);
   
    cy.log("Can add duplicate-located station without warning");
    cy.apiGroupStationAdd("staAdmin","staGroup2",stationTooClose, undefined, undefined, HTTP_OK200, {warnings: "none"});
  });

  it("No warning given for station too close to retired station", () => {
    let station1=TestCreateStationData("staStation", 8);
    let stationWithSameLocation=TestCreateStationData("staStation", 8);
    stationWithSameLocation.name="stationWithSameLocation8";
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"staStation", 8);
    let expectedStationWithSameLocation=TestCreateExpectedStation(TemplateExpectedStation,"stationWithSameLocation", 8);

    cy.apiGroupStationAdd("staAdmin","staGroup",station1,"2020-01-01T00:00:00.000Z").then(() => {
        
      cy.log("Retire that station");
      cy.testStationRetire("staAdmin","staStation8","2020-02-01T00:00:00.000Z");
        
      cy.log("Can add duplicate-located station with no warning");
      cy.apiGroupStationAdd("staAdmin","staGroup",stationWithSameLocation, undefined, undefined, undefined, {warnings: "none"});

      cy.log("Check that both stations exist");
      //TODO bug: cy.apiGroupStationCheck("staAdmin", "staGroup", "staStation8", expectedStation1);
      cy.apiGroupStationCheck("staAdmin", "staGroup", "stationWithSameLocation8", expectedStationWithSameLocation);
    });
  });

});
