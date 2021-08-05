/// <reference path="../../../support/index.d.ts" />

import { EventTypes } from "../../../commands/api/events";
import { getTestName } from "../../../commands/names";


const HTTP_AuthorizationError = 401;
const HTTP_Forbidden = 403;
const HTTP_BadRequest = 400;
const HTTP_Unprocessable = 422;
const HTTP_OK200 = 200;


describe("Events - add event on behalf of device", () => {
  const firstTime=(new Date()).toISOString();
  let eventDetailsId1:number;
  let eventDetailsId2:number;
  const time1="2018-01-01T07:22:56.000Z";
  const time2="2018-01-02T07:22:56.000Z";
  const eventDetails1={type: EventTypes.POWERED_ON, details: {}};
  const eventDetails2={type: "audioBait", details: {fileId: 8, volume:10 }};

  before(() => {
      cy.apiCreateUserGroupAndDevice("groupAdmin", "group", "camera");
      cy.apiCreateDevice("otherCamera","group");
      cy.apiCreateUser("deviceAdmin");
      cy.apiAddUserToDevice("groupAdmin","deviceAdmin","camera",true);
      cy.apiCreateUserGroupAndDevice("otherGroupAdmin", "otherGroup", "otherGroupCamera");

      //Create some events to reuse / query
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera",  eventDetails1, [time1]).then((response:number) => {eventDetailsId1=response});
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails2, [time2]).then((response:number) => {eventDetailsId2=response});
    });

  it("Group admin can add event on behalf of device", () => {  
      cy.apiCreateUserGroupAndDevice("groupAdmin1", "group1", "camera1");
      const expectedEvent1={dateTime: firstTime, Device: {devicename: getTestName("camera1")}, EventDetail: {type: EventTypes.POWERED_ON, details: {}}};
      cy.apiEventsDeviceAddOnBehalf("groupAdmin1", "camera1", {type: EventTypes.POWERED_ON, details: {}}, [firstTime]);
      cy.apiEventsCheck("groupAdmin1","camera1",{}, [expectedEvent1]); 
  });

  it("Group member can add event on behalf of device", () => {  
      cy.apiCreateUserGroupAndDevice("groupAdmin2", "group2", "camera2");
      cy.apiCreateUser("groupMember2");
      const expectedEvent2={dateTime: firstTime, Device: {devicename: getTestName("camera2")}, EventDetail: {type: EventTypes.POWERED_ON, details: {}}};
      cy.apiAddUserToGroup("groupAdmin2","groupMember2", "group2", false);
      cy.apiEventsDeviceAddOnBehalf("groupMember2", "camera2", {type: EventTypes.POWERED_ON, details: {}}, [firstTime]);
      cy.apiEventsCheck("groupMember2","camera2",{}, [expectedEvent2]);
  });

  it("Device admin can add event on behalf of device", () => {  
      cy.apiCreateUserGroupAndDevice("groupAdmin3", "group3", "camera3");
      cy.apiCreateUser("deviceAdmin3");
      cy.apiAddUserToDevice("groupAdmin3","deviceAdmin3","camera3",true);
      const expectedEvent3={dateTime: firstTime, Device: {devicename: getTestName("camera3")}, EventDetail: {type: EventTypes.POWERED_ON, details: {}}};

      cy.apiEventsDeviceAddOnBehalf("deviceAdmin3", "camera3", {type: EventTypes.POWERED_ON, details: {}}, [firstTime]);
      cy.apiEventsCheck("deviceAdmin3","camera3",{}, [expectedEvent3]);
  });

  it("Device member can add event on behalf of device", () => {  
      cy.apiCreateUserGroupAndDevice("groupAdmin4", "group4", "camera4");
      cy.apiCreateUser("deviceMember4");
      cy.apiAddUserToDevice("groupAdmin4","deviceMember4","camera4",true);
      const expectedEvent4={dateTime: firstTime, Device: {devicename: getTestName("camera4")}, EventDetail: {type: EventTypes.POWERED_ON, details: {}}};

      cy.apiEventsDeviceAddOnBehalf("deviceMember4", "camera4", {type: EventTypes.POWERED_ON, details: {}}, [firstTime]);
      cy.apiEventsCheck("deviceMember4","camera4",{}, [expectedEvent4]);
  });

  it("Group admin cannot add event for a device in another group", () => {  
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "otherGroupCamera", {type: EventTypes.POWERED_ON, details: {}}, [firstTime],undefined,true,HTTP_Forbidden);
  });

  it("Device admin cannot add event for another device in group", () => {  
      cy.apiEventsDeviceAddOnBehalf("deviceAdmin", "otherCamera", {type: EventTypes.POWERED_ON, details: {}}, [firstTime],undefined,true,HTTP_Forbidden);
  });

  it("Can reuse eventDetails by either specifying a duplicate description or specifying the eventDetailsId", () => {
      const time3="2018-01-03T07:22:56.000Z";
      const time4="2018-01-04T07:22:56.000Z";
      const time5="2018-01-05T07:22:56.000Z";
      const time6="2018-01-06T07:22:56.000Z";

      //check we can resue same eventDetailsIds by specifying same description
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, [time3]).then((response:number) => {
        expect(response,`event details ID should match previous identical event ${eventDetailsId1}`).to.equal(eventDetailsId1);
      });
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails2, [time4]).then((response:number) => {
        expect(response,`event details ID should match previous identical event ${eventDetailsId2}`).to.equal(eventDetailsId2);
      });


      //check we can resue same eventDetailsIds by specifying same description
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", undefined, [time5], eventDetailsId1).then((response:number) => {
        expect(response,`event details ID should match previous identical event ${eventDetailsId1}`).to.equal(eventDetailsId1);
      });
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", undefined, [time6], eventDetailsId2).then((response:number) => {
        expect(response,`event details ID should match previous identical event ${eventDetailsId2}`).to.equal(eventDetailsId2);
      });

      //check all events are listed
      const expectedEvent7a={dateTime: time1, Device: {devicename: getTestName("camera")}, EventDetail: eventDetails1}; 
      const expectedEvent7b={dateTime: time2, Device: {devicename: getTestName("camera")}, EventDetail: eventDetails2};
      const expectedEvent7c={dateTime: time3, Device: {devicename: getTestName("camera")}, EventDetail: eventDetails1}; 
      const expectedEvent7d={dateTime: time4, Device: {devicename: getTestName("camera")}, EventDetail: eventDetails2};
      const expectedEvent7e={dateTime: time5, Device: {devicename: getTestName("camera")}, EventDetail: eventDetails1};
      const expectedEvent7f={dateTime: time6, Device: {devicename: getTestName("camera")}, EventDetail: eventDetails2};
      cy.apiEventsCheck("groupAdmin","camera",{}, [expectedEvent7a, expectedEvent7b, expectedEvent7c, expectedEvent7d, expectedEvent7e, expectedEvent7f]);
  });

  it("Can add multiple occurrences of an event", () => {
    cy.apiCreateUserGroupAndDevice("groupAdmin8", "group8", "camera8");

    let time11="2019-01-01T07:22:56.000Z"
    let time12="2019-01-02T07:22:56.000Z"
    let time13="2019-01-03T07:22:56.000Z"
    let time14="2019-01-04T07:22:56.000Z"

    const eventDetail={type: "alert", details: {recId: 1, alertId: 2, success: true, trackId: 3}};
    cy.apiEventsDeviceAddOnBehalf("groupAdmin8", "camera8", eventDetail, [time11, time12, time13, time14]);

    const expectedEvent8a={dateTime: time11, Device: {devicename: getTestName("camera8")}, EventDetail: eventDetail};
    const expectedEvent8b={dateTime: time12, Device: {devicename: getTestName("camera8")}, EventDetail: eventDetail};
    const expectedEvent8c={dateTime: time13, Device: {devicename: getTestName("camera8")}, EventDetail: eventDetail};
    const expectedEvent8d={dateTime: time14, Device: {devicename: getTestName("camera8")}, EventDetail: eventDetail};

    cy.apiEventsCheck("groupAdmin8","camera8",{}, [expectedEvent8a, expectedEvent8b, expectedEvent8c, expectedEvent8d]);
  });

  it("Cannot add an event with neither detailsId nor description", () => {
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", undefined, [time1],undefined,true,HTTP_Unprocessable);
  });

  it("Correct handling of missing/invalid mandatory details sub-parameters", () => {
     //empty description
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", {}, [time1],undefined,true,HTTP_Unprocessable);
     //description missing type
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", {details:{info: "hello"}}, [time1],undefined,true,HTTP_Unprocessable);
  });

  it("Correct handling of missing/invalid eventDetailId", () => {
     //ecentDetailsId=null
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", undefined, [time1],null,true,HTTP_Unprocessable);
     //ecentDetailsId=non-existent event detail record
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", undefined, [time1],9999999,true,HTTP_Unprocessable);
  });

  it("Correct handling of invalid or missing deviceId", () => {
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "999999", eventDetails1, [time1],null,true,HTTP_Unprocessable);

  });

  it("Correct handling of invalid dateTimes", () => {
     //no time
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, [],null,true,HTTP_Unprocessable);
     //blank time
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, [""],null,true,HTTP_Unprocessable);
     //invalid time
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, ["bad time"],null,true,HTTP_Unprocessable);
     //list containing invaid time
     cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", eventDetails1, [time1,time2,"bad time"],null,true,HTTP_Unprocessable);
  });




});



