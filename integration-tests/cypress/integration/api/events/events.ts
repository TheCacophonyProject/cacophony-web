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
  before(() => {
      cy.apiCreateUserGroupAndDevice("groupAdmin", "group", "camera");
      cy.apiCreateDevice("otherCamera","group");
      cy.apiCreateUser("deviceAdmin");
      cy.apiAddUserToDevice("groupAdmin","deviceAdmin","camera",true);
      cy.apiCreateUserGroupAndDevice("otherGroupAdmin", "otherGroup", "otherGroupCamera");
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

  it("Can add an event with a description", () => {
      const timeNow=(new Date()).toISOString();

      // Just description?
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", {}, [timeNow]);
      // Desctiption and type
      cy.apiEventsDeviceAddOnBehalf("groupAdmin", "camera", {type: EventTypes.POWERED_ON, details: {}}, [timeNow]);
  });

  it.skip("Can add an event with a description and new details", () => {
	  // Description and details
	  // Descrption type and details
  });

  it.skip("Can add an event with an event-details entry", () => {
	  // Just description
	  // Desctioption and type
	  // Description and details
	  // Descrption type and details
	  
  });

  it.skip("Can add multiple occurrences of an event", () => {

  });

  it.skip("Cannot add an event with neither detailsId nor description", () => {

  });

  it.skip("Correct handling of missing/invalid mandatory details sub-parameters", () => {

  });

  it.skip("Correct handling of missing/invalid eventDetailId", () => {

  });

  it.skip("Correct handling of invalid or missing deviceId", () => {

  });

  it.skip("Correct handling of invalid dateTimes", () => {

  });




});



