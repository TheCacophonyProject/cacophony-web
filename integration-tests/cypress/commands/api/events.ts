import {
  checkFlatStructuresAreEqualExcept,
  checkTreeStructuresAreEqualExcept,
  getCreds,
  makeAuthorizedRequestWithStatus,
  removeUndefinedParams,
  sortArrayOn,
  v1ApiPath,
} from "../server";
import { logTestDescription } from "../descriptions";
import { getTestName } from "../names";
import { NOT_NULL, NOT_NULL_STRING } from "../constants";
import {
  ApiEventDetail,
  ApiEventErrorCategory,
  ApiEventSet,
  TestComparableEvent,
} from "../types";
import { DeviceEvent } from "@typedefs/api/event";
import {
  DeviceEventType,
  EventEnv,
  HttpStatusCode,
} from "@typedefs/api/consts";
import { DeviceId, IsoFormattedDateString } from "@typedefs/api/common";

export const EventTypes = {
  POWERED_ON: "rpi-power-on",
  POWERED_OFF: "daytime-power-off",
  STOP_REPORTED: "stop-reported",
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Record an event for this device using device's credentials
       * optionally, check for a non-200 status code returned
       */
      apiEventsAdd(
        deviceName: string,
        description?: ApiEventDetail,
        dates?: string[],
        eventDetailId?: number,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<number>;

      /**
       * Record an event for this device using user's credentials
       * optionally, check for a non-200 status code returned
       */
      apiEventsDeviceAddOnBehalf(
        userName: string,
        deviceIdOrName: string,
        description?: ApiEventDetail,
        dates?: string[],
        eventDetailId?: number,
        log?: boolean,
        statusCode?: HttpStatusCode,
      ): Chainable<number>;

      /**
       * Query events and check against expected
       * Optionally check for a non 200 returned statusCode
       * optionally exclude checks on values of specific keys (excludeCheckOn)
       * by default both returned events and expected events are sorted by date before comparison to ensure same order
       * Optionally: disable sorting with additionalChecks.doNotSort=true
       * Optionally: specify an additionalChecks.offset as a value to verify against the offset parameter in the returned results
       *   (defaults to 0)
       * Optionally: specify an additionalChecks.count as a value to verify against the count parameter in the returned results
       *   (defaults to the number of entries in ExpectedEvents)
       */
      apiEventsCheck(
        userName: string,
        deviceName: string,
        queryParams: {
          deviceId?: DeviceId;
          startTime?: IsoFormattedDateString;
          endTime?: IsoFormattedDateString;
          limit?: number;
          offset?: number;
          type?: string;
          latest?: boolean;
        },
        expectedEvents: DeviceEvent[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          doNotSort?: boolean;
          offset?: number;
          count?: number;
        },
      ): Chainable<void>;

      /**
       * Query errors and check against expected
       * Optionally check for a non 200 returned statusCode
       * optionally exclude checks on values of specific keys (excludeCheckOn)
       */
      apiEventsErrorsCheck(
        userName: string,
        deviceName: string,
        queryParams: { deviceId?: DeviceId },
        expectedErrors: ApiEventErrorCategory[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { count?: number },
      ): Chainable<void>;

      // *************************************************************************************************************************************
      // Remaining functions are legacy code from old tests and may one day be removed once these tests are migrated to use the above functions
      // *************************************************************************************************************************************
      /**
       * Legacy test function to check that this device is reported as stopped or not
       *
       */
      testPowerEventsCheckAgainstExpected(
        userName: string,
        deviceName: string,
        expectedEvent: TestComparablePowerEvent,
      ): Chainable<void>;

      /**
       * Legacy test function to check that this device has a matching event.
       * if supplied then Nth event will be checked where N is taken from eventNumber
       */
      testEventsCheckAgainstExpected(
        userName: string,
        deviceName: string,
        expectedEvent: DeviceEvent,
        eventNumber?: number,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "apiEventsAdd",
  (
    deviceName: string,
    description: ApiEventDetail,
    dates: string[] = [new Date().toISOString()],
    eventDetailId: number,
    log = true,
    statusCode = 200,
  ) => {
    const data: ApiEventSet = {
      dateTimes: dates,
      description: description,
      eventDetailId: eventDetailId,
    };
    logTestDescription(
      `Create event for ${deviceName} at ${dates}`,
      { data: data },
      log,
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("events"),
        body: data,
      },
      deviceName,
      statusCode,
    ).then((response: Cypress.Response<{ eventDetailId: number }>) => {
      cy.wrap(response.body.eventDetailId);
    });
  },
);

Cypress.Commands.add(
  "apiEventsDeviceAddOnBehalf",
  (
    userName: string,
    deviceIdOrName: string,
    description?: ApiEventDetail,
    dates: string[] = [new Date().toISOString()],
    eventDetailId?: number,
    log = true,
    statusCode = 200,
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
      log,
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`events/device/${deviceId}`),
        body: data,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ eventDetailId: number }>) => {
      cy.wrap(response.body.eventDetailId);
    });
  },
);

Cypress.Commands.add(
  "apiEventsErrorsCheck",
  (
    userName: string,
    deviceName: string,
    queryParams: { deviceId?: DeviceId },
    expectedErrors: ApiEventErrorCategory[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { count?: number } = {},
  ) => {
    logTestDescription(`Check for expected errors for ${deviceName} `, {
      userName,
      deviceName,
    });

    // by default count=expected event count, but can specify manually
    let count = additionalChecks.count;
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
      statusCode,
    ).then((response: Cypress.Response<{ rows: ApiEventErrorCategory[] }>) => {
      if (statusCode === 200) {
        const errors = response.body.rows;
        const errorCategories = Object.keys(errors);
        //check the right number of error categories is present
        expect(
          errorCategories.length,
          `Expect there to be ${expectedErrors.length} error categories`,
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
            "devices in category",
          ).to.equal(JSON.stringify(expectedCategory.devices));
          //check list of errors
          expect(
            category.errors.length,
            "Number of errors in category should be as expected",
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
              JSON.stringify(expectedError.devices),
            );
            //check timestamp
            expect(
              JSON.stringify(error.timestamps),
              "timestamps in error",
            ).to.equal(JSON.stringify(expectedError.timestamps));
            //check similar list
            expect(
              error.similar.length,
              "Number of similar in error should be as expected",
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
                `device for similar entry ${similarCount}`,
              ).to.equal(expectedSimilar.device);
              //check timestamp
              expect(
                similar.timestamp,
                `timestamp for similar entry ${similarCount}`,
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
  },
);

Cypress.Commands.add(
  "apiEventsCheck",
  (
    userName: string,
    deviceName: string,
    queryParams: { deviceId?: DeviceId },
    expectedEvents: DeviceEvent[],
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: {
      doNotSort?: boolean;
      offset?: number;
      count?: number;
    } = {},
  ) => {
    logTestDescription(`Check for expected events for ${deviceName} `, {
      userName,
      deviceName,
    });
    const doNotSort = additionalChecks.doNotSort;
    const offset = additionalChecks.offset | 0;
    let sortEvents: DeviceEvent[];
    let sortExpectedEvents: DeviceEvent[];

    // by default count=expected event count, but can specify manually
    let count = additionalChecks.count;
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          rows: DeviceEvent[];
          count?: number;
          offset: number;
          limit: number;
        }>,
      ) => {
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
            excludeCheckOn,
          );
        }
      },
    );
  },
);

Cypress.Commands.add(
  "testEventsCheckAgainstExpected",
  (
    userName: string,
    deviceName: string,
    expectedEvent: DeviceEvent,
    eventNumber = 1,
    statusCode = 200,
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
      statusCode,
    );
  },
);

export function createExpectedEvent(
  deviceName: string,
  recording: string,
  alertName: string,
) {
  const expectedEvent: DeviceEvent = {
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
    env: EventEnv.Unknown,
    Device: { deviceName: getTestName(getCreds(deviceName).name) },
  };
  return expectedEvent;
}

function checkEvents(
  userName: string,
  deviceName: string,
  expectedEvent: TestComparableEvent,
  eventNumber: number,
  ignoreParams: string[],
  statusCode: number,
) {
  const params = {
    deviceId: getCreds(deviceName).id,
  };

  makeAuthorizedRequestWithStatus(
    { url: v1ApiPath("events", params) },
    userName,
    statusCode,
  ).then((response: Cypress.Response<{ rows: DeviceEvent[] }>) => {
    if (statusCode === 200) {
      expect(response.body.rows.length).to.equal(eventNumber);
      if (eventNumber > 0) {
        //check the event matches (note 0 index so no-1)
        checkEventMatchesExpected(
          response.body.rows,
          expectedEvent,
          eventNumber - 1,
          ignoreParams,
        );
      }
    }
  });
}

function checkEventMatchesExpected(
  events: DeviceEvent[],
  expectedEvent: TestComparableEvent,
  eventNumber: number,
  ignoreParams: string[],
) {
  const event = events[eventNumber];

  expect(
    event.DeviceId.toString(),
    `DeviceId should be ${expectedEvent.DeviceId}`,
  ).to.eq(expectedEvent.DeviceId.toString());
  if (!ignoreParams.includes("dateTime")) {
    expect(
      event.dateTime,
      `dateTime should be ${expectedEvent.dateTime}`,
    ).to.eq(expectedEvent.dateTime);
  }
  expect(
    event.Device.deviceName,
    `deviceName should be ${expectedEvent.Device.deviceName}`,
  ).to.eq(expectedEvent.Device.deviceName);
  expect(
    event.EventDetail.type,
    `Type should be ${expectedEvent.EventDetail.type}`,
  ).to.eq(expectedEvent.EventDetail.type);

  // check details except for success (email sent - not implemented on dev servers), and trackId - as we haven't stored this
  if (expectedEvent.EventDetail.details !== undefined) {
    checkFlatStructuresAreEqualExcept(
      expectedEvent.EventDetail.details,
      event.EventDetail.details,
      ignoreParams,
    );
  }
}

export function testCreateExpectedEvent(
  deviceName: string,
  eventDetail: {
    type: DeviceEventType;
    details: object;
  },
) {
  const expectedEvent: DeviceEvent = {
    id: NOT_NULL,
    dateTime: NOT_NULL_STRING,
    createdAt: NOT_NULL_STRING,
    DeviceId: getCreds(deviceName).id,
    EventDetail: eventDetail,
    Device: { deviceName: getTestName(deviceName) },
    env: EventEnv.Unknown,
  };
  return expectedEvent;
}

export function getExpectedEvent(name: string): TestComparableEvent {
  return Cypress.env("testCreds")[name];
}
