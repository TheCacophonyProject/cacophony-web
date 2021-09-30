// load the global Cypress types
/// <reference types="cypress" />

import {
  v1ApiPath,
  getCreds,
  saveIdOnly,
  makeAuthorizedRequestWithStatus,
} from "../server";
import { logTestDescription } from "../descriptions";
import { getTestName, getUniq } from "../names";
import { ApiAlert } from "../types";
import { ApiAlertCondition } from "@typedefs/api/alerts";

Cypress.Commands.add(
  "apiAlertAdd",
  (
    userName: string,
    alertName: string,
    conditions: ApiAlertCondition[],
    deviceName: string,
    frequency: number | null = null,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `Create alert ${getUniq(alertName)} for ${deviceName} `,
      {
        userName,
        deviceName,
        conditions,
        frequency,
        id: getUniq(alertName),
      }
    );
    apiAlertsPost(
      userName,
      alertName,
      conditions,
      deviceName,
      frequency,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiAlertCheck",
  (
    userName: string,
    deviceName: string,
    alertName: string,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `Check for expected alert ${getUniq(alertName)} for ${deviceName} `,
      {
        userName,
        deviceName,
        id: getUniq(alertName),
      }
    );

    apiAlertsGet(userName, deviceName, statusCode).then((response) => {
      if (statusCode == 200) {
        checkExpectedAlerts(response, getUniq(alertName));
      }
    });
  }
);

Cypress.Commands.add(
  "createExpectedAlert",
  (
    name: string,
    alertName: string,
    frequencySeconds: number,
    conditions: ApiAlertCondition[],
    lastAlert: boolean,
    userName: string,
    deviceName: string
  ) => {
    logTestDescription(
      `Create expected alert ${getUniq(name)} for ${deviceName} `,
      {
        userName,
        deviceName,
        id: getUniq(name),
      }
    );
    //alertId will have been saved when we created the alert
    const alertId = getCreds(getUniq(alertName)).id;
    const expectedAlert = {
      id: alertId,
      name: alertName,
      alertName: getUniq(alertName),
      frequencySeconds: frequencySeconds,
      conditions: conditions,
      lastAlert: lastAlert,
      User: {
        id: getCreds(userName).id,
        username: getTestName(userName),
        email: getTestName(userName).toLowerCase() + "@api.created.com",
      },
      Device: {
        id: getCreds(deviceName).id,
        devicename: getTestName(getCreds(deviceName).name),
      },
    };

    Cypress.env("testCreds")[getUniq(name)] = expectedAlert;
  }
);

function apiAlertsPost(
  userName: string,
  alertName: string,
  conditions: ApiAlertCondition[],
  deviceName: string,
  frequency: number,
  testFailure: number
) {
  const deviceId = getCreds(deviceName).id;
  const alertJson = {
    name: getUniq(alertName),
    conditions: conditions,
    deviceId: deviceId,
  };

  if (frequency !== null) {
    alertJson["frequencySeconds"] = frequency;
  }

  makeAuthorizedRequestWithStatus(
    {
      method: "POST",
      url: v1ApiPath("alerts"),
      body: alertJson,
    },
    userName,
    testFailure
  ).then((response) => {
    if (testFailure === null || testFailure == 200) {
      saveIdOnly(getUniq(alertName), response.body.id);
    }
  });
}

function apiAlertsGet(
  userName: string,
  deviceName: string,
  statusCode: number
) {
  const deviceId = getCreds(deviceName).id;
  const params = {};

  return makeAuthorizedRequestWithStatus(
    { url: v1ApiPath(`alerts/device/${deviceId}`, params) },
    userName,
    statusCode
  );
}

function checkExpectedAlerts(
  response: Cypress.Response<any>,
  alertName: string
) {
  const expectedAlert = getExpectedAlert(alertName);
  expect(response.body.Alerts.length, `Expected 1 alert`).to.eq(1);
  const thealert = response.body.Alerts[0];

  expect(thealert.name, `Name should be ${expectedAlert.alertName}`).to.eq(
    expectedAlert.alertName
  );
  expect(
    thealert.frequencySeconds,
    `frequencySeconds should have been ${expectedAlert.frequencySeconds}`
  ).to.eq(expectedAlert.frequencySeconds);
  expect(
    thealert.conditions[0]["tag"],
    `conditons should have been ${expectedAlert.conditions[0]["tag"]}`
  ).to.eq(expectedAlert.conditions[0].tag);
  expect(
    thealert.conditions[0].automatic,
    `conditons should have been ${expectedAlert.conditions[0].automatic}`
  ).to.eq(expectedAlert.conditions[0].automatic);
  if (expectedAlert.lastAlert == false) {
    expect(thealert.lastAlert, `lastAlert should have been null `).to.eq(null);
  } else {
    expect(thealert.lastAlert, `should have a lastAlert`).to.not.eq(null);
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
  return response;
}

export function getExpectedAlert(name: string): ApiAlert {
  return Cypress.env("testCreds")[name];
}
