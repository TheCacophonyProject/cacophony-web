import {
  v1ApiPath,
  getCreds,
  makeAuthorizedRequest,
  makeAuthorizedRequestWithStatus,
  sortArrayOn,
  checkTreeStructuresAreEqualExcept,
  checkFlatStructuresAreEqualExcept,
  removeUndefinedParams,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { getTestName } from "../names";
import { NOT_NULL, NOT_NULL_STRING } from "../constants";
import {
  TestComparableEvent,
  TestComparablePowerEvent,
  ApiEventDetail,
  ApiEventSet,
  ApiEventReturned,
  ApiEventErrorCategory,
  ApiPowerEventReturned,
} from "../types";
export const EventTypes = {
  POWERED_ON: "rpi-power-on",
  POWERED_OFF: "daytime-power-off",
  STOP_REPORTED: "stop-reported",
};

Cypress.Commands.add(
  "apiEventsAdd",
  (
    deviceName: string,
    description: ApiEventDetail,
    dates: string[] = [new Date().toISOString()],
    eventDetailId: number,
    log: boolean = true,
    statusCode: number = 200
  ) => {
    const data: ApiEventSet = {
      dateTimes: dates,
      description: description,
      eventDetailId: eventDetailId,
    };
    logTestDescription(
      `Create event for ${deviceName} at ${dates}`,
      { data: data },
      log
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("events"),
        body: data,
      },
      deviceName,
      statusCode
    ).then((response) => {
      cy.wrap(response.body.eventDetailId);
    });
  }
);

Cypress.Commands.add(
  "apiEventsDeviceAddOnBehalf",
  (
    userName: string,
    deviceIdOrName: string,
    description?: ApiEventDetail,
    dates: string[] = [new Date().toISOString()],
    eventDetailId?: number,
    log: boolean = true,
    statusCode: number = 200
  ) => {
    let deviceId: string;
    const data: ApiEventSet = {
      dateTimes: dates,
      description: description,
      eventDetailId: eventDetailId,
    };
    //look up device name in records, use raw value if not there
    if (getCreds(deviceIdOrName) !== undefined) {
      deviceId = getCreds(deviceIdOrName).id.toString();
    } else {
      deviceId = deviceIdOrName;
    }

    logTestDescription(
      `Create event for ${deviceIdOrName} at ${dates}`,
      { data: data },
      log
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`events/device/${deviceId}`),
        body: data,
      },
      userName,
      statusCode
    ).then((response) => {
      cy.wrap(response.body.eventDetailId);
    });
  }
);

Cypress.Commands.add(
  "apiEventsErrorsCheck",
  (
    userName: string,
    deviceName: string,
    queryParams: any,
    expectedErrors: ApiEventErrorCategory[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check for expected errors for ${deviceName} `, {
      userName,
      deviceName,
    });

    // by default count=expected event count, but can specify manually
    let count = additionalChecks["count"];
    if (count == undefined) {
      count = expectedErrors.length;
    }

    // add deviceId to params unless already defined
    if (queryParams.deviceId === undefined && deviceName !== undefined) {
      queryParams.deviceId = getCreds(deviceName).id;
    }

    //drop any undefined parameters
    const filteredParams = removeUndefinedParams(queryParams);

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: v1ApiPath("events/errors/", filteredParams) },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        const errors = response.body.rows;
        const errorCategories = Object.keys(errors);
        //check the right number of error categories is present
        expect(
          errorCategories.length,
          `Expect there to be ${expectedErrors.length} error categories`
        ).to.equal(expectedErrors.length);

        //then check that each expected category is present
        for (let catCount = 0; catCount < expectedErrors.length; catCount++) {
          const category = errors[errorCategories[catCount]];
          const expectedCategory = expectedErrors[catCount];
          expect(errorCategories[catCount]).to.equal(expectedCategory.name);
          expect(category.name).to.equal(expectedCategory.name);

          //check list of devices
          expect(
            JSON.stringify(category.devices),
            "devices in category"
          ).to.equal(JSON.stringify(expectedCategory.devices));
          //check list of errors
          expect(
            category.errors.length,
            "Number of errors in category should be as expected"
          ).to.equal(expectedCategory.errors.length);
          //for each error in list
          for (
            let errorCount = 0;
            errorCount < expectedCategory.errors.length;
            errorCount++
          ) {
            const error = category.errors[errorCount];
            const expectedError = expectedCategory.errors[errorCount];

            //check device list
            expect(JSON.stringify(error.devices), "devices in error").to.equal(
              JSON.stringify(expectedError.devices)
            );
            //check timestamp
            expect(
              JSON.stringify(error.timestamps),
              "timestamps in error"
            ).to.equal(JSON.stringify(expectedError.timestamps));
            //check similar list
            expect(
              error.similar.length,
              "Number of similar in error should be as expected"
            ).to.equal(expectedError.similar.length);
            //for each similar error
            for (
              let similarCount = 0;
              similarCount < expectedError.similar.length;
              similarCount++
            ) {
              const similar = error.similar[similarCount];
              const expectedSimilar = expectedError.similar[similarCount];
              //check device
              expect(
                similar.device,
                `device for similar entry ${similarCount}`
              ).to.equal(expectedSimilar.device);
              //check timestamp
              expect(
                similar.timestamp,
                `timestamp for similar entry ${similarCount}`
              ).to.equal(expectedSimilar.timestamp);
              //TODO: check lines
            }
            //check pattern list
            if (expectedError.patterns !== undefined) {
              expect(error.patterns, "Expect patterns in error").to.exist;
            } else {
              expect(error.patterns, "Expect no patterns in error").to.be
                .undefined;
            }
            //TODO: for each pattern in list
            //check score
            //check index
            //check patterns
          }
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiEventsCheck",
  (
    userName: string,
    deviceName: string,
    queryParams: any,
    expectedEvents: ApiEventReturned[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check for expected events for ${deviceName} `, {
      userName,
      deviceName,
    });
    const doNotSort = additionalChecks["doNotSort"];
    const offset = additionalChecks["offset"] | 0;
    let sortEvents: ApiEventReturned[];
    let sortExpectedEvents: ApiEventReturned[];

    // by default count=expected event count, but can specify manually
    let count = additionalChecks["count"];
    if (count == undefined) {
      count = expectedEvents.length;
    }

    // add deviceId to params unless already defined
    if (queryParams.deviceId === undefined && deviceName !== undefined) {
      queryParams.deviceId = getCreds(deviceName).id;
    }

    //drop any undefined parameters
    const filteredParams = removeUndefinedParams(queryParams);

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: v1ApiPath("events/", filteredParams) },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means dateTime is mandatory in expectedEvents)
        if (doNotSort === true) {
          sortEvents = response.body.rows;
          sortExpectedEvents = expectedEvents;
        } else {
          sortEvents = sortArrayOn(response.body.rows, "dateTime");
          sortExpectedEvents = sortArrayOn(expectedEvents, "dateTime");
        }
        expect(response.body.offset, "Expect offset to be:").to.equal(offset);
        expect(response.body.count, "Expect count to be:").to.equal(count);
        checkTreeStructuresAreEqualExcept(
          sortExpectedEvents,
          sortEvents,
          excludeCheckOn
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiPowerEventsCheck",
  (
    userName: string,
    deviceName: string,
    queryParams: any,
    expectedEvents: ApiPowerEventReturned[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check for expected power events for ${deviceName} `, {
      userName,
      deviceName,
    });

    // add deviceId to params unless already defined
    if (queryParams.deviceId === undefined && deviceName !== undefined) {
      queryParams.deviceId = getCreds(deviceName).id;
    }

    //drop any undefined parameters
    const filteredParams = removeUndefinedParams(queryParams);

    //send the request
    makeAuthorizedRequestWithStatus(
      { url: v1ApiPath("events/powerEvents", filteredParams) },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        checkTreeStructuresAreEqualExcept(
          expectedEvents,
          response.body.events,
          excludeCheckOn
        );
      }
    });
  }
);

Cypress.Commands.add(
  "testPowerEventsCheckAgainstExpected",
  (
    userName: string,
    deviceName: string,
    expectedEvent: TestComparablePowerEvent
  ) => {
    logTestDescription(
      `Check power events for ${deviceName} is ${prettyLog(expectedEvent)}}`,
      {
        userName,
        deviceName,
        expectedEvent,
      }
    );

    checkPowerEvents(userName, deviceName, expectedEvent);
  }
);

Cypress.Commands.add(
  "testEventsCheckAgainstExpected",
  (
    userName: string,
    deviceName: string,
    expectedEvent: any,
    eventNumber: number = 1,
    statusCode: number = 200
  ) => {
    logTestDescription(`Check for expected event for ${deviceName} `, {
      userName,
      deviceName,
      eventNumber,
    });

    checkEvents(
      userName,
      deviceName,
      expectedEvent,
      eventNumber,
      ["success", "trackId", "dateTime"],
      statusCode
    );
  }
);

export function createExpectedEvent(
  deviceName: string,
  recording: string,
  alertName: string
): any {
  const expectedEvent = {
    id: 1,
    dateTime: "2021-05-19T01:39:41.376Z",
    createdAt: "2021-05-19T01:39:41.771Z",
    DeviceId: getCreds(deviceName).id,
    EventDetail: {
      type: "alert",
      details: {
        recId: getCreds(recording).id,
        alertId: getCreds(alertName).id,
        success: true,
        trackId: 1,
      },
    },
    Device: { deviceName: getTestName(getCreds(deviceName).name) },
  };
  return expectedEvent;
}

function checkPowerEvents(
  userName: string,
  deviceName: string,
  expectedEvent: TestComparablePowerEvent
) {
  const params = {
    deviceId: getCreds(deviceName).id,
  };

  makeAuthorizedRequest(
    { url: v1ApiPath("events/powerEvents", params) },
    userName
  ).then((response) => {
    checkPowerEventMatches(response, expectedEvent);
  });
}

function checkEvents(
  userName: string,
  deviceName: string,
  expectedEvent: any,
  eventNumber: number,
  ignoreParams: string[],
  statusCode: number
) {
  const params = {
    deviceId: getCreds(deviceName).id,
  };

  makeAuthorizedRequestWithStatus(
    { url: v1ApiPath("events", params) },
    userName,
    statusCode
  ).then((response) => {
    if (statusCode === 200) {
      expect(response.body.rows.length).to.equal(eventNumber);
      if (eventNumber > 0) {
        //check the event matches (note 0 index so no-1)
        checkEventMatchesExpected(
          response.body.rows,
          expectedEvent,
          eventNumber - 1,
          ignoreParams
        );
      }
    }
  });
}

function checkEventMatchesExpected(
  events: any[],
  expectedEvent: TestComparableEvent,
  eventNumber: number,
  ignoreParams: any
) {
  const event = events[eventNumber];

  expect(
    event.DeviceId.toString(),
    `DeviceId should be ${expectedEvent.DeviceId}`
  ).to.eq(expectedEvent.DeviceId.toString());
  if (!ignoreParams.includes("dateTime")) {
    expect(
      event.dateTime,
      `dateTime should be ${expectedEvent.dateTime}`
    ).to.eq(expectedEvent.dateTime);
  }
  expect(
    event.Device.deviceName,
    `deviceName should be ${expectedEvent.Device.deviceName}`
  ).to.eq(expectedEvent.Device.deviceName);
  expect(
    event.EventDetail.type,
    `Type should be ${expectedEvent.EventDetail.type}`
  ).to.eq(expectedEvent.EventDetail.type);

  // check details except for success (email sent - not implemented on dev servers), and trackId - as we haven't stored this
  if (expectedEvent.EventDetail.details !== undefined) {
    checkFlatStructuresAreEqualExcept(
      expectedEvent.EventDetail.details,
      event.EventDetail.details,
      ignoreParams
    );
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

export function testCreateExpectedEvent(deviceName: string, eventDetail: any) {
  const expectedEvent = {
    id: NOT_NULL,
    dateTime: NOT_NULL_STRING,
    createdAt: NOT_NULL_STRING,
    DeviceId: getCreds(deviceName).id,
    EventDetail: eventDetail,
    Device: { deviceName: getTestName(deviceName) },
  };
  return expectedEvent;
}

export function getExpectedEvent(name: string): TestComparableEvent {
  return Cypress.env("testCreds")[name];
}
