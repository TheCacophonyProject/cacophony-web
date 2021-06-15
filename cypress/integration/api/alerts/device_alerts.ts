/// <reference path="../../../support/index.d.ts" />
import moment from "moment";
import { EventTypes } from "../../../commands/api/events";
import { checkResponse, getCreds } from "../../../commands/server";
import { getTestName } from "../../../commands/names";
import { ComparableAlert, getExpectedAlert } from "../../../commands/api/alerts";
import { ComparableEvent, getExpectedEvent } from "../../../commands/api/events";

const AuthorizationError = 403;
const BadRequest = 400;

const OK = null;


describe("Devices alerts", () => {
  const group = "colonelGroup";
  const user = "colonel";
  const helper = 'frank';
  const camera = 'camera1';
  const conditions = [{"tag":"possum","automatic":true}];
  const alertName = "alert1";
  var oneAlert;
  var emptyAlert;
  var expectedEvent;
  var alertId;
  var recId;

  before(() => {
    cy.apiCreateUser(helper);
    cy.apiCreateUserGroupAndCamera(user, group, camera);
  });

  it("Cannot create alert without access permissions", () => {
    cy.apiAddAlert(helper,alertName,conditions,camera,null,AuthorizationError).then((response) => {checkResponse(response,AuthorizationError)});
  });

  it("Cannot create alert with invalid condition", () => { 
    const bad_conditions = [{"tag": "any", "automaticF": true}]
    cy.apiAddAlert(user,alertName,bad_conditions,camera,null,BadRequest).then((response) => {checkResponse(response,BadRequest)});
  });

  it("Can create alert and has no events by default", () => {
    // create alert
    cy.apiAddAlert(user,alertName,conditions,camera,0,200).then((response)=> {

    // crete an example alert to compare against
    cy.createExpectedAlert("emptyAlert",{"id": getCreds(alertName).id,
        "name": "alert1",
        "frequencySeconds": 0,
        "conditions": [{"tag":"possum","automatic":true}],
        "lastAlert":false,
        "User":{"id":getCreds(user).id, "username":getTestName(getCreds(user).name), "email":getTestName(getCreds(user).name)+"@api.created.com"},
        "Device":{"id":getCreds(camera).id, "devicename":getTestName(getCreds(camera).name)}});
    });

    //check we created an alert wth no events yet
    cy.apiCheckAlert(user,camera,"emptyAlert");
  });

  it("Can receive an alert", () => {
    //expected alert to compare against 
    cy.createExpectedAlert("alert1",{"id": getCreds(alertName).id,
    "name": "alert1",
    "frequencySeconds": 0,
    "conditions": [{"tag":"possum","automatic":true}],
    "lastAlert":true,
    "User":{"id":getCreds(user).id, "username":getTestName(getCreds(user).name), "email":getTestName(getCreds(user).name)+"@api.created.com"},
    "Device":{"id":getCreds(camera).id, "devicename":getTestName(getCreds(camera).name)}});
    
    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.uploadRecording(camera, { tags: ["possum"] }, null, "recording1").then((response)=>{
      cy.createExpectedEvent("event1",{"id":1,
      "dateTime":"2021-05-19T01:39:41.376Z",
      "createdAt":"2021-05-19T01:39:41.771Z",
      "DeviceId":getCreds(camera).id,
      "EventDetail": {"type":"alert", "details":{"recId":getCreds("recording1").id, "alertId":getExpectedAlert(alertName).id, "success":true, "trackId":1}},
      "Device":{"devicename":getTestName(getCreds(camera).name)}})
    });
     
    //check that an alert is present and has a 'last alerted' 
    cy.apiCheckAlert(user,camera,"alert1");

    //check expected event is received
    cy.apiCheckEvents(user,camera,"event1");

  });

  it("Does not alert on non-master tags", () => {
   //upload a recording tagged as possum
    cy.uploadRecording(camera, { model: "different",tags: ["possum"]} ,null, "recording2" );

    //check we still have just 1 event
    cy.apiCheckAlert(user,camera,"alert1");
    cy.apiCheckEvents(user,camera,"event1");
  });

  it("Alerts for recording uploaded on behalf using deviceId", () => {
    //add helper to camera's group
    cy.apiAddUserToGroup(user,helper,group,false,true);

   //upload a recording tagged as possum using device
    cy.uploadRecordingOnBehalfUsingDevice(camera,  helper, { tags: ["possum"]} ,null, "recording3" ).then((response)=>{
      cy.createExpectedEvent("event2",{"id":1,
      "dateTime":"2021-05-19T01:39:41.376Z",
      "createdAt":"2021-05-19T01:39:41.771Z",
      "DeviceId":getCreds(camera).id,
      "EventDetail": {"type":"alert", "details":{"recId":getCreds("recording3").id, "alertId":getExpectedAlert(alertName).id, "success":true, "trackId":1}},
      "Device":{"devicename":getTestName(getCreds(camera).name)}})
    });


    //check we have new event
    cy.apiCheckAlert(user,camera,"alert1");
    cy.apiCheckEvents(user,camera,"event2",2);
  });

    it("Alerts for recording uploaded on behalf using devicename and groupname", () => {

   //upload a recording tagged as possum using group
    cy.uploadRecordingOnBehalfUsingGroup(camera,  group, helper, { tags: ["possum"]} ,null, "recording4" ).then((response)=>{
      cy.createExpectedEvent("event3",{"id":1,
      "dateTime":"2021-05-19T01:39:41.376Z",
      "createdAt":"2021-05-19T01:39:41.771Z",
      "DeviceId":getCreds(camera).id,
      "EventDetail": {"type":"alert", "details":{"recId":getCreds("recording4").id, "alertId":getExpectedAlert(alertName).id, "success":true, "trackId":1}},
      "Device":{"devicename":getTestName(getCreds(camera).name)}})
    });


    //check we have new event
    cy.apiCheckAlert(user,camera,"alert1");
    cy.apiCheckEvents(user,camera,"event3",3);
  });
});



