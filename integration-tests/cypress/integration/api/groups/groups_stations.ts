/// <reference path="../../../support/index.d.ts" />

import {
  ApiStationData,
  ApiStationDataReturned,
} from "../../../commands/types";
import { getCreds } from "../../../commands/server";

import { HTTP_OK200 } from "../../../commands/constants";
import { HTTP_Forbidden } from "../../../commands/constants";
import { HTTP_Unprocessable } from "../../../commands/constants";
import { NOT_NULL } from "../../../commands/constants";

describe("Groups - add/update/query/remove stations from group", () => {
  const ADMIN = true;
  const NOT_ADMIN = false;

  //do not validate updatedAt or createdAt values
  const EXCLUDE_CREATED_UPDATED_ID = ["[].createdAt", "[].updatedAt", "[].id"];
  
  const station1a = { name: "station1", lat: -45.1, lng: 172.1 };
  const station1b = { name: "station1", lat: -45.2, lng: 172.1 };
  const station2a = { name: "station2", lat: -45.1, lng: 172.2 };
  const station2b = { name: "station2", lat: -45.2, lng: 172.2 };
  const station3a = { name: "station3", lat: -45.1, lng: 172.3 };
  
  //TODO: These coordinates are back to front.  Issue 73. Reverse once database & API are corrected. Should be X,Y
  const expectedStation1a: ApiStationDataReturned = {
    id: 0,
    name: "station1",
    location: { type: "Point", coordinates: [-45.1, 172.1] },
    lastUpdatedById: 0,
    createdAt: null,
    retiredAt: null,
    updatedAt: null,
    GroupId: null,
  };
  const expectedStation1b: ApiStationDataReturned = {
    id: 0,
    name: "station1",
    location: { type: "Point", coordinates: [-45.2, 172.1] },
    lastUpdatedById: 0,
    createdAt: null,
    retiredAt: null,
    updatedAt: null,
    GroupId: null,
  };
  const expectedStation2a: ApiStationDataReturned = {
    id: 0,
    name: "station2",
    location: { type: "Point", coordinates: [-45.1, 172.2] },
    lastUpdatedById: 0,
    createdAt: null,
    retiredAt: null,
    updatedAt: null,
    GroupId: null,
  };
  const expectedStation2b: ApiStationDataReturned = {
    id: 0,
    name: "station2",
    location: { type: "Point", coordinates: [-45.2, 172.2] },
    lastUpdatedById: 0,
    createdAt: null,
    retiredAt: null,
    updatedAt: null,
    GroupId: null,
  };
  const expectedStation3a: ApiStationDataReturned = {
    id: 0,
    name: "station3",
    location: { type: "Point", coordinates: [-45.1, 172.3] },
    lastUpdatedById: 0,
    createdAt: null,
    retiredAt: null,
    updatedAt: null,
    GroupId: null,
  };
  
  before(() => {
    //admin user, group and device
    cy.testCreateUserGroupAndDevice("gsGroupAdmin", "gsGroup", "gsCamera").then(
      () => {}
    );

    //2nd group
    cy.apiGroupAdd("gsGroupAdmin", "gsGroup2").then(() => {});

    //2nd device in first group
    cy.apiDeviceAdd("gsCamera1b", "gsGroup").then(() => {});

    //group member for this group
    cy.apiUserAdd("gsGroupMember");
    cy.apiGroupUserAdd("gsGroupAdmin", "gsGroupMember", "gsGroup", NOT_ADMIN);

    //device admin for 1st device
    cy.apiUserAdd("gsDeviceAdmin");
    cy.apiDeviceUserAdd("gsGroupAdmin", "gsDeviceAdmin", "gsCamera", ADMIN);

    // test users
    cy.apiUserAdd("gsTestUser");
  });

  it.skip("Group admin can add, update, retire and query stations from a group", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupA");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupA", [station1a]).then(
      () => {
        expectedStation1a["GroupId"] = getCreds("gsGroupA").id;
        expectedStation1a["retiredAt"] = null;
        expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        cy.apiGroupsStationsCheck(
          "gsGroupAdmin",
          "gsGroupA",
          [expectedStation1a],
          EXCLUDE_CREATED_UPDATED_ID
        );
      }
    );

    //TODO: FAIL - issue 43
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupA", [station1b]).then(
      () => {
        expectedStation1b["GroupId"] = getCreds("gsGroupA").id;
        expectedStation1b["retiredAt"] = null;
        expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        cy.apiGroupsStationsCheck(
          "gsGroupAdmin",
          "gsGroupA",
          [expectedStation1b],
          EXCLUDE_CREATED_UPDATED_ID
        );
      }
    );

    //TODO: FAIL - Issue 44
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupA", []).then(() => {
      expectedStation1b["GroupId"] = getCreds("gsGroupA").id;
      expectedStation1b["retiredAt"] = NOT_NULL;
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupA",
        [],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });
  });

  it("Group member can query but not add, update, retire stations from a group", () => {
    cy.log("Add a station as admin to test with");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroup", [station1a]).then(
      () => {
        expectedStation1a["GroupId"] = getCreds("gsGroup").id;
        expectedStation1a["retiredAt"] = null;
        expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        cy.log("Check member can view station");
        cy.apiGroupsStationsCheck(
          "gsGroupMember",
          "gsGroup",
          [expectedStation1a],
          EXCLUDE_CREATED_UPDATED_ID
        );

        cy.log("Check member cannot add a station");
        cy.apiGroupStationsUpdate(
          "gsGroupMember",
          "gsGroup",
          [station2a],
          undefined,
          HTTP_Forbidden
        ).then(() => {
          //station not added
          cy.apiGroupsStationsCheck(
            "gsGroupMember",
            "gsGroup",
            [expectedStation1a],
            EXCLUDE_CREATED_UPDATED_ID
          );
        });

        cy.log("Check member cannot update a station");
        cy.apiGroupStationsUpdate(
          "gsGroupMember",
          "gsGroup",
          [station1b],
          undefined,
          HTTP_Forbidden
        ).then(() => {
          //station not added
          cy.apiGroupsStationsCheck(
            "gsGroupMember",
            "gsGroup",
            [expectedStation1a],
            EXCLUDE_CREATED_UPDATED_ID
          );
        });

        cy.log("Check member cannot retire a station");
        cy.apiGroupStationsUpdate(
          "gsGroupMember",
          "gsGroup",
          [],
          undefined,
          HTTP_Forbidden
        ).then(() => {
          //station not retired
          cy.apiGroupsStationsCheck(
            "gsGroupMember",
            "gsGroup",
            [expectedStation1a],
            EXCLUDE_CREATED_UPDATED_ID
          );
        });
      }
    );
  });

  it("Non group members cannot add, update, retire or query stations", () => {
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroup", [station1a]).then(
      () => {
        expectedStation1a["GroupId"] = getCreds("gsGroup").id;
        expectedStation1a["retiredAt"] = null;
        expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        cy.log("Check non-member cannot view station");
        cy.apiGroupsStationsCheck(
          "gsTestUser",
          "gsGroup",
          [],
          null,
          HTTP_Forbidden
        );

        cy.log("Check non-member cannot add a station");
        cy.apiGroupStationsUpdate(
          "gsTestUser",
          "gsGroup",
          [station2a],
          undefined,
          HTTP_Forbidden
        ).then(() => {
          //station not added
          cy.apiGroupsStationsCheck(
            "gsGroupAdmin",
            "gsGroup",
            [expectedStation1a],
            EXCLUDE_CREATED_UPDATED_ID
          );
        });

        cy.log("Check non-member cannot update a station");
        cy.apiGroupStationsUpdate(
          "gsTestUser",
          "gsGroup",
          [station1b],
          undefined,
          HTTP_Forbidden
        ).then(() => {
          //station not added
          cy.apiGroupsStationsCheck(
            "gsGroupAdmin",
            "gsGroup",
            [expectedStation1a],
            EXCLUDE_CREATED_UPDATED_ID
          );
        });

        cy.log("Check non-member cannot retire a station");
        cy.apiGroupStationsUpdate(
          "gsTestUser",
          "gsGroup",
          [],
          undefined,
          HTTP_Forbidden
        ).then(() => {
          //station not retired
          cy.apiGroupsStationsCheck(
            "gsGroupAdmin",
            "gsGroup",
            [expectedStation1a],
            EXCLUDE_CREATED_UPDATED_ID
          );
        });
      }
    );
  });

  it.skip("Multiple stations supported", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupD");

    cy.log("Add two stations");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupD", [
      station1a,
      station2a,
    ]).then(() => {
      expectedStation1a["GroupId"] = getCreds("gsGroupD").id;
      expectedStation1a["retiredAt"] = null;
      expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2a["GroupId"] = getCreds("gsGroupD").id;
      expectedStation2a["retiredAt"] = null;
      expectedStation2a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

      //stations added
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupD",
        [expectedStation1a, expectedStation2a],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });

    //TODO Fails =: Issue 43
    cy.log("update two stations");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupD", [
      station1b,
      station2b,
    ]).then(() => {
      expectedStation1b["GroupId"] = getCreds("gsGroupD").id;
      expectedStation1b["retiredAt"] = null;
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"] = getCreds("gsGroupD").id;
      expectedStation2b["retiredAt"] = null;
      expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

      //stations updated
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupD",
        [expectedStation1b, expectedStation2b],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });

    //TODO: FAILS: Issue 44
    cy.log("retire two stations");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupD", []).then(() => {
      expectedStation1b["GroupId"] = getCreds("gsGroupD").id;
      expectedStation1b["retiredAt"] = NOT_NULL;
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"] = getCreds("gsGroupD").id;
      expectedStation2b["retiredAt"] = NOT_NULL;
      expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

      //stations retired
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupD",
        [expectedStation1b, expectedStation2b],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });
  });

  it("Mix of add/update/retire supported", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupE");

    //add a station to test with
    ////TODO: Issue 44. enabled when fixed - not adding as later update will fail
    //cy.apiGroupStationsUpdate("gsGroupAdmin","gsGroupE", [station1a]);
    cy.log("Add and update station at same time");

    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupE", [
      station1b,
      station2b,
    ]).then(() => {
      expectedStation1b["GroupId"] = getCreds("gsGroupE").id;
      expectedStation1b["retiredAt"] = null;
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"] = getCreds("gsGroupE").id;
      expectedStation2b["retiredAt"] = null;
      expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

      //stations updated and added
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupE",
        [expectedStation1b, expectedStation2b],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });

    cy.log("retire a station");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupE", [station1b]).then(
      () => {
        expectedStation1b["GroupId"] = getCreds("gsGroupE").id;
        expectedStation1b["retiredAt"] = null;
        expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
        expectedStation2b["GroupId"] = getCreds("gsGroupE").id;
        expectedStation2b["retiredAt"] = NOT_NULL;
        expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        //stations deleted
        cy.apiGroupsStationsCheck(
          "gsGroupAdmin",
          "gsGroupE",
          [expectedStation1b, expectedStation2b],
          EXCLUDE_CREATED_UPDATED_ID
        );
      }
    );

    cy.log("retire and add a station");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupE", [station3a]).then(
      () => {
        expectedStation1b["GroupId"] = getCreds("gsGroupE").id;
        expectedStation1b["retiredAt"] = NOT_NULL;
        expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
        expectedStation2b["GroupId"] = getCreds("gsGroupE").id;
        expectedStation2b["retiredAt"] = NOT_NULL;
        expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
        expectedStation3a["GroupId"] = getCreds("gsGroupE").id;
        expectedStation3a["retiredAt"] = null;
        expectedStation3a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        //stations deleted and added
        cy.apiGroupsStationsCheck(
          "gsGroupAdmin",
          "gsGroupE",
          [expectedStation1b, expectedStation2b, expectedStation3a],
          EXCLUDE_CREATED_UPDATED_ID
        );
      }
    );
  });

  it("Invalid group handled correctly", () => {
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "ThisGroupDoesNotExist",
      [station3a],
      undefined,
      HTTP_Unprocessable
    );
    cy.apiGroupsStationsCheck(
      "gsGroupAdmin",
      "ThisGroupDoesNotExist",
      [],
      undefined,
      HTTP_Unprocessable
    );
  });

  it("Invalid stations parameters handled correctly", () => {
    let badStation: ApiStationData = { name: "hello", lat: null, lng: 172 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: "hello", lat: "string", lng: 172 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: "hello", lng: 172 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: "hello", lat: -45, lng: null };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: "hello", lat: -45 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: "hello", lat: -45, lng: "string" };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: null, lat: -45, lng: 172 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { lat: -45, lng: "string" };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
    );

    badStation = { name: "hello", lat: -45, lng: 172, randomParameter: true };
    //unexpected parameters ignored
    //cy.apiGroupStationsUpdate("gsGroupAdmin","gsGroup",[badStation],undefined,HTTP_Unprocessable);
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_OK200
    );

    //but a valid one still works
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [station1a],
      undefined,
      HTTP_OK200
    );
  });

  it("Stations too close rejected", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupG");
    cy.log("Add a station");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupG", [station1a]);

    cy.log("Attempt to add another too close");
    const badStation = { name: "tooClose", lat: -45.100001, lng: 172.100001 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroupG",
      [station1a, badStation],
      undefined,
      HTTP_OK200,
      { warnings: ["Stations too close together"] }
    );

    cy.log("Attempt to add two too close at same time");
    const badStation1 = { name: "tooClose", lat: -45.500001, lng: 172.100001 };
    const badStation2 = { name: "tooClose", lat: -45.500002, lng: 172.100001 };
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroupG",
      [station1a, badStation1, badStation2],
      undefined,
      HTTP_OK200,
      { warnings: ["Stations too close together"] }
    );
  });

  it("Add new station with same name as retired station - both kept", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupF");

    cy.log("Add two stations");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupF", [
      station1a,
      station2a,
    ]);

    cy.log("retire station");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupF", [station1a]);

    cy.log("Re-add new station");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupF", [
      station1a,
      station2b,
    ]).then(() => {
      expectedStation1a["GroupId"] = getCreds("gsGroupF").id;
      expectedStation1a["retiredAt"] = null;
      expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2a["GroupId"] = getCreds("gsGroupF").id;
      expectedStation2a["retiredAt"] = NOT_NULL;
      expectedStation2a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["GroupId"] = getCreds("gsGroupF").id;
      expectedStation2b["retiredAt"] = null;
      expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

      //check both retired and new station shows
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupF",
        [expectedStation1a, expectedStation2a, expectedStation2b],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });
  });

  it("From date validated correctly", () => {
    const timestamp = new Date().toISOString();
    cy.log("from date timestamp accepted");
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [station1a],
      timestamp,
      HTTP_OK200
    );

    cy.log("from date absent accepted");
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [station1a],
      undefined,
      HTTP_OK200
    );

    cy.log("from date blank rejected");
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [station1a],
      "",
      HTTP_Unprocessable
    );

    cy.log("malformed from date rejected");
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [station1a],
      "ThisIsNotADate",
      HTTP_Unprocessable
    );
  });

  //Mapping of recording to stations tested in the recordings section
  //Application of fromDate to existing recordings tested in the recordings section
});
