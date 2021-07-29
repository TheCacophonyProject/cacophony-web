// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types.d.ts" />

import { v1ApiPath, getCreds, saveIdOnly, makeAuthorizedRequest,makeAuthorizedRequestWithStatus } from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { getTestName, getUniq } from "../names";

Cypress.Commands.add(
  "apiAddAlert",
  (user: string, alertName: string, conditions: ApiAlertConditions, device: string, frequency?: number=null, statusCode?: number = 200)=> {
    logTestDescription(
      `Create alert ${getUniq(alertName)} for ${device} `,
      {
        user,
        device,
        conditions,
        frequency,
        getUniq(alertName)
      }
    );
    apiAlertsPost(user,alertName,conditions,device,frequency,statusCode);
  }
);

Cypress.Commands.add(
  "apiCheckAlert",
  (user: string, device: string, alertName?: string, statusCode?: number = 200)=> {
    logTestDescription(
      `Check for expected alert ${getUniq(alertName)} for ${device} `,
      {
        user,
        device,
        getUniq(alertName)
      }
    );

    apiAlertsGet(user,device,statusCode).then((response) => { 
       if(statusCode==200) {
         checkExpectedAlerts(response,getUniq(alertName));	    
       };
    });
  }
);

Cypress.Commands.add(
   "createExpectedAlert",
   (name: string, alertName: string, frequencySeconds: number, conditions: ApiAlertConditions, lastAlert: boolean, user: string, device: string)=> {
    logTestDescription(
      `Create expected alert ${getUniq(name)} for ${device} `,
      {
        user,
        device,
        getUniq(name)
      }
    );
     //alertId will have been saved when we created the alert
     const alertId=getCreds(getUniq(alertName)).id;
     const expectedAlert={
       "id": alertId ,
       "name": name,
       "alertName": getUniq(alertName),
       "frequencySeconds": frequencySeconds,
       "conditions": conditions,
       "lastAlert":lastAlert,
       "User":{"id":getCreds(user).id, "username":getTestName(user), "email":getTestName(user)+"@api.created.com"},
       "Device":{"id":getCreds(device).id, "devicename":getTestName(getCreds(device).name)}
     };

     Cypress.env("testCreds")[getUniq(name)] = expectedAlert;
   }
);


function apiAlertsPost(
  user: string,
  alertName: string,
  conditions: ApiAlertConditions,
  device: string,
  frequency: number,
  testFailure: number
) {
  const deviceId = getCreds(device).id;
  const alertJson = {
           name: getUniq(alertName),
           conditions: conditions,
           deviceId: deviceId
        };

  if(frequency!=null) {
	  alertJson["frequencySeconds"]=frequency;
  };


  makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("alerts"),
        body: alertJson
      },
      user,
      testFailure
    ).then((response)=>{
       if(testFailure==null || testFailure==200) {
         saveIdOnly(getUniq(alertName), response.body.id);
       };
    });
}

function apiAlertsGet(
  user: string,
  device: string,
  statusCode: number
) {
   const deviceId= getCreds(device).id;
   const params = {};

  return(makeAuthorizedRequestWithStatus(
    { url: v1ApiPath(`alerts/device/${deviceId}`, params) },
    user,
    statusCode
  ));
}



function checkExpectedAlerts(
  response: Cypress.Response,
  alertName: string
) {
  const expectedAlert=getExpectedAlert(alertName);
  expect(response.body.Alerts.length, `Expected 1 alert`).to.eq(1);
  const thealert = response.body.Alerts[0];

  expect(
    thealert.name,
    `Name should be ${expectedAlert.alertName}`
  ).to.eq(expectedAlert.alertName);
  expect(
    thealert.frequencySeconds,
    `frequencySeconds should have been ${expectedAlert.frequencySeconds}`
  ).to.eq(expectedAlert.frequencySeconds);
  expect(
    thealert.conditions[0]['tag'],
    `conditons should have been ${expectedAlert.conditions[0]['tag']}`
  ).to.eq(expectedAlert.conditions[0].tag);
  expect(
    thealert.conditions[0].automatic,
    `conditons should have been ${expectedAlert.conditions[0].automatic}`
  ).to.eq(expectedAlert.conditions[0].automatic);
  if (expectedAlert.lastAlert==false) {
    expect(
      thealert.lastAlert,
      `lastAlert should have been null ` 
    ).to.eq(null);
  } else {    
    expect(
      thealert.lastAlert,
      `should have a lastAlert`
    ).to.not.eq(null);
  }
//  expect(
//    thealert.User.id,
//    `user.id should have been ${expectedAlert.User.id}`
//  ).to.eq(expectedAlert.User.id);
  expect(
    thealert.User.name,
    `user.name should have been ${expectedAlert.User.name}`
  ).to.eq(expectedAlert.User.name);
  expect(
    thealert.User.email,
    `user.email should have been ${expectedAlert.User.email}`
  ).to.eq(expectedAlert.User.email);
  expect(
    thealert.Device.id,
    `device.id should have been ${expectedAlert.Device.id}`
  ).to.eq(expectedAlert.Device.id);
  expect(
    thealert.Device.devicename,
    `device.devicename should have been ${expectedAlert.Device.devicename}`
  ).to.eq(expectedAlert.Device.devicename);
  return(response);
}

export function getExpectedAlert(name: string): ApiAlert {
     return(Cypress.env("testCreds")[name]);
};
