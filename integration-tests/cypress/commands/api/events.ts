// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

import { v1ApiPath, getCreds, makeAuthorizedRequest, makeAuthorizedRequestWithStatus, sortArrayOn, checkFlatStructuresAreEqualExcept,removeUndefinedParams } from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { getTestName, getUniq } from "../names";

export const EventTypes = {
  POWERED_ON: "rpi-power-on",
  POWERED_OFF: "daytime-power-off",
  STOP_REPORTED: "stop-reported"
};

Cypress.Commands.add(
  "apiEventAdd",
  (camera: string, description: ApiEventDetail, dates:string[] = [(new Date()).toISOString()], eventDetailId: number, log: boolean = true, statusCode: number = 200) => {
    const data:ApiEventSet={
      dateTimes: dates,
      description: description,
      eventDetailId: eventDetailId
    };
    logTestDescription(
      `Create event for ${camera} at ${dates}`,
      { data: data },
      log
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("events"),
        body: data
      },
      camera,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiEventsDeviceAddOnBehalf",
  (user: string, camera: string, description: ApiEventDetail, dates:string[] = [(new Date()).toISOString()], eventDetailId: number, log: boolean = true, statusCode: number = 200) => {
    const data:ApiEventSet={
      dateTimes: dates,
      description: description,
      eventDetailId: eventDetailId
    };
    const deviceId = getCreds(camera).id.toString();
    logTestDescription(
      `Create event for ${camera} at ${dates}`,
      { data: data },
      log
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`events/device/${deviceId}`),
        body: data
      },
      user,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiEventsCheck",
  (user: string, device: string, queryParams: any, expectedEventDetails: ApiEventReturned[], excludeCheckOn: string[] = [], statusCode: number = 200) => {
    logTestDescription( `Check for expected event for ${device} `, { user, device });

    // add deviceId to params unless already defined
    if (queryParams.deviceId===undefined) { queryParams.deviceId=getCreds(device).id};

    //drop any undefined parameters
    let filteredParams=removeUndefinedParams(queryParams);
  
    makeAuthorizedRequestWithStatus( { url: v1ApiPath("events", filteredParams) }, user, statusCode).then((response) => {
        if(statusCode===200) {
     	  //sort expected and actual events into same order (means dateTime is mandatory in expectedEvents)
          let sortEvents=sortArrayOn(response.body.rows,'dateTime');
          let sortExpectedEvents=sortArrayOn(expectedEventDetails,'dateTime');
          for (let eventCount=0; eventCount < sortExpectedEvents.length; eventCount++) {
            //look up device id unless supplied
            if (sortExpectedEvents[eventCount].DeviceId===undefined) { sortExpectedEvents[eventCount].DeviceId=getCreds(device).id};
            //check each expected event is in the events list
            checkEventMatchesExpected(sortEvents,sortExpectedEvents[eventCount],eventCount, excludeCheckOn);
          };
        };
    });
  }
);

Cypress.Commands.add(
  "apiPowerEventsCheck",
  (user: string, camera: string, expectedEvent: TestComparablePowerEvent) => {
    logTestDescription(
      `Check power events for ${camera} is ${prettyLog(expectedEvent)}}`,
      {
        user,
        camera,
        expectedEvent
      }
    );

    checkPowerEvents(user, camera, expectedEvent);
  }
);


Cypress.Commands.add(
  "apiEventsCheckAgainstExpected",
  (user: string, camera: string, eventName: string, eventNumber: number = 1, statusCode: number = 200) => {
    logTestDescription(
      `Check for expected event ${getUniq(eventName)} for ${camera} `,
      {
        user,
        camera,
	eventNumber
      }
    );

    checkEvents(user, camera, getUniq(eventName), eventNumber, ['success','trackId'], statusCode);
  }
);

Cypress.Commands.add(
   "createExpectedEvent",
   (name: string, user: string, device: string, recording: string, alertName: string)=> {
    logTestDescription(
      `Create expected event ${getUniq(name)} for ${getUniq(alertName)} `,
      {
        user,
        name,
        id: getUniq(alertName)
      }
    );
     const expectedEvent={
      "id":1,
      "dateTime":"2021-05-19T01:39:41.376Z",
      "createdAt":"2021-05-19T01:39:41.771Z",
      "DeviceId":getCreds(device).id,
      "EventDetail": {"type":"alert", "details":{"recId":getCreds(recording).id, "alertId":getCreds(getUniq(alertName)).id, "success":true, "trackId":1}},
      "Device":{"devicename":getTestName(getCreds(device).name)}
   };
     Cypress.env("testCreds")[getUniq(name)] = expectedEvent;
   }
);


function checkPowerEvents(
  user: string,
  camera: string,
  expectedEvent: TestComparablePowerEvent
) {
  const params = {
    deviceID: getCreds(camera).id
  };

  makeAuthorizedRequest(
    { url: v1ApiPath("events/powerEvents", params) },
    user
  ).then((response) => {
    checkPowerEventMatches(response, expectedEvent);
  });
}

function checkEvents(
  user: string,
  camera: string,
  eventName: string,
  eventNumber: number,
  ignoreParams: string[],
  statusCode: number
) {
  const params = {
    deviceID: getCreds(camera).id
  };

  makeAuthorizedRequestWithStatus(
    { url: v1ApiPath("events", params) },
    user,
    statusCode
  ).then((response) => {
    const expectedEvent=getExpectedEvent(eventName);
    if(statusCode===200) { checkEventMatchesExpected(response.body.rows, expectedEvent, eventNumber, ignoreParams)};
  });
}

function checkEventMatchesExpected( events: any[], expectedEvent: TestComparableEvent, eventNumber: number, ignoreParams: string[]) {
  const event = events[eventNumber];
  
  expect( event.DeviceId, `DeviceId should be ${expectedEvent.DeviceId}`).to.eq(expectedEvent.DeviceId);
  expect( event.Device.devicename, `devicename should be ${expectedEvent.Device.devicename}`).to.eq(expectedEvent.Device.devicename);
  expect( event.EventDetail.type, `Type should be ${expectedEvent.EventDetail.type}`).to.eq(expectedEvent.EventDetail.type);

  // check details except for success (email sent - not implemented on dev servers), and trackId - as we haven't stored this
  if(expectedEvent.EventDetail.details!==undefined) {
    checkFlatStructuresAreEqualExcept(expectedEvent.EventDetail.details,event.EventDetail.details,ignoreParams);
  };
};

function checkPowerEventMatches(
  response: Cypress.Response,
  expectedEvent: TestComparablePowerEvent
) {
  expect(response.body.events.length, `Expected 1 event`).to.eq(1);
  const powerEvent = response.body.events[0];

  expect(
    powerEvent.hasStopped,
    `Device should be ${expectedEvent.hasStopped ? "stopped" : "running"}`
  ).to.eq(expectedEvent.hasStopped);
  expect(
    powerEvent.hasAlerted,
    `Device should have been ${
      expectedEvent.hasAlerted ? "alerted" : "not alerted"
    }`
  ).to.eq(expectedEvent.hasAlerted);
}

export function getExpectedEvent(name: string): TestComparableEvent {
     return(Cypress.env("testCreds")[name]);
};

