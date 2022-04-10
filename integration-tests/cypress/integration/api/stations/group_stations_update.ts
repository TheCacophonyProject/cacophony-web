     /*
      1) Create. This stays as-currently-is
      2) Rename. This functionality should be kept - rename the existing station if the location is the same
      3) Move. This is currently broken. In this case we need to rename the old station to keep it unique and creat  e a new one as-per trapNZ
       */
  
      // Stations will be matched on name, location,

/// <reference path="../../../support/index.d.ts" />
import { ApiStationResponse } from "@typedefs/api/station";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";
import { NOT_NULL, NOT_NULL_STRING, HTTP_OK200, HTTP_Unprocessable, HTTP_Forbidden } from "@commands/constants";
import { TestCreateStationData, TestCreateExpectedStation, TestCreateExpectedAutomaticStation, TestGetLocation } from "@commands/api/station";

describe("Stations: updating", () => {

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
    cy.apiUserAdd("stsuAdmin");
  });

  it("Can update a station with new unique name", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup1");

    let station1=TestCreateStationData("stsuStation", 1);
    let updatedStation1=TestCreateStationData("stsuUpdatedStation", 1);
    let expectedUpdatedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuUpdatedStation", 1);


    cy.log("Adding station");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup1",station1).then((stationId:number) => {

      cy.log("Updating name");
      cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup1",[updatedStation1], undefined, undefined, {stationIdsAddedOrUpdated: [stationId], stationIdsRetired: []});
  
      cy.log("Check station updated correctly")
      cy.apiGroupStationCheck("stsuAdmin", "stsuGroup1", "stsuUpdatedStation1", expectedUpdatedStation1);
  
      cy.log("Check old station name no longer present");
      cy.apiGroupStationCheck("stsuAdmin", "stsuGroup1", "stsuStation1", undefined, undefined, HTTP_Forbidden);
    });
  });


  //TODO: fix - This scenario creates duplicate-named station.s Issue 12
  it.skip("Can update an exsting station with new unique location", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup2");

    let station1=TestCreateStationData("stsuStation", 2);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 2);
    let updatedStation1={name: "stsuStation2", lat: -47, lng: 177};
    let expectedUpdatedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 2);
    expectedUpdatedStation1.location={lat: -47, lng: 177};
    let updatedStation1b={name: "stsuStation2", lat: -48, lng: 177};
    let expectedUpdatedStation1b=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 2);
    expectedUpdatedStation1b.location={lat: -48, lng: 177};

    cy.log("Adding station");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup2",station1).then((initialStationId:number) => {

      cy.log("Updating location");
      cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup2",[updatedStation1]).then((stationIds: number[]) => {
        expect(stationIds.length,"Expect 2 updated stations").to.equal(2);

        cy.log("Check old station renamed to _moved")
        expectedStation1.name=expectedStation1.name+"_moved";
        cy.apiStationCheck("stsuAdmin", (initialStationId).toString(), expectedStation1, undefined, undefined, {useRawStationId: true});
  
        cy.log("Check new station created with the original name and new position");
        cy.apiStationCheck("stsuAdmin", (stationIds[1]).toString(), expectedUpdatedStation1, undefined, undefined, {useRawStationId: true});
  
        cy.log("Move again and verify do not end up with duplicate named stations");
        cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup2",[updatedStation1b]).then((stationIds: number[]) => {
          expect(stationIds.length,"Expect 2 updated stations").to.equal(2);

          cy.log("Check original station unaffected by new move");
          cy.apiStationCheck("stsuAdmin", (initialStationId).toString(), expectedStation1, undefined, undefined, {useRawStationId: true});

          cy.log("Check outdated station renamed to _moved");
          expectedUpdatedStation1.name=expectedUpdatedStation1.name+"_moved";
          cy.apiStationCheck("stsuAdmin", (stationIds[0]).toString(), expectedUpdatedStation1, undefined, undefined, {useRawStationId: true});

          cy.log("Check new station created with latest position and original name");
          cy.apiStationCheck("stsuAdmin",  (stationIds[1]).toString(), expectedUpdatedStation1b, undefined, undefined, {useRawStationId: true});
        });
      });
    });
  });


  it("Update with new name and location creates a new station, does not affect old station", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup3");

    let station1=TestCreateStationData("stsuStation", 3);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 3);
    let newStation=TestCreateStationData("stsuStation", 4);
    let expectedNewStation=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 4);

    cy.log("Adding station");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup3",station1).then((initialStationId:number) => {

      cy.log("Updating with new station");
      cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup3",[newStation]).then((stationIds) => {
        expect(stationIds.length,"Expect 1 updated stations").to.equal(1);

        cy.log("Check old station unchanged")
        cy.apiStationCheck("stsuAdmin", (initialStationId).toString(), expectedStation1, undefined, undefined, {useRawStationId: true});
  
        cy.log("Check new station created");
        cy.apiStationCheck("stsuAdmin", (stationIds[0]).toString(), expectedNewStation, undefined, undefined, {useRawStationId: true});
      });
    });
  });
  
  it("Cannot use update to update a station to have duplicate name in same group (specify only changes)", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup4");

    let station1=TestCreateStationData("stsuStation", 5);
    let station2=TestCreateStationData("stsuStation", 6);
    // following has name of station2 but position of station1
    let stationWithSameName=TestCreateStationData("stsuStation", 5);
    stationWithSameName.name="stsuStation6";
    
    cy.log("Adding station1");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup4",station1).then(() => {
   
      cy.log("Adding station2");
      cy.apiGroupStationAdd("stsuAdmin","stsuGroup4",station2).then(() => {

        cy.log("Cannot rename station2 to same name as station1");
        cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup4",[stationWithSameName], undefined, HTTP_Unprocessable);
      });
    });
  });

  it("Cannot use update to update a station to have duplicate name in same group (specify all stations)", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup5");

    let station1=TestCreateStationData("stsuStation", 5);
    let station2=TestCreateStationData("stsuStation", 6);
    // following has name of station2 but position of station1
    let stationWithSameName=TestCreateStationData("stsuStation", 5);
    stationWithSameName.name="stsuStation6";

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup5",station1).then(() => {

      cy.log("Adding station2");
      cy.apiGroupStationAdd("stsuAdmin","stsuGroup5",station2).then(() => {

        cy.log("Cannot rename station2 to same name as station1");
        cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup5",[station1, stationWithSameName], undefined, HTTP_Unprocessable);
      });
    });
  });

  it("Cannot use update to add stations with duplicate name in same group (specify all stations)", ()   => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup6");

    let station1=TestCreateStationData("stsuStation", 1);
    // following has name of station1 but position of station2
    let stationWithSameName=TestCreateStationData("stsuStation", 2);
    stationWithSameName.name="stsuStation1";


    cy.log("Cannot add station2 to same name as station1");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup6",[station1, stationWithSameName], undefined, HTTP_Unprocessable);
  });

  it("Can add a station with duplicate name in another group", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup7");
    cy.apiGroupAdd("stsuAdmin","stsuGroup8");
    let station1=TestCreateStationData("stsuStation", 1);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 1);
    let station2=TestCreateStationData("stsuStation", 1);
    let expectedStation2=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 1);

    cy.log("Adding station1");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup7",[station1]);

    cy.log("Adding station2");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup8",[station2]);

    cy.log("Check station1 exists")
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup7", "stsuStation1", expectedStation1);

    cy.log("Check station2 exists")
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup8", "stsuStation1", expectedStation2);
  });

  it("Station with duplicate name to retired station", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup9");
    let station1=TestCreateStationData("stsuStation", 9);
    let stationWithSameName=TestCreateStationData("stsuStation", 10);
    stationWithSameName.name = "stsuStation9";

    let expectedStation1:ApiStationResponse=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 9);
    let expectedStationWithSameName=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 10);
    expectedStationWithSameName.name = getTestName("stsuStation9");

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup9",station1,"2020-01-01T00:00:00.000Z").then(() => {
      let station1Id:number=getCreds(getTestName("stsuStation9")).id;

      cy.log("Retire station1");
      cy.testStationRetire("stsuAdmin","stsuStation9","2020-02-01T00:00:00.000Z");
 
      cy.log("Can use update to add station2 to have same name as retired station1");
      cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup9",[stationWithSameName]).then((stationIds:number[]) => {
        expect(stationIds.length, "Expect only 1 updated station").to.equal(1);
  
        cy.log("Check station1 exists")
        //TODO bug: cy.apiStationCheck("stsuAdmin", station1Id.toString(), expectedStation1, null, null, {useRawStationId: true, additionalParams: {"only-active": false}});
        cy.log("Check station2 exists")
        cy.apiGroupStationCheck("stsuAdmin", "stsuGroup9", "stsuStation9", expectedStationWithSameName);
      });
    });
  });

  it("No warning on update station with unique location", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup10");
    let station1=TestCreateStationData("stsuStation", 11);
    let movedStation=TestCreateStationData("stsuStation", 12);
    movedStation.name="stsuStaion11";

    cy.log("Adding station");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup10",[station1],undefined, undefined, {warnings: "none"});

    cy.log("Updating station location and check no warnings returned");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup10",[movedStation],undefined,undefined,{warnings: "none"});
  });

  it("Warning given for update station too close to another in same group", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup11");

    let station1=TestCreateStationData("stsuStation", 13);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 13);
    let stationTooClose=TestCreateStationData("stsuStation", 13);
    stationTooClose.name="stationTooClose14";
    let expectedStationTooClose=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 13);
    expectedStationTooClose.name=getTestName("stationTooClose14");
    
    cy.log("Can update station to same posn as station1 but warning given");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup11",[station1, stationTooClose], undefined, HTTP_OK200, {warnings: [`Stations too close together`]});

    cy.log("Check stations both exist")
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup11", "stsuStation13", expectedStation1);
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup11", "stationTooClose14", expectedStationTooClose);
  });

  it("Warning given for update station too close to another in same group (only 1 updated)", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup12");

    let station1=TestCreateStationData("stsuStation", 13);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 13);
    let stationTooClose=TestCreateStationData("stsuStation", 13);
    stationTooClose.name="stationTooClose14";
    stationTooClose.lat=station1.lat+0.0001;
    stationTooClose.lng=station1.lng+0.0001;
    let expectedStationTooClose=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 13);
    expectedStationTooClose.name=getTestName("stationTooClose14");
    expectedStationTooClose.location.lat=stationTooClose.lat;
    expectedStationTooClose.location.lng=stationTooClose.lng;
   
    cy.log("Add station1");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup12",station1);

    cy.log("Can update station to near posn to station1 but warning given");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup12",[stationTooClose], undefined, HTTP_OK200, {warnings: [`Stations too close together`]});

    cy.log("Check stations both exist")
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup12", "stsuStation13", expectedStation1);
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup12", "stationTooClose14", expectedStationTooClose);
  });

  it("No warning given for station too close in another group", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup13");
    cy.apiGroupAdd("stsuAdmin","stsuGroup14");

    let station1=TestCreateStationData("stsuStation", 13);
    let expectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 13);
    let stationTooClose=TestCreateStationData("stsuStation", 13);
    stationTooClose.name="stationTooClose14";
    stationTooClose.lat=station1.lat+0.0001;
    stationTooClose.lng=station1.lng+0.0001;
    let expectedStationTooClose=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 13);
    expectedStationTooClose.name=getTestName("stationTooClose14");
    expectedStationTooClose.location.lat=stationTooClose.lat;
    expectedStationTooClose.location.lng=stationTooClose.lng;
   
    cy.log("Add station1");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup13",station1);

    cy.log("Can update station to near posn to station1 but warning no given as groups different");
    cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup14",[stationTooClose], undefined, HTTP_OK200, {warnings: "none"});

    cy.log("Check stations both exist")
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup13", "stsuStation13", expectedStation1);
    cy.apiGroupStationCheck("stsuAdmin", "stsuGroup14", "stationTooClose14", expectedStationTooClose);
  });

  it("No warning given for station too close to retired station", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup15");

    let station1=TestCreateStationData("stsuStation", 1);
    let expectedStation1:ApiStationResponse=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 1);
    let stationTooClose=TestCreateStationData("stsuStation", 1);
    stationTooClose.name="stationTooClose1";
    stationTooClose.lat=station1.lat+0.0001;
    stationTooClose.lng=station1.lng+0.0001;
    let expectedStationTooClose=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 1);
    expectedStationTooClose.name=getTestName("stationTooClose1");
    expectedStationTooClose.location.lat=stationTooClose.lat;
    expectedStationTooClose.location.lng=stationTooClose.lng;
   
    cy.log("Add station1");
    cy.apiGroupStationAdd("stsuAdmin","stsuGroup15",station1,"2020-01-01T00:00:00.000Z").then((station1Id:number) => {

      cy.log("Retire station1");
      cy.testStationRetire("stsuAdmin","stsuStation1","2020-02-01T00:00:00.000Z");

      cy.log("Can update station to near posn to station1 and no warning given");
      cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup15",[stationTooClose], undefined, HTTP_OK200, {warnings: "none"});
  
      cy.log("Check stations both exist")
      //TODO bug: cy.apiStationCheck("stuAdmin", station1Id.toString(), expectedStation1, null, null, {useRawStationId: true, additionalParams: {"only-active": false}});

      cy.apiGroupStationCheck("stsuAdmin", "stsuGroup15", "stationTooClose1", expectedStationTooClose);
    });
  });

  it("Automatic station becomes manual when updated", () => {
    cy.apiGroupAdd("stsuAdmin","stsuGroup16");
    cy.apiDeviceAdd("stsuCamera1","stsuGroup16");

    let recordingTime=new Date();
    let station2=TestCreateStationData("stsuStation", 19);
    let expectedStation1=TestCreateExpectedAutomaticStation(TemplateExpectedStation,19,"stsuCamera1", recordingTime.toISOString());

    let expectedStation2=TestCreateExpectedStation(TemplateExpectedStation,"stsuStation", 19);
    expectedStation2.lastThermalRecordingTime=recordingTime.toISOString();
    expectedStation2.lastUpdatedById = getCreds("stsuAdmin").id;
    let thisLocation=TestGetLocation(19);

    cy.testUploadRecording("stsuCamera1", { ...thisLocation, time: recordingTime }, "saRecording1").thenCheckStationIsNew("stsuAdmin").then(() => {
      cy.log("Check autocreated station");
      cy.apiGroupStationCheck("stsuAdmin","stsuGroup16", expectedStation1.name, expectedStation1, undefined, undefined, { useRawStationName: true }).then((stationId:number) => {

        cy.log("Update automatic station");
        cy.apiGroupStationsUpdate("stsuAdmin","stsuGroup16", [station2], undefined,undefined,{ stationIdsAddedOrUpdated: [stationId]});

        cy.log("Check updated station");
        cy.apiStationCheck("stsuAdmin", stationId.toString(), expectedStation2, undefined, undefined, { useRawStationId: true });
      });
    });
  });

});
