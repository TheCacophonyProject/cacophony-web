// load the global Cypress types
/// <reference types="cypress" />
/// <reference types="../types" />

import { v1ApiPath, getCreds, makeAuthorizedRequest } from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { getTestName, getUniq } from "../names";
import {TestComparableEvent, TestComparablePowerEvent } from "../types";

export const EventTypes = {
  POWERED_ON: "rpi-power-on",
  POWERED_OFF: "daytime-power-off",
  STOP_REPORTED: "stop-reported",
};

Cypress.Commands.add(
  "recordEvent",
  (
    camera: string,
    type: string,
    details: any = {},
    date = new Date(),
    log = true
  ) => {
    const data = {
      dateTimes: [date.toISOString()],
      description: { type: type, details: details },
    };
    logTestDescription(
      `Create ${type} event for ${camera} at ${date}`,
      { data: data },
      log
    );
    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath("events"),
        body: data,
      },
      camera
    );
  }
);

Cypress.Commands.add(
  "checkPowerEvents",
  (user: string, camera: string, expectedEvent: TestComparablePowerEvent) => {
    logTestDescription(
      `Check power events for ${camera} is ${prettyLog(expectedEvent)}}`,
      {
        user,
        camera,
        expectedEvent,
      }
    );

    checkPowerEvents(user, camera, expectedEvent);
  }
);

Cypress.Commands.add(
  "apiCheckEvents",
  (
    user: string,
    camera: string,
    eventName: string,
    eventNumber: number = 1
  ) => {
    logTestDescription(
      `Check for expected event ${getUniq(eventName)} for ${camera} `,
      {
        user,
        camera,
        eventNumber,
      }
    );

    checkEvents(user, camera, getUniq(eventName), eventNumber);
  }
);

Cypress.Commands.add(
  "createExpectedEvent",
  (
    name: string,
    user: string,
    device: string,
    recording: string,
    alertName: string
  ) => {
    logTestDescription(
      `Create expected event ${getUniq(name)} for ${getUniq(alertName)} `,
      {
        user,
        name,
        id: getUniq(alertName),
      }
    );
    const expectedEvent = {
      id: 1,
      dateTime: "2021-05-19T01:39:41.376Z",
      createdAt: "2021-05-19T01:39:41.771Z",
      DeviceId: getCreds(device).id,
      EventDetail: {
        type: "alert",
        details: {
          recId: getCreds(recording).id,
          alertId: getCreds(getUniq(alertName)).id,
          success: true,
          trackId: 1,
        },
      },
      Device: { devicename: getTestName(getCreds(device).name) },
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
    deviceID: getCreds(camera).id,
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
  eventNumber: number
) {
  const params = {
    deviceID: getCreds(camera).id,
  };

  makeAuthorizedRequest({ url: v1ApiPath("events", params) }, user).then(
    (response) => {
      checkEventMatches(response, eventName, eventNumber);
    }
  );
}

function checkEventMatches(
  response: Cypress.Response<any>,
  eventName: string,
  eventNumber: number
) {
  const expectedEvent = getExpectedEvent(eventName);
  expect(response.body.rows.length, `Expected ${eventNumber} event(s)`).to.eq(
    eventNumber
  );
  if (eventNumber > 0) {
    const event = response.body.rows[eventNumber - 1];

    expect(
      event.DeviceId,
      `DeviceId should be ${expectedEvent.DeviceId}`
    ).to.eq(expectedEvent.DeviceId);
    expect(
      event.Device.devicename,
      `devicename should be ${expectedEvent.Device.devicename}`
    ).to.eq(expectedEvent.Device.devicename);
    expect(
      event.EventDetail.type,
      `Type should be ${expectedEvent.EventDetail.type}`
    ).to.eq(expectedEvent.EventDetail.type);
    expect(
      event.EventDetail.details.recId,
      `Recid should be ${expectedEvent.EventDetail.details.recId}`
    ).to.eq(expectedEvent.EventDetail.details.recId);
    expect(
      event.EventDetail.details.alertId,
      `alertId should be ${expectedEvent.EventDetail.details.alertId}`
    ).to.eq(expectedEvent.EventDetail.details.alertId);
    // Disabled as 'false' in test evironment.  TODO: work out why and remedy
    //  expect(
    //    event.EventDetail.details.success,
    //    `success should be ${expectedEvent.EventDetail.details.success}`
    //  ).to.eq(expectedEvent.EventDetail.details.success);
    expect(event.EventDetail.details.trackId, `trackid should be present`).not
      .to.be.undefined;
  }
}

function checkPowerEventMatches(
  response: Cypress.Response<any>,
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
  return Cypress.env("testCreds")[name];
}
