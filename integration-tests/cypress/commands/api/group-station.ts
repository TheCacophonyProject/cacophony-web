import { checkRecording } from "./recording-tests";
import { ApiStationData } from "../types";
import { ApiStationResponse } from "@typedefs/api/station";
import { getTestName } from "../names";
import { logTestDescription, prettyLog } from "../descriptions";
import {
  makeAuthorizedRequestWithStatus,
  saveIdOnly,
  v1ApiPath,
  sortArrayOnHash,
  checkTreeStructuresAreEqualExcept,
} from "../server";
import { RecordingId, StationId } from "@typedefs/api/common";
import { HttpStatusCode } from "@shared/api/consts";
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * POST to api/v1/groups/<groupidorname>/station to add a single station
       * Optionally check for fail response (statusCode!=200)
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       */

      apiGroupStationAdd(
        userName: string,
        groupIdOrName: string,
        station: ApiStationData,
        fromDate?: string,
        untilDate?: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawGroupName?: boolean;
          useRawStationName?: boolean;
          messages?: string[];
          warnings?: string[] | string;
        },
      ): Cypress.Chainable<StationId>;

      /**
       * Call api/v1/groups/<groupidorname>/station and check that returned values match expectedS  tation
       * Optionally check for fail response (statusCode!=200)
       * By default stationName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       * Optionally: use the raw stationName provided (additionalChecks["useRawStationName"]=true)
       */
      apiGroupStationCheck(
        userName: string,
        groupIdOrName: string,
        stationName: string,
        expectedStation: ApiStationResponse,
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawStationName?: boolean;
          useRawGroupName?: boolean;
          additionalParams?: object;
        },
      ): Chainable<StationId>;

      /**
       * Call api/v1/groups/<groupidorname>/stations and check that returned values match expectedS  tations
       * Optionally check for fail response (statusCode!=200)
       * By default userName and groupName are converted into unique (for this test run) names.
       * Optionally: use the raw groupName provided (additionalChecks["useRawGroupName"]=true)
       * By default stations and expectedStations are sorted on userName before comparison
       * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true  )
       */
      apiGroupStationsCheck(
        userName: string,
        groupIdOrName: string,
        expectedStations: ApiStationResponse[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawGroupName?: boolean;
          additionalParams?: object;
        },
      ): Chainable<void>;

      // to be run straight after an apiRecordingAdd
      // check that the recording has been assigned the right station name. sS
      thenCheckStationNameIs(
        userName: string,
        station: string,
      ): Chainable<void>;
      thenCheckStationIdIs(
        userName: string,
        stationId: number,
      ): Chainable<{ name: string; id: StationId }>;
      thenCheckStationIsNew(
        userName: string,
      ): Chainable<{ name: string; id: StationId }>;
    }
  }
}

Cypress.Commands.add(
  "apiGroupStationAdd",
  (
    userName: string,
    groupIdOrName: string,
    station: ApiStationData,
    fromDate?: string,
    untilDate?: string,
    statusCode = 200,
    additionalChecks: {
      useRawGroupName?: boolean;
      useRawStationName?: boolean;
      messages?: string[];
      warnings?: string[] | string;
    } = {},
  ) => {
    let fullGroupName: string;
    const thisStation = JSON.parse(JSON.stringify(station));

    //Make group name unique unless we're asked not to
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }

    //Make station name unique unless we're asked not to
    if (additionalChecks.useRawStationName !== true) {
      thisStation.name = getTestName(thisStation.name);
    }

    logTestDescription(
      `Add station ${prettyLog(station)} to group '${groupIdOrName}' `,
      { userName, groupIdOrName, thisStation, fromDate, untilDate },
    );

    const body: Record<string, string> = {
      station: JSON.stringify(thisStation),
    };
    if (fromDate !== undefined) {
      body["from-date"] = fromDate;
    }
    if (untilDate !== undefined) {
      body["until-date"] = untilDate;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`groups/${fullGroupName}/station`),
        body,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          warnings: string[];
          messages: string[];
          stationId: StationId;
        }>,
      ) => {
        if (additionalChecks.warnings) {
          if (additionalChecks.warnings === "none") {
            expect(response.body.warnings).to.be.undefined;
          } else {
            const warnings = response.body.warnings;
            const expectedWarnings = additionalChecks.warnings as string[];
            expect(warnings).to.exist;
            expectedWarnings.forEach(function (warning: string) {
              expect(warnings, "Expect warning to be present").to.contain(
                warning,
              );
            });
          }
        }
        if (additionalChecks.messages) {
          const messages = response.body.messages;
          const expectedMessages = additionalChecks.messages;
          expect(messages).to.exist;
          expectedMessages.forEach(function (message: string) {
            expect(messages, "Expect message to be present").to.contain(
              message,
            );
          });
        }

        if (statusCode == 200) {
          //store station Id against name
          const stationName = thisStation.name;
          const stationId = response.body.stationId;
          saveIdOnly(stationName, stationId);
          cy.wrap(stationId);
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiGroupStationCheck",
  (
    userName: string,
    groupIdOrName: string,
    stationName: string,
    expectedStation: ApiStationResponse,
    excludeCheckOn: string[] = [
      ".lastActiveThermalTime",
      ".earliestThermalRecordingTime",
      ".earliestAudioRecordingTime",
      ".lastActiveAudioTime",
    ],
    statusCode = 200,
    additionalChecks: {
      useRawStationName?: boolean;
      useRawGroupName?: boolean;
      additionalParams?: object;
    } = {},
  ) => {
    logTestDescription(
      `Check station ${stationName} for group ${groupIdOrName}`,
      {
        userName,
        groupIdOrName,
      },
    );
    let fullGroupName: string;
    let fullStationName: string;

    //Make station name unique unless we're asked not to
    if (additionalChecks.useRawStationName === true) {
      fullStationName = stationName;
    } else {
      fullStationName = getTestName(stationName);
    }

    //Make group name unique unless we're asked not to
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }
    let params = {};
    if (additionalChecks.additionalParams !== undefined) {
      params = { ...params, ...additionalChecks.additionalParams };
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(
          `groups/${fullGroupName}/station/${fullStationName}`,
          params,
        ),
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ station: ApiStationResponse }>) => {
      if (statusCode === 200) {
        checkTreeStructuresAreEqualExcept(
          expectedStation,
          response.body.station,
          excludeCheckOn,
        );
        cy.wrap(response.body.station.id);
      }
    });
  },
);

// Legacy test functions used in /recordings. To be retired and replaces with standard-format API wrappers.

Cypress.Commands.add(
  "apiGroupStationsCheck",
  (
    userName: string,
    groupIdOrName: string,
    expectedStations: ApiStationResponse[],
    excludeCheckOn: string[] = [
      ".lastActiveThermalTime",
      ".lastActiveAudioTime",
      "[].lastActiveThermalTime",
      ".earliestThermalRecordingTime",
      ".earliestAudioRecordingTime",
      "[].earliestThermalRecordingTime",
      "[].earliestAudioRecordingTime",
    ],
    statusCode = 200,
    additionalChecks: {
      useRawGroupName?: boolean;
      additionalParams?: object;
    } = {},
  ) => {
    logTestDescription(`Check stations for group ${groupIdOrName}`, {
      userName,
      groupIdOrName,
    });
    let fullGroupName: string;
    let sortStations: ApiStationResponse[];
    let sortExpectedStations: ApiStationResponse[];

    //Make group name unique unless we're asked not to
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }

    let params = {};
    if (additionalChecks.additionalParams !== undefined) {
      params = { ...params, ...additionalChecks.additionalParams };
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`groups/${fullGroupName}/stations`, params),
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ stations: ApiStationResponse[] }>) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, deviceName, userName, userId is mandatory in expectedGroup)
        if (additionalChecks["doNotSort"] === true) {
          sortStations = response.body.stations;
          sortExpectedStations = expectedStations;
        } else {
          sortStations = sortArrayOnHash(response.body.stations, "location");
          sortExpectedStations = sortArrayOnHash(expectedStations, "location");
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedStations,
          sortStations,
          excludeCheckOn,
        );
      }
    });
  },
);

// Legacy test functions used in /recordings. To be retired and replaces with standard-format API wrappers.

Cypress.Commands.add(
  "thenCheckStationNameIs",
  { prevSubject: true },
  (subject: RecordingId, userName: string, station: string) => {
    checkStationNameIs(userName, subject, station);
  },
);

Cypress.Commands.add(
  "thenCheckStationIdIs",
  { prevSubject: true },
  (subject: RecordingId, userName: string, stationId: number) => {
    checkStationIdIs(userName, subject, stationId);
  },
);

Cypress.Commands.add(
  "thenCheckStationIsNew",
  { prevSubject: true },
  (subject: RecordingId, userName: string) => {
    checkRecording(userName, subject, (recording) => {
      expect(recording.stationName).contains("New location for ");
      expect(recording.stationName).contains(recording.recordingDateTime);
      saveIdOnly(recording.stationName, recording.stationId);
      return { id: recording.stationId, name: recording.stationName };
    });
  },
);

function checkStationNameIs(userName: string, recId: number, station: string) {
  const text =
    station === ""
      ? "not assigned to a station"
      : `assigned to station '${station}'`;
  logTestDescription(`and check recording is ${text}`, {
    userName,
  });
  checkRecording(userName, recId, (recording) => {
    if (recording.stationName) {
      expect(recording.stationName).equals(station);
    } else {
      expect("").equals(station);
    }
    return { id: recording.stationId, name: recording.stationName };
  });
}

function checkStationIdIs(userName: string, recId: number, stationId: number) {
  logTestDescription(
    `and check recording is assigned to station ${stationId}`,
    {
      userName,
    },
  );
  checkRecording(userName, recId, (recording) => {
    expect(recording.stationId).equals(stationId);
    return { id: recording.stationId, name: recording.stationName };
  });
}
