import { EventTypes } from "@commands/api/events";
import { getTestName } from "@commands/names";
import {
  getCreds,
  makeAuthorizedRequestWithStatus,
  v1ApiPath,
} from "@commands/server";
import { HttpStatusCode } from "@typedefs/api/consts";
import { uploadFile } from "@commands/fileUpload";
import { EventId } from "@typedefs/api/common";

const EXCL_ID_CREATED = ["[].id", "[].createdAt"]; //do not check eventId or createdAt time

describe("Events - add event as a device", () => {
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
    cy.testCreateUserGroupAndDevice("evGroupAdmin", "evGroup", "evCamera");
    cy.testCreateUserGroupAndDevice("evGroupAdmin2", "evGroup2", "evCamera2");
    cy.testCreateUserGroupAndDevice("evGroupAdmin8", "evGroup8", "evCamera8");

    //Create some events to reuse / query
    cy.apiEventsAdd("evCamera", eventDetails1, [time1]).then(
      (response: number) => {
        eventDetailsId1 = response;
      }
    );
    cy.apiEventsAdd("evCamera", eventDetails2, [time2]).then(
      (response: number) => {
        eventDetailsId2 = response;
      }
    );
  });

  it("Can add a new event specifying description", () => {
    // add the event
    const timeNow = new Date().toISOString();
    const eventDetails1c = { type: "newType", details: { message: "hello" } };
    cy.apiEventsAdd("evCamera2", eventDetails1c, [timeNow]);

    // check that it's there
    const expectedEvent1c = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera2").id,
      dateTime: timeNow,
      Device: { deviceName: getTestName("evCamera2") },
      EventDetail: eventDetails1c,
      env: "unknown",
    };
    cy.apiEventsCheck(
      "evGroupAdmin2",
      "evCamera2",
      {},
      [expectedEvent1c],
      EXCL_ID_CREATED
    );
  });

  it("Can reuse eventDetails by either specifying a duplicate description or specifying the eventDetailsId", () => {
    const time3 = "2018-01-03T07:22:56.000Z";
    const time4 = "2018-01-04T07:22:56.000Z";

    cy.log(
      "check we can resue same eventDetailsIds from past event by specifying same description"
    );
    cy.apiEventsAdd("evCamera", eventDetails2, [time3]).then(
      (response: number) => {
        expect(
          response,
          `event details ID should match previous identical event ${eventDetailsId2}`
        ).to.equal(eventDetailsId2);
      }
    );

    cy.log(
      "check we can resue same eventDetailsIds by specifying eventDetailsId"
    );
    cy.apiEventsAdd("evCamera", undefined, [time4], eventDetailsId1).then(
      (response: number) => {
        expect(
          response,
          `event details ID should match previous identical event ${eventDetailsId1}`
        ).to.equal(eventDetailsId1);
      }
    );

    cy.log("check all events are listed");
    const expectedEvent7a = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera").id,
      dateTime: time1,
      Device: { deviceName: getTestName("evCamera") },
      EventDetail: eventDetails1,
      env: "unknown",
    };
    const expectedEvent7b = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera").id,
      dateTime: time2,
      Device: { deviceName: getTestName("evCamera") },
      EventDetail: eventDetails2,
      env: "unknown",
    };
    const expectedEvent7c = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera").id,
      dateTime: time3,
      Device: { deviceName: getTestName("evCamera") },
      EventDetail: eventDetails2,
      env: "unknown",
    };
    const expectedEvent7d = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera").id,
      dateTime: time4,
      Device: { deviceName: getTestName("evCamera") },
      EventDetail: eventDetails1,
      env: "unknown",
    };
    cy.apiEventsCheck(
      "evGroupAdmin",
      "evCamera",
      {},
      [expectedEvent7a, expectedEvent7b, expectedEvent7c, expectedEvent7d],
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
    cy.apiEventsAdd("evCamera8", eventDetail, [time11, time12, time13, time14]);

    const expectedEvent8a = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera8").id,
      dateTime: time11,
      Device: { deviceName: getTestName("evCamera8") },
      EventDetail: eventDetail,
      env: "unknown",
    };
    const expectedEvent8b = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera8").id,
      dateTime: time12,
      Device: { deviceName: getTestName("evCamera8") },
      EventDetail: eventDetail,
      env: "unknown",
    };
    const expectedEvent8c = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera8").id,
      dateTime: time13,
      Device: { deviceName: getTestName("evCamera8") },
      EventDetail: eventDetail,
      env: "unknown",
    };
    const expectedEvent8d = {
      id: null,
      createdAt: null,
      DeviceId: getCreds("evCamera8").id,
      dateTime: time14,
      Device: { deviceName: getTestName("evCamera8") },
      EventDetail: eventDetail,
      env: "unknown",
    };

    cy.apiEventsCheck(
      "evGroupAdmin8",
      "evCamera8",
      {},
      [expectedEvent8a, expectedEvent8b, expectedEvent8c, expectedEvent8d],
      EXCL_ID_CREATED
    );
  });

  it("Cannot add an event with neither detailsId nor description", () => {
    cy.apiEventsAdd(
      "evCamera",
      undefined,
      [time1],
      undefined,
      true,
      HttpStatusCode.Unprocessable
    );
  });

  it("Correct handling of missing/invalid mandatory details sub-parameters", () => {
    cy.log("empty description");
    cy.apiEventsAdd(
      "evCamera",
      {},
      [time1],
      undefined,
      true,
      HttpStatusCode.Unprocessable
    );
    cy.log("description missing type");
    cy.apiEventsAdd(
      "evCamera",
      { details: { info: "hello" } },
      [time1],
      undefined,
      true,
      HttpStatusCode.Unprocessable
    );
  });

  it("Correct handling of missing/invalid eventDetailId", () => {
    cy.log("eventDetailsId=null (blank)");
    cy.apiEventsAdd(
      "evCamera",
      undefined,
      [time1],
      null,
      true,
      HttpStatusCode.Unprocessable
    );
    cy.log("eventDetailsId=non-existent event detail record");
    cy.apiEventsAdd(
      "evCamera",
      undefined,
      [time1],
      9999999,
      true,
      HttpStatusCode.Forbidden
    );
  });

  it("Correct handling of invalid dateTimes", () => {
    cy.log("no time");
    cy.apiEventsAdd(
      "evCamera",
      eventDetails1,
      [],
      null,
      true,
      HttpStatusCode.Unprocessable
    );
    cy.log("blank time");
    cy.apiEventsAdd(
      "evCamera",
      eventDetails1,
      [""],
      null,
      true,
      HttpStatusCode.Unprocessable
    );
    cy.log("invalid time");
    cy.apiEventsAdd(
      "evCamera",
      eventDetails1,
      ["bad time"],
      null,
      true,
      HttpStatusCode.Unprocessable
    );
    cy.log("list containing invaid time");
    cy.apiEventsAdd(
      "evCamera",
      eventDetails1,
      [time1, time2, "bad time"],
      null,
      true,
      HttpStatusCode.Unprocessable
    );
  });

  it("Add and retrieve a thumbnail event", () => {
    const data: {
      type: string;
      what: string;
      conf: number;
      dateTimes?: string[];
    } = {
      type: "classifier",
      what: "possum",
      conf: 99,
      dateTimes: [new Date().toISOString()],
    };
    uploadFile(
      v1ApiPath(`events/thumbnail`),
      "evCamera2",
      "thumb.png",
      data.type,
      data,
      "@addEventThumbnail",
      HttpStatusCode.Ok
    ).then((p) => {
      const x = p as unknown as { id: EventId };
      // Now make sure we can access the event thumbnail:
      const eventId = x.id;
      makeAuthorizedRequestWithStatus(
        {
          method: "GET",
          url: v1ApiPath(`events/${eventId}/thumbnail`),
        },
        "evGroupAdmin2",
        HttpStatusCode.Ok
      );
      makeAuthorizedRequestWithStatus(
        {
          method: "GET",
          url: v1ApiPath(`events/${eventId}`),
        },
        "evGroupAdmin2",
        HttpStatusCode.Ok
      ).then((response) => {
        cy.log(response.body);
      });
    });
  });
});
