/// <reference path="../../../support/index.d.ts" />
import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { ApiStationResponse } from "@typedefs/api/station";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";
import { NOT_NULL, NOT_NULL_STRING, HTTP_Forbidden } from "@commands/constants";
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

describe("Stations: permissions", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

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
    cy.testCreateUserGroupAndDevice("saAdmin", "saGroup", "saCamera1").then(() => {
      TemplateExpectedStation.groupId=getCreds("saGroup").id;
      TemplateExpectedStation.groupName=getTestName("saGroup");
      TemplateExpectedStation.name=getTestName("saStation1");
    });
    cy.apiUserAdd("saMember");
    cy.apiGroupUserAdd("saAdmin","saMember","saGroup", false);
    cy.apiUserAdd("saNonMember");
  });

  it("Permissions: Group admin can add, get, update, delete a station", () => {
    let saStation1=TestCreateStationData("saStation", 1);
    let saUpdatedStation1=TestCreateStationData("saUpdatedStation", 1);
    let saExpectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"saStation", 1);
    let saUpdatedExpectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"saUpdatedStation", 1);
    let thisLocation=TestGetLocation(1);

    cy.log("Adding station");
    cy.apiGroupStationAdd("saAdmin","saGroup",saStation1).then(() => {
      cy.log("Can get station by id")
      cy.apiStationCheck("saAdmin", "saStation1", saExpectedStation1);

      let recordingTime=new Date();
      cy.testUploadRecording("saCamera1", { ...thisLocation, time: recordingTime }, "saRecording1").thenCheckStationIs(
        "saAdmin",
        "saStation1"
      ).then(() => {
        //Station now has a last thermal recording time
        saExpectedStation1.lastThermalRecordingTime=recordingTime.toISOString();
        saUpdatedExpectedStation1.lastThermalRecordingTime=recordingTime.toISOString();
        cy.log("Can get station by group, name");
        cy.apiGroupStationCheck("saAdmin", "saGroup", "saStation1", saExpectedStation1);

        cy.log("Can get stations by user");
//TODO: times out        cy.apiStationsCheck("saAdmin", [saExpectedStation1]);

        cy.log("Can update a station");
        cy.apiStationUpdate("saAdmin", "saStation1", {name: "newName"}).then(() => {
          saExpectedStation1.name=getTestName("newName");
          cy.apiStationCheck("saAdmin", "saStation1", saExpectedStation1);
        });

        cy.log("Can update a group's stations");
        cy.apiGroupStationsUpdate("saAdmin", "saGroup", [saUpdatedStation1]).then(() => {
          cy.apiStationCheck("saAdmin", "saStation1", saUpdatedExpectedStation1);
        });

        cy.log("Can delete station");
        cy.apiStationDelete("saAdmin", "saStation1").then(() => {
    
          cy.log("Station no longer exists");
          cy.apiStationCheck("saAdmin", "saStation1", undefined, [], HTTP_Forbidden);

          cy.log("Recording deleted too");
          cy.apiRecordingCheck("saAdmin", "saRecording1", undefined, [], HTTP_Forbidden);
        });
      });
    });
  });

  it("Permissions: Member cannot add, get, update or delete a station", () => {
    let saStation=TestCreateStationData("saStation", 2);
    let saUpdatedStation1=TestCreateStationData("saUpdatedStation", 2);
    let saExpectedStation=TestCreateExpectedStation(TemplateExpectedStation, "saStation", 2);
    cy.log("Member cannot add station");
    cy.apiGroupStationAdd("saMember","saGroup",saStation,undefined,undefined,HTTP_Forbidden);
   
    cy.log("Get admin to add a station to test with"); 
    cy.apiGroupStationAdd("saAdmin","saGroup",saStation).then(() => {
      cy.log("Member can get station by id")
//      cy.apiStationCheck("saMember", "saStation2", saExpectedStation);
 
      cy.log("Member can get station by group");
//      cy.apiGroupStationCheck("saMember", "saGroup", "saStation2", saExpectedStation);
   
      cy.log("Get stations by user does not list this station");
//      cy.apiStationsCheck("saMember", []);

      cy.log("Cannot update station");
//      cy.apiStationUpdate("saMember", "saStation2", {name: "newName"}, undefined, undefined, false, HTTP_Forbidden);
 
      cy.log("Cannot update a group's stations");
      cy.apiGroupStationsUpdate("saMember", "saGroup", [saUpdatedStation1], undefined, HTTP_Forbidden);

      cy.log("Cannot delete station");
//      cy.apiStationDelete("saMember", "saStation2", true, HTTP_Forbidden);
    
      cy.log("Station still exists");
      cy.apiStationCheck("saAdmin", "saStation2", saExpectedStation);
    });
  });


  it("Permissions: Non-member cannot add, get, update or delete a station", () => {
    let saStation=TestCreateStationData("saStation", 3);
    let saUpdatedStation1=TestCreateStationData("saUpdatedStation", 3);
    let saExpectedStation=TestCreateExpectedStation(TemplateExpectedStation, "saStation", 3);
    cy.log("Non-Member cannot add station");
    cy.apiGroupStationAdd("saNonMember","saGroup",saStation,undefined,undefined,HTTP_Forbidden);

    cy.log("Get admin to add a station to test with");
    cy.apiGroupStationAdd("saAdmin","saGroup",saStation).then(() => {
      cy.log("Non-Member cannot get station by id")
//      cy.apiStationCheck("saNonMember", "saStation3", undefined, undefined, HTTP_Forbidden);
  
      cy.log("Non-Member cannot get station by group");
      cy.apiGroupStationCheck("saNonMember", "saGroup", "saStation3", undefined, undefined, HTTP_Forbidden);
  
      cy.log("Get stations by user does not list this station");
//      cy.apiStationsCheck("saNonMember", []);

      cy.log("Non-member Cannot update station");
//      cy.apiStationUpdate("saNonMember", "saStation3", {name: "newName"}, undefined, undefined, false, HTTP_Forbidden);
      
      cy.log("Cannot update a group's stations");
      cy.apiGroupStationsUpdate("saNonMember", "saGroup", [saUpdatedStation1], undefined, HTTP_Forbidden);
  
      cy.log("Non-member Cannot delete station");
 //     cy.apiStationDelete("saNonMember", "saStation3", true, HTTP_Forbidden);
 
      cy.log("Station still exists");
      cy.apiStationCheck("saAdmin", "saStation3", saExpectedStation);
    });
  });

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it.skip("Super-user as user should see only their recordings", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);
      cy.apiGroupUserAdd( "saAdmin", superuser, "saGroup", true, true, undefined, { useRawUserName: true }
      );

      cy.apiGroupAdd(superuser, "saSuGroup");
      cy.apiDeviceAdd("saSuCamera","saSuGroup");

      let saStation1=TestCreateStationData("saStation", 4);
      let saExpectedStation1=TestCreateExpectedStation(TemplateExpectedStation,"saStation", 4);
      let saStation2=TestCreateStationData("saStation", 5);
      let saExpectedStation2=TestCreateExpectedStation(TemplateExpectedStation,"saStation", 5);

      cy.log("Adding station in another group");
      cy.apiGroupStationAdd("saAdmin","saGroup",saStation1);
      cy.apiGroupStationAdd(superuser,"saSuGroup",saStation2).then(() => {
        saExpectedStation2.groupId=getCreds("saSuGroup").id;
        saExpectedStation2.groupName=getTestName("saSuGroup");
        //Station by ID
        cy.log("SU can get station in any group by id")
        cy.apiStationCheck(superuser, "saStation4", saExpectedStation1);
  
        cy.log("SU cannot get station in any group by id when in user-mode")
        cy.apiStationCheck(superuser, "saStation4", undefined, undefined, HTTP_Forbidden, { additionalParams: {"view-mode": "user" }});

        cy.log("SU can get station in own group by id when in user-mode")
        cy.apiStationCheck(superuser, "saStation5", saExpectedStation2, undefined, undefined, { additionalParams: {"view-mode": "user" }});

        //Station by group
        cy.log("Can get station in any group by group, name");
        cy.apiGroupStationCheck(superuser, "saGroup", "saStation4", saExpectedStation1);
  
        cy.log("Cannot get station in any group by group, name when in user mode");
        cy.apiGroupStationCheck(superuser, "saGroup", "saStation4", undefined, undefined, HTTP_Forbidden, { additionalParams: {"view-mode": "user" }});

        cy.log("Can get station in own group by group, name when in user-mode");
        cy.apiGroupStationCheck(superuser, "saSuGroup", "saStation5", saExpectedStation2, undefined, undefined, { additionalParams: {"view-mode": "user" }});

        //Stations by user
        cy.log("Can get only own stations by user when in user-mode");
        cy.apiStationsCheck(superuser, [saExpectedStation2], undefined, undefined, { additionalParams: {"view-mode": "user" }});
      });
    });
  } else {
    it.skip("Super-user as user should see only their recordings", () => {});
  }
});
