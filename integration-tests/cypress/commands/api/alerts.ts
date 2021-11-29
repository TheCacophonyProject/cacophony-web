// load the global Cypress types
/// <reference types="cypress" />

import {
  v1ApiPath,
  getCreds,
  saveIdOnly,
  makeAuthorizedRequestWithStatus,
} from "../server";
import { logTestDescription } from "../descriptions";
import { getTestName } from "../names";
import { testRunOnApi } from "../server";
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
      `Create alert ${getTestName(alertName)} for ${deviceName} `,
      {
        userName,
        deviceName,
        conditions,
        frequency,
        id: getTestName(alertName),
      }
    );
    const deviceId = getCreds(deviceName).id;
    const alertJson = {
      name: getTestName(alertName),
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
      statusCode
    ).then((response) => {
      if (statusCode === null || statusCode == 200) {
        saveIdOnly(alertName, response.body.id);
      }
    });
});

Cypress.Commands.add(
  "apiAlertCheck",
  (
    userName: string,
    deviceName: string,
    expectedAlert: any,
    statusCode: number = 200
  ) => {
    logTestDescription(
      `Check for expected alert for ${deviceName} `,
      {
        userName,
        deviceName,
      }
    );

    apiAlertsGet(userName, deviceName, statusCode).then((response) => {
      if (statusCode == 200) {
        checkExpectedAlerts(response, expectedAlert);
      }
    });
  }
);

export function createExpectedAlert (
    alertName: string,
    frequencySeconds: number,
    conditions: ApiAlertCondition[],
    lastAlert: boolean,
    userName: string,
    deviceName: string
  ): any {
    //alertId will have been saved when we created the alert
    const alertId = getCreds(alertName).id;
    const expectedAlert = {
      id: alertId,
      name: alertName,
      alertName: getTestName(alertName),
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

    return(expectedAlert);
};

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
  expectedAlert:any 
) {
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
    `device.devicename should have been ${
      (expectedAlert.Device as any).devicename
    }`
  ).to.eq((expectedAlert.Device as any).devicename);
  return response;
}

export function getExpectedAlert(name: string): ApiAlert {
  return Cypress.env("testCreds")[name];
}

export function runReportStoppedDevicesScript() {
    if (Cypress.env("running_in_a_dev_environment") == true) {
      testRunOnApi('"cp /app/api/config/app_test_default.js /app/api/config/app.js"');
      testRunOnApi('"node --no-warnings=ExperimentalWarnings --experimental-json-modules /app/api/scripts/report-stopped-devices.js > log.log"');
    } else {
      testRunOnApi('"node --no-warnings=ExperimentalWarnings --experimental-json-modules /srv/cacophony/api/scripts/report-stopped-devices.js > log.log"');
    };
};

