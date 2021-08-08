/// <reference path="../../../support/index.d.ts" />

import { EventTypes } from "../../../commands/api/events";
import { getTestName } from "../../../commands/names";
import { getCreds } from "../../../commands/server";


const HTTP_AuthorizationError = 401;
const HTTP_Forbidden = 403;
const HTTP_BadRequest = 400;
const HTTP_Unprocessable = 422;
const HTTP_OK200 = 200;

const EXCL_ID_CREATED = ["[].id","[].createdAt"];     //do not check eventId or createdAt time

describe("Events - add event as a device", () => {
  let eventDetailsId1:number;
  let eventDetailsId2:number;
  const time1="2018-01-01T07:22:56.000Z";
  const time2="2018-01-02T07:22:56.000Z";
  const eventDetails1={type: EventTypes.POWERED_ON, details: {}};
  const eventDetails2={type: "audioBait", details: {fileId: 8, volume:10 }};

  before(() => {
      cy.apiCreateUserGroupAndDevice("evGroupAdmin", "evGroup", "evCamera");
      cy.apiCreateUserGroupAndDevice("evGroupAdmin2", "evGroup2", "evCamera2");
      cy.apiCreateUserGroupAndDevice("evGroupAdmin8", "evGroup8", "evCamera8");

      //Create some events to reuse / query
      cy.apiEventsAdd("evCamera", eventDetails1, [time1]).then((response:number) => {eventDetailsId1=response});
      cy.apiEventsAdd("evCamera", eventDetails2, [time2]).then((response:number) => {eventDetailsId2=response});
    });


  it("Can add a new event specifying description", () => {  
      // add the event
      const timeNow=(new Date()).toISOString();
      const eventDetails1c={type: "newType", details: {message: "hello"}};
      cy.apiEventsAdd("evCamera2", eventDetails1c, [timeNow]);

      // check that it's there
      const expectedEvent1c={id: null, createdAt: null, DeviceId: getCreds("evCamera2").id, dateTime: timeNow, Device: {devicename: getTestName("evCamera2")}, EventDetail: eventDetails1c};
      cy.apiEventsCheck("evGroupAdmin2","evCamera2",{}, [expectedEvent1c], EXCL_ID_CREATED);
  });

  it("Can reuse eventDetails by either specifying a duplicate description or specifying the eventDetailsId", () => {
      const time3="2018-01-03T07:22:56.000Z";
      const time4="2018-01-04T07:22:56.000Z";

      cy.log("check we can resue same eventDetailsIds from past event by specifying same description");
      cy.apiEventsAdd("evCamera", eventDetails2, [time3]).then((response:number) => {
        expect(response,`event details ID should match previous identical event ${eventDetailsId2}`).to.equal(eventDetailsId2);
      });

      cy.log("check we can resue same eventDetailsIds by specifying eventDetailsId");
      cy.apiEventsAdd("evCamera", undefined, [time4], eventDetailsId1).then((response:number) => {
        expect(response,`event details ID should match previous identical event ${eventDetailsId1}`).to.equal(eventDetailsId1);
      });

      cy.log("check all events are listed");
      const expectedEvent7a={id: null, createdAt: null, DeviceId: getCreds("evCamera").id, dateTime: time1, Device: {devicename: getTestName("evCamera")}, EventDetail: eventDetails1}; 
      const expectedEvent7b={id: null, createdAt: null, DeviceId: getCreds("evCamera").id, dateTime: time2, Device: {devicename: getTestName("evCamera")}, EventDetail: eventDetails2};
      const expectedEvent7c={id: null, createdAt: null, DeviceId: getCreds("evCamera").id, dateTime: time3, Device: {devicename: getTestName("evCamera")}, EventDetail: eventDetails2}; 
      const expectedEvent7d={id: null, createdAt: null, DeviceId: getCreds("evCamera").id, dateTime: time4, Device: {devicename: getTestName("evCamera")}, EventDetail: eventDetails1};
      cy.apiEventsCheck("evGroupAdmin","evCamera",{}, [expectedEvent7a, expectedEvent7b, expectedEvent7c, expectedEvent7d],EXCL_ID_CREATED);
  });

  it("Can add multiple occurrences of an event", () => {

    let time11="2019-01-01T07:22:56.000Z"
    let time12="2019-01-02T07:22:56.000Z"
    let time13="2019-01-03T07:22:56.000Z"
    let time14="2019-01-04T07:22:56.000Z"

    const eventDetail={type: "alert", details: {recId: 1, alertId: 2, success: true, trackId: 3}};
    cy.apiEventsAdd("evCamera8", eventDetail, [time11, time12, time13, time14]);

    const expectedEvent8a={id: null, createdAt: null, DeviceId: getCreds("evCamera8").id, dateTime: time11, Device: {devicename: getTestName("evCamera8")}, EventDetail: eventDetail};
    const expectedEvent8b={id: null, createdAt: null, DeviceId: getCreds("evCamera8").id, dateTime: time12, Device: {devicename: getTestName("evCamera8")}, EventDetail: eventDetail};
    const expectedEvent8c={id: null, createdAt: null, DeviceId: getCreds("evCamera8").id, dateTime: time13, Device: {devicename: getTestName("evCamera8")}, EventDetail: eventDetail};
    const expectedEvent8d={id: null, createdAt: null, DeviceId: getCreds("evCamera8").id, dateTime: time14, Device: {devicename: getTestName("evCamera8")}, EventDetail: eventDetail};

    cy.apiEventsCheck("evGroupAdmin8","evCamera8",{}, [expectedEvent8a, expectedEvent8b, expectedEvent8c, expectedEvent8d],EXCL_ID_CREATED);
  });

  it("Cannot add an event with neither detailsId nor description", () => {
     cy.apiEventsAdd("evCamera", undefined, [time1],undefined,true,HTTP_Unprocessable);
  });

  it("Correct handling of missing/invalid mandatory details sub-parameters", () => {
     cy.log("empty description");
     cy.apiEventsAdd("evCamera", {}, [time1],undefined,true,HTTP_Unprocessable);
     cy.log("description missing type");
     cy.apiEventsAdd("evCamera", {details:{info: "hello"}}, [time1],undefined,true,HTTP_Unprocessable);
  });

  it("Correct handling of missing/invalid eventDetailId", () => {
     cy.log("eventDetailsId=null (blank)");
     cy.apiEventsAdd("evCamera", undefined, [time1],null,true,HTTP_Unprocessable);
     cy.log("eventDetailsId=non-existent event detail record");
     cy.apiEventsAdd("evCamera", undefined, [time1],9999999,true,HTTP_Unprocessable);
  });

  it("Correct handling of invalid dateTimes", () => {
     cy.log("no time");
     cy.apiEventsAdd("evCamera", eventDetails1, [],null,true,HTTP_Unprocessable);
     cy.log("blank time");
     cy.apiEventsAdd("evCamera", eventDetails1, [""],null,true,HTTP_Unprocessable);
     cy.log("invalid time");
     cy.apiEventsAdd("evCamera", eventDetails1, ["bad time"],null,true,HTTP_Unprocessable);
     cy.log("list containing invaid time");
     cy.apiEventsAdd("evCamera", eventDetails1, [time1,time2,"bad time"],null,true,HTTP_Unprocessable);
  });

});

