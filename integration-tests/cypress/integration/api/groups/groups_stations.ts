/// <reference path="../../../support/index.d.ts" />

import { ApiStationData, ApiStationDataReturned } from "../../../commands/types";
import { getCreds } from "../../../commands/server";

import { HTTP_OK200 } from "../../../commands/constants";
import { HTTP_Forbidden } from "../../../commands/constants";
import { HTTP_Unprocessable } from "../../../commands/constants";
import { NOT_NULL } from "../../../commands/constants";

const ADMIN=true;
const NOT_ADMIN=false;
const EXCLUDE_CREATED_UPDATED_ID=["[].createdAt","[].updatedAt","[].id"];

let station1a={name: "station1", lat: -45.1, lng: 172.1};
let station1b={name: "station1", lat: -45.2, lng: 172.1};
let station2a={name: "station2", lat: -45.1, lng: 172.2};
let station2b={name: "station2", lat: -45.2, lng: 172.2};
let station3a={name: "station3", lat: -45.1, lng: 172.3};

//TODO: These coordinates are back to front.  Issue 73. Reverse once database & API are corrected. Should be X,Y
let expectedStation1a:ApiStationDataReturned={ id:0, name: "station1", location:{type: "Point", coordinates:  [-45.1,172.1]}, lastUpdatedById: 0, createdAt: null, retiredAt: null, updatedAt: null, GroupId: null};
let expectedStation1b:ApiStationDataReturned={ id:0, name: "station1", location:{type: "Point", coordinates:  [-45.2,172.1]}, lastUpdatedById: 0, createdAt: null, retiredAt: null, updatedAt: null, GroupId: null};
let expectedStation2a:ApiStationDataReturned={ id:0, name: "station2", location:{type: "Point", coordinates:  [-45.1,172.2]}, lastUpdatedById: 0, createdAt: null, retiredAt: null, updatedAt: null, GroupId: null};
let expectedStation2b:ApiStationDataReturned={ id:0, name: "station2", location:{type: "Point", coordinates:  [-45.2,172.2]}, lastUpdatedById: 0, createdAt: null, retiredAt: null, updatedAt: null, GroupId: null};
let expectedStation3a:ApiStationDataReturned={ id:0, name: "station3", location:{type: "Point", coordinates:  [-45.1,172.3]}, lastUpdatedById: 0, createdAt: null, retiredAt: null, updatedAt: null, GroupId: null};


describe("Groups - add/update/query/remove stations from group", () => {

  before(() => {
    //admin user, group and device
    cy.apiCreateUserGroupAndDevice("gsGroupAdmin", "gsGroup", "gsCamera").then(() => {
    });

    //2nd group
    cy.apiGroupAdd("gsGroupAdmin", "gsGroup2").then(() => {
    });

    //2nd device in first group
    cy.apiCreateDevice("gsCamera1b","gsGroup").then(() => {
    });

    //group member for this group
    cy.apiCreateUser("gsGroupMember");
    cy.apiGroupUserAdd("gsGroupAdmin", "gsGroupMember", "gsGroup", NOT_ADMIN);

    //device admin for 1st device
    cy.apiCreateUser("gsDeviceAdmin");
    cy.apiAddUserToDevice("gsGroupAdmin", "gsDeviceAdmin", "gsCamera", ADMIN);

    // test users
    cy.apiCreateUser("gsTestUser");
  });

  it.skip("Group admin can add, update, retire and query stations from a group", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupA");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupA", [station1a]).then(() => {
      expectedStation1a["GroupId"]=getCreds("gsGroupA").id;
      expectedStation1a["retiredAt"]=null;
      expectedStation1a["lastUpdatedById"]=getCreds("gsGroupAdmin").id; 

      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupA",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
    });

    //TODO: FAIL - issue 43
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupA", [station1b]).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupA").id;
      expectedStation1b["retiredAt"]=null;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
    
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupA",[expectedStation1b],EXCLUDE_CREATED_UPDATED_ID);
    });

    //TODO: FAIL - Issue 44
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupA", []).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupA").id;
      expectedStation1b["retiredAt"]=NOT_NULL;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupA",[],EXCLUDE_CREATED_UPDATED_ID);

    });

  });

  it("Group member can query but not add, update, retire stations from a group", () => {
    cy.log("Add a station as admin to test with");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup", [station1a]).then(() => {
      expectedStation1a["GroupId"]=getCreds("gsGroup").id;
      expectedStation1a["retiredAt"]=null;
      expectedStation1a["lastUpdatedById"]=getCreds("gsGroupAdmin").id;

      cy.log("Check member can view station");
      cy.apiGroupsStationsCheck("gsGroupMember","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);

      cy.log("Check member cannot add a station");
      cy.apiGroupsStationsUpdate("gsGroupMember","gsGroup", [station2a],undefined,HTTP_Forbidden).then(() => {
        //station not added
        cy.apiGroupsStationsCheck("gsGroupMember","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
      });

      cy.log("Check member cannot update a station");
      cy.apiGroupsStationsUpdate("gsGroupMember","gsGroup", [station1b],undefined,HTTP_Forbidden).then(() => {
        //station not added
        cy.apiGroupsStationsCheck("gsGroupMember","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
      });

      cy.log("Check member cannot retire a station");
      cy.apiGroupsStationsUpdate("gsGroupMember","gsGroup", [],undefined,HTTP_Forbidden).then(() => {
        //station not retired
        cy.apiGroupsStationsCheck("gsGroupMember","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
      });
    });
  });

  it("Non group members cannot add, update, retire or query stations", () => {
     cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup", [station1a]).then(() => {
      expectedStation1a["GroupId"]=getCreds("gsGroup").id;
      expectedStation1a["retiredAt"]=null;
      expectedStation1a["lastUpdatedById"]=getCreds("gsGroupAdmin").id;

      cy.log("Check non-member cannot view station");
      cy.apiGroupsStationsCheck("gsTestUser","gsGroup",[],null,HTTP_Forbidden);

      cy.log("Check non-member cannot add a station");
      cy.apiGroupsStationsUpdate("gsTestUser","gsGroup", [station2a],undefined,HTTP_Forbidden).then(() => {
        //station not added
        cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
      });

      cy.log("Check non-member cannot update a station");
      cy.apiGroupsStationsUpdate("gsTestUser","gsGroup", [station1b],undefined,HTTP_Forbidden).then(() => {
        //station not added
        cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
      });

      cy.log("Check non-member cannot retire a station");
      cy.apiGroupsStationsUpdate("gsTestUser","gsGroup", [],undefined,HTTP_Forbidden).then(() => {
        //station not retired
        cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroup",[expectedStation1a],EXCLUDE_CREATED_UPDATED_ID);
      });
    });

  });

  it.skip("Multiple stations supported", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupD");

    cy.log("Add two stations");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupD", [station1a, station2a]).then(() => {
      expectedStation1a["GroupId"]=getCreds("gsGroupD").id;
      expectedStation1a["retiredAt"]=null;
      expectedStation1a["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation2a["GroupId"]=getCreds("gsGroupD").id;
      expectedStation2a["retiredAt"]=null;
      expectedStation2a["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
  
      //stations added
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupD",[expectedStation1a, expectedStation2a],EXCLUDE_CREATED_UPDATED_ID);

    });

    //TODO Fails =: Issue 43
    cy.log("update two stations");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupD", [station1b, station2b]).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupD").id;
      expectedStation1b["retiredAt"]=null;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"]=getCreds("gsGroupD").id;
      expectedStation2b["retiredAt"]=null;
      expectedStation2b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
   
      //stations updated
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupD",[expectedStation1b, expectedStation2b],EXCLUDE_CREATED_UPDATED_ID);
   
    });

    //TODO: FAILS: Issue 44
    cy.log("retire two stations");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupD", []).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupD").id;
      expectedStation1b["retiredAt"]=NOT_NULL;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"]=getCreds("gsGroupD").id;
      expectedStation2b["retiredAt"]=NOT_NULL;
      expectedStation2b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;

      //stations retired
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupD",[expectedStation1b, expectedStation2b],EXCLUDE_CREATED_UPDATED_ID);

    });
  });

  it("Mix of add/update/retire supported", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupE");

    //add a station to test with
    ////TODO: Issue 44. enabled when fixed - not adding as later update will fail
    //cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupE", [station1a]);
    cy.log("Add and update station at same time");

    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupE", [station1b, station2b]).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupE").id;
      expectedStation1b["retiredAt"]=null;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"]=getCreds("gsGroupE").id;
      expectedStation2b["retiredAt"]=null;
      expectedStation2b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;

      //stations updated and added
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupE",[expectedStation1b, expectedStation2b],EXCLUDE_CREATED_UPDATED_ID);
    });


    cy.log("retire a station");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupE", [station1b]).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupE").id;
      expectedStation1b["retiredAt"]=null;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"]=getCreds("gsGroupE").id;
      expectedStation2b["retiredAt"]=NOT_NULL;
      expectedStation2b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
  
      //stations deleted
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupE",[expectedStation1b,expectedStation2b],EXCLUDE_CREATED_UPDATED_ID);
    });

    cy.log("retire and add a station");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroupE", [station3a]).then(() => {
      expectedStation1b["GroupId"]=getCreds("gsGroupE").id;
      expectedStation1b["retiredAt"]=NOT_NULL;
      expectedStation1b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"]=getCreds("gsGroupE").id;
      expectedStation2b["retiredAt"]=NOT_NULL;
      expectedStation2b["lastUpdatedById"]=getCreds("gsGroupAdmin").id;
      expectedStation3a["GroupId"]=getCreds("gsGroupE").id;
      expectedStation3a["retiredAt"]=null;
      expectedStation3a["lastUpdatedById"]=getCreds("gsGroupAdmin").id;

      //stations deleted and added
      cy.apiGroupsStationsCheck("gsGroupAdmin","gsGroupE",[expectedStation1b, expectedStation2b, expectedStation3a],EXCLUDE_CREATED_UPDATED_ID);
    });


  });

  it("Invalid group handled correctly", () => {
    cy.apiGroupsStationsUpdate("gsGroupAdmin","ThisGroupDoesNotExist", [station3a], undefined, HTTP_Unprocessable);
    cy.apiGroupsStationsCheck("gsGroupAdmin","ThisGroupDoesNotExist", [], undefined, HTTP_Unprocessable);
  });

  it("Invalid stations parameters handled correctly", () => {
    let badStation:ApiStationData={name: "hello", lat: null, lng: 172};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: "hello", lat: "string", lng: 172};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: "hello", lng: 172};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: "hello", lat: -45, lng: null};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: "hello", lat: -45};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: "hello", lat: -45, lng: "string"};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: null, lat: -45, lng: 172};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={lat: -45, lng: "string"};
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);

    badStation={name: "hello", lat: -45, lng: 172, randomParameter: true};
    //unexpected parameters ignored 
    //cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_OK200);

    //but a valid one still works
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[station1a],undefined,HTTP_OK200);
  });

  it("From date validated correctly", () => {
    let timestamp = new Date().toISOString();
    cy.log("from date timestamp accepted");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[station1a],timestamp,HTTP_OK200);

    cy.log("from date absent accepted");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[station1a],undefined,HTTP_OK200);

    cy.log("from date blank rejected");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[station1a],"",HTTP_Unprocessable);

    cy.log("malformed from date rejected");
    cy.apiGroupsStationsUpdate("gsGroupAdmin","gsGroup",[station1a],"ThisIsNotADate",HTTP_Unprocessable);
  });

  //Mapping of recording to stations tested in the recordings section
  //Application of fromDate to existing recordings tested in the recordings section


});

