/// <reference path="../../../support/index.d.ts" />

import { EventTypes } from "@commands/api/events";
import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { ApiEventReturned } from "@commands/types";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("Events - query events", () => {
  const EXCL_TIME_ID = ["[].createdAt", "[].id"]; // Do not verify event's id or createdAt values

  const time1 = "2018-01-01T07:22:56.000Z";
  const time2 = "2018-01-02T07:22:56.000Z";
  const time3 = "2018-01-03T07:22:56.000Z";
  const time4 = "2018-01-04T07:22:56.000Z";
  const eventDetails1 = { type: EventTypes.POWERED_ON, details: {} };
  const eventDetails2 = {
    type: "audioBait",
    details: { fileId: 8, volume: 10 },
  };
  const eventDetails3 = {
    type: "alert",
    details: { recId: 1, alertId: 2, success: true, trackId: 1 },
  };
  const eventDetails4 = {
    type: "alert",
    details: { recId: 2, alertId: 3, success: true, trackId: 4 },
  };
  let expectedEvent1: ApiEventReturned;
  let expectedEvent2: ApiEventReturned;
  let expectedEvent3: ApiEventReturned;
  //  let expectedEvent4: ApiEventReturned;

  before(() => {
    // group with 2 devices, admin and member users
    cy.testCreateUserGroupAndDevice("eqGroupAdmin", "eqGroup", "eqCamera");
    cy.apiUserAdd("eqGroupMember");
    cy.apiGroupUserAdd("eqGroupAdmin", "eqGroupMember", "eqGroup", false);
    cy.apiDeviceAdd("eqOtherCamera", "eqGroup");

    //another group and device
    cy.testCreateUserGroupAndDevice(
      "eqOtherGroupAdmin",
      "eqOtherGroup",
      "eqOtherGroupCamera"
    );

    //Create some events to reuse / query
    cy.apiEventsDeviceAddOnBehalf("eqGroupAdmin", "eqCamera", eventDetails1, [
      time1,
    ]);
    cy.apiEventsDeviceAddOnBehalf("eqGroupAdmin", "eqCamera", eventDetails2, [
      time2,
    ]);
    cy.apiEventsDeviceAddOnBehalf(
      "eqGroupAdmin",
      "eqOtherCamera",
      eventDetails3,
      [time3]
    );
    cy.apiEventsDeviceAddOnBehalf(
      "eqOtherGroupAdmin",
      "eqOtherGroupCamera",
      eventDetails4,
      [time4]
    );
  });

  before(() => {
    expectedEvent1 = {
      id: null,
      createdAt: null,
      dateTime: time1,
      DeviceId: getCreds("eqCamera").id,
      Device: { devicename: getTestName("eqCamera") },
      EventDetail: eventDetails1,
    };
    expectedEvent2 = {
      id: null,
      createdAt: null,
      dateTime: time2,
      DeviceId: getCreds("eqCamera").id,
      Device: { devicename: getTestName("eqCamera") },
      EventDetail: eventDetails2,
    };
    expectedEvent3 = {
      id: null,
      createdAt: null,
      dateTime: time3,
      DeviceId: getCreds("eqOtherCamera").id,
      Device: { devicename: getTestName("eqOtherCamera") },
      EventDetail: eventDetails3,
    };
    //   expectedEvent4 = {
    //     id: null,
    //     createdAt: null,
    //     dateTime: time4,
    //     DeviceId: getCreds("eqOtherGroupCamera").id,
    //     Device: { devicename: getTestName("eqOtherGroupCamera") },
    //     EventDetail: eventDetails4,
    //   };
  });

  it("Group admin can view all events on all devices their group", () => {
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      {},
      [expectedEvent1, expectedEvent2, expectedEvent3],
      EXCL_TIME_ID
    );
  });

  it("Group member can view all events on all devices their group", () => {
    cy.apiEventsCheck(
      "eqGroupMember",
      undefined,
      {},
      [expectedEvent1, expectedEvent2, expectedEvent3],
      EXCL_TIME_ID
    );
  });

  it("Group admin can only request events from within their group", () => {
    cy.apiEventsCheck(
      "eqGroupAdmin",
      "eqCamera",
      {},
      [expectedEvent1, expectedEvent2],
      EXCL_TIME_ID
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      "eqOtherCamera",
      {},
      [expectedEvent3],
      EXCL_TIME_ID
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      "eqOtherGroupCamera",
      {},
      [],
      EXCL_TIME_ID,
      HttpStatusCode.Forbidden
    );
  });

  it("Verify time filtering works correctly", () => {
    cy.log("start time only (= included)");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: time2 },
      [expectedEvent2, expectedEvent3],
      EXCL_TIME_ID
    );
    cy.log("start time only (> included)");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: "2018-01-02T07:22:55.000Z" },
      [expectedEvent2, expectedEvent3],
      EXCL_TIME_ID
    );

    cy.log("end time only (= not included)");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { endTime: time2 },
      [expectedEvent1],
      EXCL_TIME_ID
    );
    cy.log("end time only (< included)");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { endTime: "2018-01-02T07:22:57.000Z" },
      [expectedEvent1, expectedEvent2],
      EXCL_TIME_ID
    );

    cy.log("Time range start<=time<end");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: time2, endTime: time3 },
      [expectedEvent2],
      EXCL_TIME_ID
    );

    cy.log("Time range start=end returns empty as must be < end");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: time2, endTime: time2 },
      []
    );
  });

  it("Verify incoreect time values handled correctly", () => {
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: "" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { endTime: "" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: "not a timestamp" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { endTime: "not a timestamp" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.log("Time range start>end returns empty");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { startTime: time2, endTime: time1 },
      []
    );
  });

  it("Verify limit and offset paging works correctly", () => {
    cy.log("just specifying limit returns 1st page of specified length");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 2 },
      [expectedEvent1, expectedEvent2],
      EXCL_TIME_ID,
      null,
      { count: 3 }
    );

    cy.log("Offset of 0 with limit returns 1st page of specified length");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 2, offset: 0 },
      [expectedEvent1, expectedEvent2],
      EXCL_TIME_ID,
      null,
      { offset: 0, count: 3 }
    );

    cy.log("Offset = limit returns 2nd page");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 2, offset: 2 },
      [expectedEvent3],
      EXCL_TIME_ID,
      null,
      { offset: 2, count: 3 }
    );

    cy.log("offset beyond end of data returns empty");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 2, offset: 4 },
      [],
      [],
      null,
      { offset: 4, count: 3 }
    );

    cy.log("Arbitrary offset unrelated to page length works");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 2, offset: 1 },
      [expectedEvent2, expectedEvent3],
      EXCL_TIME_ID,
      null,
      { offset: 1 }
    );

    cy.log("test using a different limit");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: 0 },
      [expectedEvent1],
      EXCL_TIME_ID,
      null,
      { offset: 0, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: 1 },
      [expectedEvent2],
      EXCL_TIME_ID,
      null,
      { offset: 1, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: 2 },
      [expectedEvent3],
      EXCL_TIME_ID,
      null,
      { offset: 2, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: 3 },
      [],
      [],
      null,
      { offset: 3, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: 999999 },
      [],
      [],
      null,
      { offset: 999999, count: 3 }
    );
  });

  it("Verify bad values for limit and offset handled correctly", () => {
    cy.log("Invalid limits");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: "" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: "a" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    //TODO Following test fails.  Issue 68
    // cy.apiEventsCheck("eqGroupAdmin",undefined,{limit: -1}, [],[],HTTP_Unprocessable);

    cy.log("Invalid offsets");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: "" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 1, offset: "a" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    //TODO Following test fails.  Issue 68
    //cy.apiEventsCheck("eqGroupAdmin",undefined,{limit: 1, offset: -1}, [],[],HTTP_Unprocessable);

    cy.log("0 treated as default");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 0, offset: 0 },
      [expectedEvent1, expectedEvent2, expectedEvent3],
      EXCL_TIME_ID
    );
    cy.log("big values accepted");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { limit: 9999999 },
      [expectedEvent1, expectedEvent2, expectedEvent3],
      EXCL_TIME_ID
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { offset: 9999999 },
      [],
      [],
      null,
      { offset: 9999999 }
    );
    //TODO: A test for default would be good ... but too time consuming for here.  Add to performance tests?
  });

  it("Verify type filtering works correctly", () => {
    cy.log("Test matched case");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { type: "audioBait" },
      [expectedEvent2],
      EXCL_TIME_ID
    );
    cy.log("Test match is case sensitive");
    cy.apiEventsCheck("eqGroupAdmin", undefined, { type: "audiobait" }, []);
    cy.log("Test no match returns empty array");
    cy.apiEventsCheck("eqGroupAdmin", undefined, { type: "abcd" }, []);
    cy.log("Test can include '-' in filter");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { type: "rpi-power-on" },
      [expectedEvent1],
      EXCL_TIME_ID
    );
    cy.log("Test blank filter rejected");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { type: "" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.log("Test cannot inject 'LIKE'-type searches");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { type: "a%" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { type: "a*" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
  });

  it("Can request increasing or reverse order of events", () => {
    cy.log("Reverse order, unpaged");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true },
      [expectedEvent3, expectedEvent2, expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );

    cy.log("reverse order, paged");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true, limit: 2, offset: 0 },
      [expectedEvent3, expectedEvent2],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true, offset: 0, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true, limit: 2, offset: 1 },
      [expectedEvent2, expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true, offset: 1, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true, limit: 2, offset: 2 },
      [expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true, offset: 2, count: 3 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true, limit: 2, offset: 3 },
      [],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true, offset: 3, count: 3 }
    );

    cy.log("Time filtering and reverse order work together");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true, startTime: time1, endTime: time3 },
      [expectedEvent2, expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: true, startTime: time2, endTime: time3 },
      [expectedEvent2],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );

    cy.log("Can manually specify increasing order (default)");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { latest: false },
      [expectedEvent1, expectedEvent2, expectedEvent3],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );

    cy.log("Default is increasing order");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      {},
      [expectedEvent1, expectedEvent2, expectedEvent3],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );
  });

  it("Can combine all filter types", () => {
    cy.log("reverse paging filtered by start & end time");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      {
        limit: 1,
        offset: 0,
        latest: true,
        startTime: time1,
        endTime: time3,
        deviceId: getCreds("eqCamera").id,
      },
      [expectedEvent2],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true, count: 2 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      {
        limit: 1,
        offset: 1,
        latest: true,
        startTime: time1,
        endTime: time3,
        deviceId: getCreds("eqCamera").id,
      },
      [expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true, offset: 1, count: 2 }
    );
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      {
        limit: 4,
        offset: 0,
        latest: true,
        startTime: time1,
        endTime: time4,
        deviceId: getCreds("eqCamera").id,
      },
      [expectedEvent2, expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );
    cy.log("reverse paging filtered by type and device");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      {
        limit: 4,
        offset: 0,
        latest: true,
        startTime: time1,
        endTime: time4,
        type: "rpi-power-on",
        deviceId: getCreds("eqCamera").id,
      },
      [expectedEvent1],
      EXCL_TIME_ID,
      HttpStatusCode.Ok,
      { doNotSort: true }
    );
  });

  it("Handles invalid devices correctly", () => {
    cy.log("Test for non existent device");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { deviceId: 999999 },
      [],
      [],
      HttpStatusCode.Forbidden
    );
    cy.log("Bad value for device id");
    cy.apiEventsCheck(
      "eqGroupAdmin",
      undefined,
      { deviceId: "bad value" },
      [],
      [],
      HttpStatusCode.Unprocessable
    );
  });

  // retuned data structure tests
});
