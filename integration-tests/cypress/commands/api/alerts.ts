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
      conditions,
      deviceId,
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
  }
);

Cypress.Commands.add(
  "apiAlertCheck",
  (
    userName: string,
    deviceName: string,
    expectedAlert: any,
    statusCode: number = 200
  ) => {
    logTestDescription(`Check for expected alert for ${deviceName} `, {
      userName,
      deviceName,
    });

    apiAlertsGet(userName, deviceName, statusCode).then((response) => {
      if (statusCode == 200) {
        checkExpectedAlerts(response, expectedAlert);
      }
    });
  }
);

export function createExpectedAlert(
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
    frequencySeconds,
    conditions,
    lastAlert,
  };

  return expectedAlert;
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
  expectedAlert: any
) {
  expect(response.body.alerts.length, `Expected 1 alert`).to.eq(1);
  const thealert = response.body.alerts[0];

  expect(thealert.name, `Name should be ${expectedAlert.alertName}`).to.eq(
    expectedAlert.alertName
  );
  expect(
    thealert.frequencySeconds,
    `frequencySeconds should have been ${expectedAlert.frequencySeconds}`
  ).to.eq(expectedAlert.frequencySeconds);
  expect(
    thealert.conditions[0]["tag"],
    `conditions should have been ${expectedAlert.conditions[0]["tag"]}`
  ).to.eq(expectedAlert.conditions[0].tag);
  expect(
    thealert.conditions[0].automatic,
    `conditions should have been ${expectedAlert.conditions[0].automatic}`
  ).to.eq(expectedAlert.conditions[0].automatic);
  if (expectedAlert.lastAlert == false) {
    expect(thealert.lastAlert, `lastAlert should have been null `).to.eq(null);
  } else {
    expect(thealert.lastAlert, `should have a lastAlert`).to.not.eq(null);
  }
  return response;
}

export function getExpectedAlert(name: string): ApiAlert {
  return Cypress.env("testCreds")[name];
}

export function runReportStoppedDevicesScript(callback) {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    cy.log("runReportStoppedDevicesScript");
    testRunOnApi(
      '"cp /app/api/config/app_test_default.js /app/api/config/app.js"',
      null,
      testRunOnApi(
        '"node --no-warnings=ExperimentalWarnings --experimental-json-modules /app/api/scripts/report-stopped-devices.js > log.log"',
        null,
        callback
      )
    );
  } else {
    testRunOnApi(
      '"node --no-warnings=ExperimentalWarnings --experimental-json-modules /srv/cacophony/api/scripts/report-stopped-devices.js > log.log"',
      null,
      callback
    );
  }
}
