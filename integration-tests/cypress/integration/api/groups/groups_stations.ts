/// <reference path="../../../support/index.d.ts" />

import { getCreds } from "@commands/server";

import {
  HTTP_OK200,
  HTTP_Forbidden,
  HTTP_Unprocessable,
  NOT_NULL_STRING,
} from "@commands/constants";
import { ApiStationResponse } from "@typedefs/api/station";
import { getTestName } from "@commands/names";

describe("Groups - add/update/query/remove stations from group", () => {
  const NOT_ADMIN = false;

  //do not validate updatedAt or createdAt values
  const EXCLUDE_CREATED_UPDATED_ID = [
    "[].createdAt",
    "[].updatedAt",
    "[].activeAt",
    "[].id",
  ];

  const station1a = { name: "station1", lat: -45.1, lng: 172.1 };
  const station1b = { name: "station1", lat: -45.2, lng: 172.1 };
  const station2a = { name: "station2", lat: -45.1, lng: 172.2 };
  const station2b = { name: "station2", lat: -45.2, lng: 172.2 };
  const station3a = { name: "station3", lat: -45.1, lng: 172.3 };

  const expectedStation1a: ApiStationResponse = {
    id: 0,
    name: "station1",
    location: { lat: -45.1, lng: 172.1 },
    lastUpdatedById: 0,
    createdAt: null,
    activeAt: null,
    updatedAt: null,
    groupId: null,
    groupName: null,
    automatic: false,
  };
  const expectedStation1b: ApiStationResponse = {
    id: 0,
    name: "station1",
    location: { lat: -45.2, lng: 172.1 },
    lastUpdatedById: 0,
    createdAt: null,
    activeAt: null,
    updatedAt: null,
    groupId: null,
    groupName: null,
    automatic: false,
  };
  const expectedStation2a: ApiStationResponse = {
    id: 0,
    name: "station2",
    location: { lat: -45.1, lng: 172.2 },
    lastUpdatedById: 0,
    createdAt: null,
    activeAt: null,
    updatedAt: null,
    groupId: null,
    groupName: null,
    automatic: false,
  };
  const expectedStation2b: ApiStationResponse = {
    id: 0,
    name: "station2",
    location: { lat: -45.2, lng: 172.2 },
    lastUpdatedById: 0,
    createdAt: null,
    activeAt: null,
    updatedAt: null,
    groupId: null,
    groupName: null,
    automatic: false,
  };
  const expectedStation3a: ApiStationResponse = {
    id: 0,
    name: "station3",
    location: { lat: -45.1, lng: 172.3 },
    lastUpdatedById: 0,
    createdAt: null,
    activeAt: null,
    updatedAt: null,
    groupId: null,
    groupName: null,
    automatic: false,
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

    // test users
    cy.apiUserAdd("gsTestUser");
  });

  it.skip("Group admin can add, update, retire and query stations from a group", () => {
    cy.apiGroupAdd("gsGroupAdmin", "gsGroupA");
    cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupA", [station1a]).then(
      () => {
        expectedStation1a["groupId"] = getCreds("gsGroupA").id;
        expectedStation1a["groupName"] = getTestName("gsGroupA");
        delete expectedStation1a["retiredAt"];
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
        expectedStation1b["groupId"] = getCreds("gsGroupA").id;
        expectedStation1b["groupName"] = getTestName("gsGroupA");
        delete expectedStation1b["retiredAt"];
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
      expectedStation1b["groupId"] = getCreds("gsGroupA").id;
      expectedStation1b["groupName"] = getTestName("gsGroupA");
      expectedStation1b["retiredAt"] = NOT_NULL_STRING;
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
        expectedStation1a["groupId"] = getCreds("gsGroup").id;
        expectedStation1a["groupName"] = getTestName("gsGroup");
        delete expectedStation1a["retiredAt"];
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
        expectedStation1a["groupId"] = getCreds("gsGroup").id;
        expectedStation1a["groupName"] = getTestName("gsGroup");
        delete expectedStation1a["retiredAt"];
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
      expectedStation1a["groupId"] = getCreds("gsGroupD").id;
      expectedStation1a["groupName"] = getTestName("gsGroupD");
      delete expectedStation1a["retiredAt"];
      expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2a["groupId"] = getCreds("gsGroupD").id;
      expectedStation2a["groupName"] = getTestName("gsGroupD");
      delete expectedStation2a["retiredAt"];
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
      expectedStation1b["groupId"] = getCreds("gsGroupD").id;
      expectedStation1b["groupName"] = getTestName("gsGroupD");
      delete expectedStation1b["retiredAt"];
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["groupId"] = getCreds("gsGroupD").id;
      expectedStation2b["groupName"] = getTestName("gsGroupD");
      delete expectedStation2b["retiredAt"];
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
      expectedStation1b["groupId"] = getCreds("gsGroupD").id;
      expectedStation1b["groupName"] = getTestName("gsGroupD");
      expectedStation1b["retiredAt"] = NOT_NULL_STRING;
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["groupId"] = getCreds("gsGroupD").id;
      expectedStation2b["groupName"] = getTestName("gsGroupD");
      expectedStation2b["retiredAt"] = NOT_NULL_STRING;
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
      expectedStation1b["groupId"] = getCreds("gsGroupE").id;
      expectedStation1b["groupName"] = getTestName("gsGroupE");
      delete expectedStation1b["retiredAt"];
      expectedStation1b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;
      expectedStation2b["groupId"] = getCreds("gsGroupE").id;
      expectedStation2b["groupName"] = getTestName("gsGroupE");
      delete expectedStation2b["retiredAt"];
      expectedStation2b["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

      //stations updated and added
      cy.apiGroupsStationsCheck(
        "gsGroupAdmin",
        "gsGroupE",
        [expectedStation1b, expectedStation2b],
        EXCLUDE_CREATED_UPDATED_ID
      );
    });
  });

  it("Invalid group handled correctly", () => {
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "ThisGroupDoesNotExist",
      [station3a],
      undefined,
      HTTP_Forbidden
    );
    cy.apiGroupsStationsCheck(
      "gsGroupAdmin",
      "ThisGroupDoesNotExist",
      [],
      undefined,
      HTTP_Forbidden
    );
  });

  it("Invalid stations parameters handled correctly", () => {
    let badStation: any = { name: "hello", lat: null, lng: 172 };
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
    cy.apiGroupStationsUpdate(
      "gsGroupAdmin",
      "gsGroup",
      [badStation],
      undefined,
      HTTP_Unprocessable
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
    ]).then((updatedIds) => {
      cy.log("retire station");
      cy.testRetireStation("gsGroupAdmin", updatedIds[1]);
      cy.log("Re-add new station");
      cy.apiGroupStationsUpdate("gsGroupAdmin", "gsGroupF", [
        station1a,
        station2a,
      ]).then(() => {
        expectedStation1a["groupId"] = getCreds("gsGroupF").id;
        expectedStation1a["groupName"] = getTestName("gsGroupF");
        delete expectedStation1a["retiredAt"];
        expectedStation1a["lastUpdatedById"] = getCreds("gsGroupAdmin").id;

        const original = {
          ...expectedStation2a,
          groupId: getCreds("gsGroupF").id,
          groupName: getTestName("gsGroupF"),
          lastUpdatedById: getCreds("gsGroupAdmin").id,
        };
        const retired = {
          ...original,
          retiredAt: NOT_NULL_STRING,
        };

        //check both retired and new station shows
        cy.apiGroupsStationsCheck(
          "gsGroupAdmin",
          "gsGroupF",
          [expectedStation1a, retired, original],
          EXCLUDE_CREATED_UPDATED_ID
        );
      });
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
