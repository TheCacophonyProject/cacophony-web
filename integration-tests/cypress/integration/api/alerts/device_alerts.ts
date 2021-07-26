/// <reference path="../../../support/index.d.ts" />
import { checkResponse } from "../../../commands/server";
import { getNewIdentity } from "../../../commands/names";

const AuthorizationError = 403;
const BadRequest = 400;

const OK200 = 200;


describe("Devices alerts", () => {
  const POSSUM_ALERT = [{"tag":"possum","automatic":true}];


  it("Cannot create alert without access permissions", () => {  
    const usera=getNewIdentity('alice');
    const userb=getNewIdentity('bob');

    cy.apiCreateUser(userb.name);
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    //attempt to create alert for camera that is not ours
    cy.apiAddAlert(userb.name,'alert1',POSSUM_ALERT,usera.camera,null,AuthorizationError).then((response) => {checkResponse(response,AuthorizationError);
    });
  });

  it("Cannot create alert with invalid condition", () => { 
    const BAD_POSSUM_ALERT = [{"bad_tag": "any", "automatic": true}];
    const usera=getNewIdentity('anna');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    //attempt to create alert with invalid data
    cy.apiAddAlert(usera.name,'alert1',BAD_POSSUM_ALERT,usera.camera,null,BadRequest).then((response) => {checkResponse(response,BadRequest);
    });
  });

  it("Can create alert and has no events by default", () => {
    const usera=getNewIdentity('alfred');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1',POSSUM_ALERT,usera.camera,0,OK200);

    // crete an example alert to compare against
    cy.createExpectedAlert("emptyExpectedAlert", "alert1", 0, POSSUM_ALERT, false, usera.name, usera.camera);

    //check we created an alert wth no last alerted time
    cy.apiCheckAlert(usera.name,usera.camera,"emptyExpectedAlert");

    //check we have no events
    cy.apiCheckEvents(usera.name,usera.camera,null,0);
  });

  it("Can receive an alert", () => {
    const usera=getNewIdentity('andrew');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1',POSSUM_ALERT,usera.camera,0,OK200);

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.uploadRecording(usera.camera, { processingState: "FINISHED", tags: ["possum"] }, null, "recording1").then(()=>{
      cy.createExpectedAlert("expectedAlert1", "alert1", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("event1", usera.name, usera.camera, 'recording1', 'alert1');
      });
    });
     
    //check that an alert is present and has a 'last alerted' 
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert1");

    //check expected event is received
    cy.apiCheckEvents(usera.name,usera.camera,"event1");
  });

  it("No possum alert is sent for a rat", () => {
    const usera=getNewIdentity('alfreda');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1b',POSSUM_ALERT,usera.camera,0,OK200);

    //upload a recording tagged as rat and  build an expected event using the returned recording details
    cy.uploadRecording(usera.camera, { processingState: "FINISHED", tags: ["rat"] }, null, "recording1b").then(()=>{
      cy.createExpectedAlert("emptyAlert", "alert1b", 0, POSSUM_ALERT, false, usera.name, usera.camera);
    });

    //check that an alert is present and has no 'last alerted'
    cy.apiCheckAlert(usera.name,usera.camera,"emptyAlert");

    //check we have no events
    cy.apiCheckEvents(usera.name,usera.camera,null,0);
  });

  it("No possum alert is sent for a possum on a different device", () => {
    const usera=getNewIdentity('aine');
    const camera2="camera2";
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);
    cy.apiCreateCamera(camera2,usera.group);

    // create alert
    cy.apiAddAlert(usera.name,'alert1c',POSSUM_ALERT,usera.camera,0,OK200);

    //upload a recording tagged as possum against another camera and  build an expected event using the returned recording details
    cy.uploadRecording(camera2, { processingState: "FINISHED", tags: ["possum"] }, null, "recording1c").then(()=>{
      cy.createExpectedAlert("emptyAlert", "alert1c", 0, POSSUM_ALERT, false, usera.name, usera.camera);
    });

    //check that an alert is present and has no 'last alerted'
    cy.apiCheckAlert(usera.name,usera.camera,"emptyAlert");

    //check we have no events against either camera
    cy.apiCheckEvents(usera.name,usera.camera,null,0);
    cy.apiCheckEvents(usera.name,camera2,null,0);
  });

  it("Recording with multiple tags - majority tag alerts", () => {
    const usera=getNewIdentity('aaron');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1d',POSSUM_ALERT,usera.camera,0,OK200);

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.uploadRecording(usera.camera, { processingState: "FINISHED", tags: ["rat", "possum", "possum", "possum", "rat"] }, null, "recording1d").then(()=>{
      cy.createExpectedAlert("expectedAlert1d", "alert1d", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("event1d", usera.name, usera.camera, 'recording1d', 'alert1d');
      });
    });

    //check that an alert is present and has a 'last alerted' 
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert1d");

    //check expected event is received
    cy.apiCheckEvents(usera.name,usera.camera,"event1d");
  });

  it("Recording with multiple tags - minority tag does not alert", () => {
    const usera=getNewIdentity('aaron');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1d',POSSUM_ALERT,usera.camera,0,OK200);

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.uploadRecording(usera.camera, { processingState: "FINISHED", tags: ["rat", "rat", "possum", "possum", "rat"] }, null, "recording1d").then(()=>{
      cy.createExpectedAlert("expectedAlert1d", "alert1d", 0, POSSUM_ALERT, false, usera.name, usera.camera);
    });

    //check that an alert is present and has no 'last alerted' 
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert1d");

    //check we have no events against camera
    cy.apiCheckEvents(usera.name,usera.camera,null,0);
  });

  it("Does not alert on non-master tags", () => {
    const usera=getNewIdentity('alistair');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1',POSSUM_ALERT,usera.camera,0,OK200);

    //expected alert to compare against (latestEvent is false)
    cy.createExpectedAlert("emptyAlert", "alert1", 0, POSSUM_ALERT, false, usera.name, usera.camera);

    //upload a recording tagged as possum
    cy.uploadRecording(usera.camera, { model: "different",processingState: "FINISHED", tags: ["possum"]} ,null, "recording2" );

    //check we have an alert with no latestEvent
    cy.apiCheckAlert(usera.name,usera.camera,"emptyAlert");

    //check we have no events
    cy.apiCheckEvents(usera.name,usera.camera,null,0);
  });

  it("Alerts for recording uploaded on behalf using deviceId", () => {
    const usera=getNewIdentity('albert');
    const userb=getNewIdentity('barbera');

    cy.apiCreateUser(userb.name);
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert3',POSSUM_ALERT,usera.camera,0,OK200);

    //add userb to camera's group
    cy.apiAddUserToGroup(usera.name,userb.name,usera.group,false,true);

    //upload a recording tagged as possum using device
    cy.uploadRecordingOnBehalfUsingDevice(usera.camera,  userb.name, { processingState: "FINISHED", tags: ["possum"]} ,null, "recording3" ).then(()=>{
      cy.createExpectedAlert("expectedAlert3", "alert3", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("expectedEvent3", usera.name, usera.camera, 'recording3', 'alert3');
      });
    });


    //check we have an alert with a latestEvent
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert3");

    //check we have one event
    cy.apiCheckEvents(usera.name,usera.camera,"expectedEvent3",1);
  });

  it("Alerts for recording uploaded on behalf using devicename and groupname", () => {
    const usera=getNewIdentity('andrea');
    const userb=getNewIdentity('bruce');

    cy.apiCreateUser(userb.name);
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert4',POSSUM_ALERT,usera.camera,0,OK200);

    //add userb to camera's group
    cy.apiAddUserToGroup(usera.name,userb.name,usera.group,false,true);

    //upload a recording tagged as possum using group
    cy.uploadRecordingOnBehalfUsingGroup(usera.camera,  usera.group, userb.name, { processingState: "FINISHED", tags: ["possum"]} ,null, "recording4" ).then(()=>{
      cy.createExpectedAlert("expectedAlert4", "alert4", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("expectedEvent4", usera.name, usera.camera, 'recording4', 'alert4');
      });
    });


    //check alert is present and as expected shows latest event
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert4");

    //check we have new event
    cy.apiCheckEvents(usera.name,usera.camera,"expectedEvent4",1);
  });

  it("Can generate and report multiple events", () => {
    const usera=getNewIdentity('aida');
    cy.apiCreateUserGroupAndCamera(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAddAlert(usera.name,'alert1',POSSUM_ALERT,usera.camera,0,OK200);

    //upload a recording tagged as possum using group
    cy.uploadRecordingOnBehalfUsingGroup(usera.camera,  usera.group, usera.name, { processingState: "FINISHED", tags: ["possum"]} ,null, "recording1" ).then(()=>{
      cy.createExpectedAlert("expectedAlert1", "alert1", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("expectedEvent1", usera.name, usera.camera, 'recording1', 'alert1');
      });
    });

    //check that an alert is present and has a 'last alerted' 
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert1");

    //check there is now 1 event and that expected event has been received
    cy.apiCheckEvents(usera.name,usera.camera,"expectedEvent1",1);

    //upload a 2nd recording tagged as possum using device
    cy.uploadRecordingOnBehalfUsingDevice(usera.camera,  usera.name, { processingState: "FINISHED", tags: ["possum"]} ,null, "recording2" ).then(()=>{
      cy.createExpectedAlert("expectedAlert2", "alert1", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("expectedEvent2", usera.name, usera.camera, 'recording2', 'alert1');
      });
    });

    //check that an alert is present and has a 'last alerted' 
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert2");

    //check there are now 2 events and 2nd expected event has been received
    cy.apiCheckEvents(usera.name,usera.camera,"expectedEvent2",2);

    //upload a 3rd recording tagged as possum and  build an expected event using the returned recording details
    cy.uploadRecording(usera.camera, { processingState: "FINISHED", tags: ["possum"] }, null, "recording3").then(()=>{
      cy.createExpectedAlert("expectedAlert3", "alert1", 0, POSSUM_ALERT, true, usera.name, usera.camera).then(()=>{
        cy.createExpectedEvent("expectedEvent3", usera.name, usera.camera, 'recording3', 'alert1');
      });
    });

    //check that an alert is present and has a 'last alerted' 
    cy.apiCheckAlert(usera.name,usera.camera,"expectedAlert3");


    //check there are 3 events and 3rd expected event has been received
    cy.apiCheckEvents(usera.name,usera.camera,"expectedEvent3",3);

  });

});



