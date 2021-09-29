/// <reference path="../../../support/index.d.ts" />

import { EventTypes } from "@commands/api/events";
import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";

import { HTTP_Forbidden, HTTP_Unprocessable } from "@commands/constants";

const EXCL_ID_CREATED = ["[].id", "[].createdAt"]; // do not check claues of event id or createdAt time

describe("Events - add event on behalf of device", () => {
  const firstTime = new Date().toISOString();
  let eventDetailsId1: number;
  let eventDetailsId2: number;
  const time1 = "2018-01-01T07:22:56.000Z";
  const time2 = "2018-01-02T07:22:56.000Z";
  const eventDetails1 = { type: EventTypes.POWERED_ON, details: {} };
  const eventDetails2 = {
    type: "audioBait",
    details: { fileId: 8, volume: 10 },
  };

  before(() => {
    cy.testCreateUserGroupAndDevice("groupAdmin", "group", "camera");
    cy.testCreateUserGroupAndDevice("groupAdmin1", "group1", "camera1");
    cy.testCreateUserGroupAndDevice("groupAdmin2", "group2", "camera2");
    cy.testCreateUserGroupAndDevice("groupAdmin3", "group3", "camera3");
    cy.testCreateUserGroupAndDevice("groupAdmin4", "group4", "camera4");
    cy.testCreateUserGroupAndDevice("groupAdmin8", "group8", "camera8");
    cy.testCreateUserGroupAndDevice("groupAdmin9", "group9", "camera9");
    cy.apiDeviceAdd("otherCamera", "group");
    cy.apiUserAdd("deviceAdmin");
    cy.apiDeviceUserAdd("groupAdmin", "deviceAdmin", "camera", true);
    cy.testCreateUserGroupAndDevice(
      "otherGroupAdmin",
      "otherGroup",
      "otherGroupCamera"
    );

    //Create some events to reuse / query
    cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, [
      time1,
    ]).then((response: number) => {
      eventDetailsId1 = response;
    });
    cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails2, [
      time2,
    ]).then((response: number) => {
      eventDetailsId2 = response;
    });
  });

  it("Group admin can add event on behalf of device", () => {
    const expectedEvent1 = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera1").id,
      dateTime: firstTime,
      Device: { devicename: getTestName("camera1") },
      EventDetail: { type: EventTypes.POWERED_ON, details: {} },
    };

    // add and verify events
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin1",
      "camera1",
      { type: EventTypes.POWERED_ON, details: {} },
      [firstTime]
    );
    cy.apiEventsCheck(
      "groupAdmin1",
      "camera1",
      {},
      [expectedEvent1],
      EXCL_ID_CREATED
    );
  });

  it("Group member can add event on behalf of device", () => {
    cy.apiUserAdd("groupMember2");
    const expectedEvent2 = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera2").id,
      dateTime: firstTime,
      Device: { devicename: getTestName("camera2") },
      EventDetail: { type: EventTypes.POWERED_ON, details: {} },
    };
    cy.apiGroupUserAdd("groupAdmin2", "groupMember2", "group2", false);

    // add and verify events
    cy.apiEventsDeviceAddOnBehalf(
      "groupMember2",
      "camera2",
      { type: EventTypes.POWERED_ON, details: {} },
      [firstTime]
    );
    cy.apiEventsCheck(
      "groupMember2",
      "camera2",
      {},
      [expectedEvent2],
      EXCL_ID_CREATED
    );
  });

  it("Device admin can add event on behalf of device", () => {
    cy.apiUserAdd("deviceAdmin3");
    cy.apiDeviceUserAdd("groupAdmin3", "deviceAdmin3", "camera3", true);
    const expectedEvent3 = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera3").id,
      dateTime: firstTime,
      Device: { devicename: getTestName("camera3") },
      EventDetail: { type: EventTypes.POWERED_ON, details: {} },
    };

    // add and verify events
    cy.apiEventsDeviceAddOnBehalf(
      "deviceAdmin3",
      "camera3",
      { type: EventTypes.POWERED_ON, details: {} },
      [firstTime]
    );
    cy.apiEventsCheck(
      "deviceAdmin3",
      "camera3",
      {},
      [expectedEvent3],
      EXCL_ID_CREATED
    );
  });

  it("Device member can add event on behalf of device", () => {
    cy.apiUserAdd("deviceMember4");
    cy.apiDeviceUserAdd("groupAdmin4", "deviceMember4", "camera4", true);
    const expectedEvent4 = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera4").id,
      dateTime: firstTime,
      Device: { devicename: getTestName("camera4") },
      EventDetail: { type: EventTypes.POWERED_ON, details: {} },
    };

    // add and verify events
    cy.apiEventsDeviceAddOnBehalf(
      "deviceMember4",
      "camera4",
      { type: EventTypes.POWERED_ON, details: {} },
      [firstTime]
    );
    cy.apiEventsCheck(
      "deviceMember4",
      "camera4",
      {},
      [expectedEvent4],
      EXCL_ID_CREATED
    );
  });

  it("Group admin cannot add event for a device in another group", () => {
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "otherGroupCamera",
      { type: EventTypes.POWERED_ON, details: {} },
      [firstTime],
      undefined,
      true,
      HTTP_Forbidden
    );
  });

  it("Device admin cannot add event for another device in group", () => {
    cy.apiEventsDeviceAddOnBehalf(
      "deviceAdmin",
      "otherCamera",
      { type: EventTypes.POWERED_ON, details: {} },
      [firstTime],
      undefined,
      true,
      HTTP_Forbidden
    );
  });

  it("Can reuse eventDetails by either specifying a duplicate description or specifying the eventDetailsId", () => {
    const time3 = "2018-01-03T07:22:56.000Z";
    const time4 = "2018-01-04T07:22:56.000Z";
    const time5 = "2018-01-05T07:22:56.000Z";
    const time6 = "2018-01-06T07:22:56.000Z";

    cy.log(
      "check we can resue same eventDetailsIds by specifying same description"
    );
    cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, [
      time3,
    ]).then((response: number) => {
      expect(
        response,
        `event details ID should match previous identical event ${eventDetailsId1}`
      ).to.equal(eventDetailsId1);
    });
    cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails2, [
      time4,
    ]).then((response: number) => {
      expect(
        response,
        `event details ID should match previous identical event ${eventDetailsId2}`
      ).to.equal(eventDetailsId2);
    });

    cy.log(
      "check we can resue same eventDetailsIds by specifying eventDetailsId"
    );
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      undefined,
      [time5],
      eventDetailsId1
    ).then((response: number) => {
      expect(
        response,
        `event details ID should match previous identical event ${eventDetailsId1}`
      ).to.equal(eventDetailsId1);
    });
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      undefined,
      [time6],
      eventDetailsId2
    ).then((response: number) => {
      expect(
        response,
        `event details ID should match previous identical event ${eventDetailsId2}`
      ).to.equal(eventDetailsId2);
    });

    cy.log("check all events are listed");
    const expectedEvent7a = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera").id,
      dateTime: time1,
      Device: { devicename: getTestName("camera") },
      EventDetail: eventDetails1,
    };
    const expectedEvent7b = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera").id,
      dateTime: time2,
      Device: { devicename: getTestName("camera") },
      EventDetail: eventDetails2,
    };
    const expectedEvent7c = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera").id,
      dateTime: time3,
      Device: { devicename: getTestName("camera") },
      EventDetail: eventDetails1,
    };
    const expectedEvent7d = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera").id,
      dateTime: time4,
      Device: { devicename: getTestName("camera") },
      EventDetail: eventDetails2,
    };
    const expectedEvent7e = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera").id,
      dateTime: time5,
      Device: { devicename: getTestName("camera") },
      EventDetail: eventDetails1,
    };
    const expectedEvent7f = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera").id,
      dateTime: time6,
      Device: { devicename: getTestName("camera") },
      EventDetail: eventDetails2,
    };
    cy.apiEventsCheck(
      "groupAdmin",
      "camera",
      {},
      [
        expectedEvent7a,
        expectedEvent7b,
        expectedEvent7c,
        expectedEvent7d,
        expectedEvent7e,
        expectedEvent7f,
      ],
      EXCL_ID_CREATED
    );
  });

  it("Can add multiple occurrences of an event", () => {
    const time11 = "2019-01-01T07:22:56.000Z";
    const time12 = "2019-01-02T07:22:56.000Z";
    const time13 = "2019-01-03T07:22:56.000Z";
    const time14 = "2019-01-04T07:22:56.000Z";

    const eventDetail = {
      type: "alert",
      details: { recId: 1, alertId: 2, success: true, trackId: 3 },
    };
    cy.apiEventsDeviceAddOnBehalf("groupAdmin8", "camera8", eventDetail, [
      time11,
      time12,
      time13,
      time14,
    ]);

    const expectedEvent8a = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera8").id,
      dateTime: time11,
      Device: { devicename: getTestName("camera8") },
      EventDetail: eventDetail,
    };
    const expectedEvent8b = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera8").id,
      dateTime: time12,
      Device: { devicename: getTestName("camera8") },
      EventDetail: eventDetail,
    };
    const expectedEvent8c = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera8").id,
      dateTime: time13,
      Device: { devicename: getTestName("camera8") },
      EventDetail: eventDetail,
    };
    const expectedEvent8d = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera8").id,
      dateTime: time14,
      Device: { devicename: getTestName("camera8") },
      EventDetail: eventDetail,
    };

    cy.apiEventsCheck(
      "groupAdmin8",
      "camera8",
      {},
      [expectedEvent8a, expectedEvent8b, expectedEvent8c, expectedEvent8d],
      EXCL_ID_CREATED
    );
  });

  it("Cannot add an event with neither detailsId nor description", () => {
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      undefined,
      [time1],
      undefined,
      true,
      HTTP_Unprocessable
    );
  });

  it("Correct handling of missing/invalid mandatory details sub-parameters", () => {
    cy.log("empty description");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      {},
      [time1],
      undefined,
      true,
      HTTP_Unprocessable
    );
    cy.log("description missing type");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      { details: { info: "hello" } },
      [time1],
      undefined,
      true,
      HTTP_Unprocessable
    );
  });

  it("Correct handling of missing/invalid eventDetailId", () => {
    cy.log("eventDetailsId=null");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      undefined,
      [time1],
      undefined,
      true,
      HTTP_Unprocessable
    );
    cy.log("eventDetailsId=non-existent event detail record");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      undefined,
      [time1],
      9999999,
      true,
      HTTP_Forbidden
    );
  });

  it("Correct handling of invalid or missing deviceId", () => {
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "999999",
      eventDetails1,
      [time1],
      undefined,
      true,
      HTTP_Forbidden
    );
  });

  it("Correct handling of invalid dateTimes", () => {
    cy.log("no time");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      eventDetails1,
      [],
      undefined,
      true,
      HTTP_Unprocessable
    );
    cy.log("blank time");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      eventDetails1,
      [""],
      undefined,
      true,
      HTTP_Unprocessable
    );
    cy.log("invalid time");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      eventDetails1,
      ["bad time"],
      undefined,
      true,
      HTTP_Unprocessable
    );
    cy.log("list containing invaid time");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin",
      "camera",
      eventDetails1,
      [time1, time2, "bad time"],
      undefined,
      true,
      HTTP_Unprocessable
    );
  });

  it.skip("Can upload event using devicename", () => {
    // NOTE: Deprecated, no longer works
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin9",
      getTestName("camera9"),
      eventDetails1,
      [time1]
    );

    const expectedEvent9 = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("camera9").id,
      dateTime: time1,
      Device: { devicename: getTestName("camera9") },
      EventDetail: eventDetails1,
    };

    cy.apiEventsCheck(
      "groupAdmin9",
      "camera9",
      {},
      [expectedEvent9],
      EXCL_ID_CREATED
    );
  });

  it("Cannot upload event by devicename where duplicate devicenames exist", () => {
    const timeNow = new Date().toISOString();
    cy.log("duplicate camera name");
    cy.testCreateUserGroupAndDevice("groupAdmin10", "group10", "camera");
    cy.apiEventsDeviceAddOnBehalf(
      "groupAdmin10",
      getTestName("camera"),
      eventDetails1,
      [timeNow],
      undefined,
      true,
      HTTP_Unprocessable
    );
  });
});
