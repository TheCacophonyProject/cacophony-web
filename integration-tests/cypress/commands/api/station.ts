import { ApiStationData } from "../types";
import { ApiStationResponse } from "@typedefs/api/station";
import { getTestName } from "../names";
import { logTestDescription, prettyLog } from "../descriptions";
import {
  checkMessages,
  checkTreeStructuresAreEqualExcept,
  checkWarnings,
  getCreds,
  makeAuthorizedRequestWithStatus,
  saveIdOnly,
  sortArrayOn,
  v1ApiPath,
} from "../server";
import { HttpStatusCode } from "@typedefs/api/consts";
import { IsoFormattedDateString, StationId } from "@shared/api/common";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * GET to api/v1/stations to retrieve all stations for current user
       * Check returned data matches expectedStations
       * Optionally: disable sorting of arrays before comparing (additionalChecks["doNotSort"]=true)
       * Optionally check for fail response (statusCode!=200)
       * Optionally: check for returned additionalChecks["messages"]
       * Optionally: check for returned additionalChecks["warnings"]
       */
      apiStationsCheck(
        userName: string,
        expectedStations: ApiStationResponse[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          additionalParams?: object;
          doNotSort?: boolean;
          warnings?: string[];
          messages?: string[];
        },
      ): Chainable<void>;

      /**
       * GET to api/v1/stations/:stationId to retrieve a single station
       * Check returned data matches expectedStation
       * Optionally check for fail response (statusCode!=200)
       * By default stationId is looked up from name in stationIdOrName.
       * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
       * Optionally: check for returned additionalChecks["messages"]
       * Optionally: check for returned additionalChecks["warnings"]
       */
      apiStationCheck(
        userName: string,
        stationIdOrName: string,
        expectedStation: ApiStationResponse,
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawStationId?: boolean;
          additionalParams?: object;
          warnings?: string[];
          messages?: string[];
        },
      ): Chainable<void>;

      /**
       * PATCH to api/v1/stations/:stationId to update a single station
       * Optionally check for fail response (statusCode!=200)
       * By default stationId is looked up from name in stationIdOrName.
       * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
       * Optionally: check for returned additionalChecks["messages"]
       * Optionally: check for returned additionalChecks["warnings"]
       */
      apiStationUpdate(
        userName: string,
        stationIdOrName: string,
        stationUpdates: ApiStationData,
        fromDate?: string,
        untilDate?: string,
        retire?: boolean,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawStationId?: boolean;
          useRawStationName?: boolean;
          warnings?: string[] | "none";
          messages?: string[];
        },
      ): Chainable<void>;

      /**
       * DELETE to api/v1/stations/:stationId to delete a single station
       * Optionally check for fail response (statusCode!=200)
       * By default deleteRecordings is passed as true.
       * By default stationId is looked up from name in stationIdOrName.
       * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
       * Optionally: check for returned additionalChecks["messages"]
       * Optionally: check for returned additionalChecks["warnings"]
       */
      apiStationDelete(
        userName: string,
        stationIdOrName: string,
        deleteRecordings?: boolean,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawStationId?: boolean;
          warnings?: string[];
          messages?: string[];
        },
      ): Chainable<void>;

      /** Shortcut to apiStationUpdate which only sets the untilDate
       * (retirementDate)
       */
      testStationRetire(
        userName: string,
        stationIdOrName: string,
        retirementDate?: IsoFormattedDateString,
        additionalChecks?: { useRawStationId?: boolean },
      ): Cypress.Chainable<void>;

      /**
       * PATCH to api/v1/stations/:stationId/name to update station name
       * Optionally check for fail response (statusCode!=200)
       * By default stationId is looked up from name in stationIdOrName.
       * Optionally: use the raw stationId provided (additionalChecks["useRawStationId"]=true)
       * By default the newName is made unique by adding test prefix.
       * Optionally: use the raw newName provided (additionalChecks["useRawStationName"]=true)
       * Optionally: check for returned additionalChecks["messages"]
       * Optionally: check for returned additionalChecks["warnings"]
       */
      apiStationUpdateName(
        userName: string,
        stationIdOrName: string,
        newName: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawStationId?: boolean;
          useRawStationName?: boolean;
          message?: string;
          warnings?: string[] | string;
          messages?: string[];
        },
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "apiStationsCheck",
  (
    userName: string,
    expectedStations: ApiStationResponse[],
    excludeCheckOn: string[] = [
      "lastActiveThermalTime",
      "lastActiveAudioTime",
      "[].lastActiveThermalTime",
      "[].lastActiveAudioTime",
      "[].earliestAudioRecordingTime",
      ".earliestAudioRecordingTime",
      "[].earliestThermalRecordingTime",
      ".earliestThermalRecordingTime",
    ],
    statusCode = 200,
    additionalChecks: {
      additionalParams?: object;
      doNotSort?: boolean;
      warnings?: string[];
      messages?: string[];
    } = {},
  ) => {
    logTestDescription(`Check stations for ${userName}`, {
      userName,
    });

    let params = {};
    if (additionalChecks.additionalParams !== undefined) {
      params = { ...params, ...additionalChecks.additionalParams };
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`stations`, params),
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          warnings?: string[];
          messages: string[];
          stations: ApiStationResponse[];
        }>,
      ) => {
        if (statusCode === 200) {
          let sortStations: ApiStationResponse[] = [];
          let sortExpectedStations: ApiStationResponse[] = [];
          if (additionalChecks.doNotSort === true) {
            sortStations = response.body.stations;
            sortExpectedStations = expectedStations;
          } else {
            sortStations = sortArrayOn(response.body.stations, "stationName");
            sortExpectedStations = sortArrayOn(expectedStations, "stationName");
          }

          checkTreeStructuresAreEqualExcept(
            sortExpectedStations,
            sortStations,
            excludeCheckOn,
          );
        }
        if (additionalChecks.warnings) {
          const warnings = response.body.warnings;
          const expectedWarnings = additionalChecks.warnings;
          expect(warnings).to.exist;
          expectedWarnings.forEach(function (warning: string) {
            expect(warnings, "Expect warning to be present").to.contain(
              warning,
            );
          });
        }
        if (additionalChecks.messages) {
          checkMessages(response, additionalChecks.messages);
        }
      },
    );
  },
);
Cypress.Commands.add(
  "apiStationCheck",
  (
    userName: string,
    stationIdOrName: string,
    expectedStation: ApiStationResponse,
    excludeCheckOn: string[] = [
      ".lastActiveThermalTime",
      ".lastActiveAudioTime",
      ".earliestThermalRecordingTime",
      ".earliestAudioRecordingTime",
    ],
    statusCode = 200,
    additionalChecks: {
      useRawStationId?: boolean;
      additionalParams?: object;
      warnings?: string[];
      messages?: string[];
    } = {},
  ) => {
    let stationId: string;

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks.useRawStationId === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(stationIdOrName).id.toString();
    }

    let params = {};
    if (additionalChecks.additionalParams !== undefined) {
      params = { ...params, ...additionalChecks.additionalParams };
    }

    logTestDescription(`Check station ${stationId}`, {
      userName,
    });

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`stations/${stationId}`, params),
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          warnings?: string[];
          messages: string[];
          station: ApiStationResponse;
        }>,
      ) => {
        if (statusCode === 200) {
          checkTreeStructuresAreEqualExcept(
            expectedStation,
            response.body.station,
            excludeCheckOn,
          );
          cy.wrap(response.body.station.id);
        }
        if (additionalChecks.warnings) {
          checkWarnings(response, additionalChecks.warnings);
        }
        if (additionalChecks.messages) {
          checkMessages(response, additionalChecks.messages);
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiStationUpdate",
  (
    userName: string,
    stationIdOrName: string,
    stationUpdates: ApiStationData,
    fromDate?: string,
    untilDate?: string,
    retire?: boolean,
    statusCode = 200,
    additionalChecks: {
      useRawStationId?: boolean;
      useRawStationName?: boolean;
      warnings?: string[];
      messages?: string[];
    } = {},
  ) => {
    let stationId: string;
    const thisStation = JSON.parse(JSON.stringify(stationUpdates));

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks.useRawStationId === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(getTestName(stationIdOrName)).id.toString();
    }

    //Make new station name unique unless we're asked not to
    if (additionalChecks.useRawStationName !== true && thisStation.name) {
      thisStation.name = getTestName(thisStation.name);
    }

    logTestDescription(
      `Update station ${prettyLog(thisStation)}'${stationId}' `,
      { userName, thisStation },
    );

    const body: Record<string, string> = {
      "station-updates": JSON.stringify(thisStation),
    };
    if (fromDate !== undefined) {
      body["from-date"] = fromDate;
    }
    if (untilDate !== undefined) {
      body["until-date"] = untilDate;
    }
    if (retire !== undefined) {
      body["retire"] = String(retire);
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath(`stations/${stationId}`),
        body,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          warnings?: string[];
          messages: string[];
          stationId: StationId;
        }>,
      ) => {
        if (statusCode == 200) {
          //store station Ids against names
          const stationName = stationUpdates.name;
          const stationId = response.body.stationId;
          saveIdOnly(stationName, stationId);
        }
        if (additionalChecks.warnings) {
          checkWarnings(response, additionalChecks.warnings);
        }
        if (additionalChecks.messages) {
          checkMessages(response, additionalChecks.messages);
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiStationDelete",
  (
    userName: string,
    stationIdOrName: string,
    deleteRecordings = true,
    statusCode = 200,
    additionalChecks: {
      useRawStationId?: boolean;
      warnings?: string[];
      messages?: string[];
    } = {},
  ) => {
    let stationId: string;

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks.useRawStationId === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(getTestName(stationIdOrName)).id.toString();
    }

    logTestDescription(`Delete station ${stationId}`, {
      userName,
    });

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: v1ApiPath(`stations/${stationId}`, {
          "delete-recordings": deleteRecordings,
        }),
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{ warnings?: string[]; messages: string[] }>,
      ) => {
        if (additionalChecks.warnings) {
          const warnings = response.body.warnings;
          const expectedWarnings = additionalChecks.warnings;
          expect(warnings).to.exist;
          expectedWarnings.forEach(function (warning: string) {
            expect(warnings, "Expect warning to be present").to.contain(
              warning,
            );
          });
        }
        if (additionalChecks.messages) {
          checkMessages(response, additionalChecks.messages);
        }
      },
    );
  },
);

Cypress.Commands.add(
  "testStationRetire",
  (
    userName: string,
    stationIdOrName: string,
    retirementDate: string = new Date().toISOString(),
    additionalChecks: { useRawStationId?: boolean } = {},
  ) => {
    let stationId: string;
    //Get station ID from name (unless we're asked not to)
    if (additionalChecks.useRawStationId === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(getTestName(stationIdOrName)).id.toString();
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath(`stations/${stationId}`),
        body: {
          "until-date": retirementDate,
        },
      },
      userName,
      HttpStatusCode.Ok,
    );
  },
);

Cypress.Commands.add(
  "apiStationUpdateName",
  (
    userName: string,
    stationIdOrName: string,
    newName: string,
    statusCode = 200,
    additionalChecks: {
      useRawStationId?: boolean;
      useRawStationName?: boolean;
      message?: string;
      warnings?: string[] | string;
      messages?: string[];
    } = {},
  ) => {
    let stationId: string;

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks.useRawStationId === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(getTestName(stationIdOrName)).id.toString();
    }

    //Make new station name unique unless we're asked not to
    const finalName =
      additionalChecks.useRawStationName !== true
        ? getTestName(newName)
        : newName;

    logTestDescription(`Update station name ${stationId} to '${finalName}'`, {
      userName,
    });

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath(`stations/${stationId}/name`),
        body: {
          name: finalName,
        },
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{ messages: string[]; warnings?: string[] }>,
      ) => {
        if (statusCode == 200) {
          //store station Ids against names
          saveIdOnly(finalName, Number(stationId));
        }
        if (additionalChecks.warnings) {
          checkWarnings(response, additionalChecks.warnings);
        }
        if (additionalChecks.messages) {
          checkMessages(response, additionalChecks.messages);
        }
      },
    );
  },
);

export function TestCreateStationData(
  prefix: string,
  identifier: number,
): ApiStationData {
  const thisLocation = TestGetLocation(identifier);
  return {
    name: prefix + identifier.toString(),
    lat: thisLocation.lat,
    lng: thisLocation.lng,
  };
}

export function TestCreateExpectedStation(
  template: ApiStationResponse,
  prefix: string,
  identifier: number,
): ApiStationResponse {
  const expectedStation: ApiStationResponse = JSON.parse(
    JSON.stringify(template),
  );
  const thisLocation = TestGetLocation(identifier);
  expectedStation.name = getTestName(prefix + identifier.toString());
  expectedStation.location.lat = thisLocation.lat;
  expectedStation.location.lng = thisLocation.lng;

  return expectedStation;
}

export function TestCreateExpectedAutomaticStation(
  template: ApiStationResponse,
  identifier: number,
  deviceName: string,
  recTime: string,
): ApiStationResponse {
  const expectedStation: ApiStationResponse = JSON.parse(
    JSON.stringify(template),
  );
  const thisLocation = TestGetLocation(identifier);
  expectedStation.name =
    "New location for " + getTestName(deviceName) + "_" + recTime;
  expectedStation.location.lat = thisLocation.lat;
  expectedStation.location.lng = thisLocation.lng;
  expectedStation.automatic = true;
  expectedStation.needsRename = true;
  expectedStation.lastThermalRecordingTime = recTime;
  delete expectedStation.lastUpdatedById;

  return expectedStation;
}

export function TestGetLocation(identifier = 0, offsetDegrees = 0) {
  return {
    lat: -45 - identifier / 10 - offsetDegrees,
    lng: 172 + identifier / 10 + offsetDegrees,
  };
}

export function TestGetLocationArray(identifier = 0, offsetDegrees = 0) {
  const loc = TestGetLocation(identifier, offsetDegrees);
  return [loc.lat, loc.lng];
}
