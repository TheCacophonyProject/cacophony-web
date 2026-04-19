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
import { ApiAlertCondition, ApiAlertResponse } from "@typedefs/api/alerts";
import { AlertId, StationId } from "@typedefs/api/common";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Create an alert for a device. Optionally expect to fail with code: failCode
       */
      apiDeviceAlertAdd(
        userName: string,
        alertName: string,
        tag: ApiAlertCondition[],
        deviceName: string,
        frequency?: number,
        statusCode?: number,
      ): Cypress.Chainable<Cypress.Response<unknown>>;

      /**
       * Create an alert for a station. Optionally expect to fail with code: failCode
       */
      apiStationAlertAdd(
        userName: string,
        alertName: string,
        conditions: ApiAlertCondition[],
        stationId: number,
        frequency?: number,
        statusCode?: number,
      ): Cypress.Chainable<Cypress.Response<unknown>>;

      /**
       * Read alerts for a device
       * Optionally expect to fail with statusCode!=200
       * expectedAlert can be null if non-200 statusCode is supplied
       */
      apiDeviceAlertCheck(
        userName: string,
        deviceName: string,
        expectedAlert: ApiAlert,
        statusCode?: number,
      ): Cypress.Chainable<ApiAlertResponse[]>;

      /**
       * Read alerts for a station
       * Optionally expect to fail with statusCode!=200
       * expectedAlert can be null if non-200 statusCode is supplied
       */
      apiStationAlertCheck(
        userName: string,
        stationId: StationId,
        expectedAlert: ApiAlert,
        statusCode?: number,
      ): Cypress.Chainable<ApiAlertResponse>;
    }
  }
}

Cypress.Commands.add(
  "apiDeviceAlertAdd",
  (
    userName: string,
    alertName: string,
    conditions: ApiAlertCondition[],
    deviceName: string,
    frequency: number | null = null,
    statusCode = 200,
  ) => {
    logTestDescription(
      `Create alert ${getTestName(alertName)} for ${deviceName} `,
      {
        userName,
        deviceName,
        conditions,
        frequency,
        id: getTestName(alertName),
      },
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
      statusCode,
    ).then((response: Cypress.Response<{ id: AlertId }>) => {
      if (statusCode === null || statusCode == 200) {
        saveIdOnly(alertName, response.body.id);
        cy.wrap(response.body.id);
      }
    });
  },
);

Cypress.Commands.add(
  "apiStationAlertAdd",
  (
    userName: string,
    alertName: string,
    conditions: ApiAlertCondition[],
    stationId: number,
    frequency: number | null = null,
    statusCode = 200,
  ) => {
    logTestDescription(
      `Create alert ${getTestName(alertName)} for station ${stationId} `,
      {
        userName,
        stationId,
        conditions,
        frequency,
        id: getTestName(alertName),
      },
    );
    const alertJson = {
      name: getTestName(alertName),
      conditions,
      stationId,
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
      statusCode,
    ).then((response: Cypress.Response<{ id: AlertId }>) => {
      if (statusCode === null || statusCode == 200) {
        saveIdOnly(alertName, response.body.id);
        cy.wrap(response.body.id);
      }
    });
  },
);

Cypress.Commands.add(
  "apiDeviceAlertCheck",
  (
    userName: string,
    deviceName: string,
    expectedAlert: ApiAlert,
    statusCode = 200,
  ) => {
    logTestDescription(`Check for expected alert for ${deviceName} `, {
      userName,
      deviceName,
    });

    apiDeviceAlertsGet(userName, deviceName, statusCode).then(
      (response: Cypress.Response<{ alerts: ApiAlertResponse[] }>) => {
        if (statusCode == 200) {
          checkExpectedAlerts(response, expectedAlert);
          cy.wrap(response.body.alerts);
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiStationAlertCheck",
  (
    userName: string,
    stationId: StationId,
    expectedAlert: ApiAlert,
    statusCode = 200,
  ) => {
    logTestDescription(`Check for expected alert for stationId ${stationId} `, {
      userName,
      stationId,
    });

    apiStationAlertsGet(userName, stationId, statusCode).then(
      (response: Cypress.Response<{ alerts: ApiAlertResponse[] }>) => {
        if (statusCode == 200) {
          checkExpectedAlerts(response, expectedAlert);
          cy.wrap(response.body.alerts[0]);
        }
      },
    );
  },
);

export function createExpectedAlert(
  alertName: string,
  frequencySeconds: number,
  conditions: ApiAlertCondition[],
  hasLastAlert: boolean,
): ApiAlert {
  //alertId will have been saved when we created the alert
  const alertId = getCreds(alertName).id;
  return {
    id: alertId,
    name: alertName,
    alertName: getTestName(alertName),
    frequencySeconds,
    conditions,
    hasLastAlert,
  };
}

function apiDeviceAlertsGet(
  userName: string,
  deviceName: string,
  statusCode: number,
) {
  const deviceId = getCreds(deviceName).id;
  const params = {};

  return makeAuthorizedRequestWithStatus(
    { url: v1ApiPath(`alerts/device/${deviceId}`, params) },
    userName,
    statusCode,
  );
}

function apiStationAlertsGet(
  userName: string,
  stationId: StationId,
  statusCode: number,
) {
  const params = {};

  return makeAuthorizedRequestWithStatus(
    { url: v1ApiPath(`alerts/station/${stationId}`, params) },
    userName,
    statusCode,
  );
}

function checkExpectedAlerts(
  response: Cypress.Response<{ alerts: ApiAlertResponse[] }>,
  expectedAlert: ApiAlert,
) {
  expect(response.body.alerts.length, `Expected 1 alert`).to.eq(1);
  const thealert = response.body.alerts[0];

  expect(thealert.name, `Name should be ${expectedAlert.alertName}`).to.eq(
    expectedAlert.alertName,
  );
  expect(
    thealert.frequencySeconds,
    `frequencySeconds should have been ${expectedAlert.frequencySeconds}`,
  ).to.eq(expectedAlert.frequencySeconds);
  expect(
    thealert.conditions[0]["tag"],
    `conditions should have been ${expectedAlert.conditions[0]["tag"]}`,
  ).to.eq(expectedAlert.conditions[0].tag);
  expect(
    thealert.conditions[0].automatic,
    `conditions should have been ${expectedAlert.conditions[0].automatic}`,
  ).to.eq(expectedAlert.conditions[0].automatic);
  if (expectedAlert.hasLastAlert == false) {
    expect(thealert.lastAlert, `lastAlert should have been 'never'`).to.eq(
      "never",
    );
  } else {
    expect(thealert.lastAlert, `should have a lastAlert`).to.not.eq("never");
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
        '"cd api && node --no-warnings --disable-warning=ExperimentalWarning --loader esm-module-alias/loader /app/api/scripts/report-stopped-devices.js > log.log"',
        null,
        callback,
      ),
    );
  } else {
    testRunOnApi(
      '"node --no-warnings --disable-warning=ExperimentalWarning --loader /srv/cacophony/api/node_modules/esm-module-alias/loader /srv/cacophony/api/scripts/report-stopped-devices.js > log.log"',
      null,
      callback,
    );
  }
}
