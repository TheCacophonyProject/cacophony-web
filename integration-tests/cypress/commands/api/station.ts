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

Cypress.Commands.add(
  "apiStationsCheck",
  (
    userName: string,
    expectedStations: ApiStationResponse[],
    excludeCheckOn: any = ["lastActiveThermalTime", "[].lastActiveThermalTime"],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check stations for ${userName}`, {
      userName,
    });

    let params = {};
    if (additionalChecks["additionalParams"] !== undefined) {
      params = { ...params, ...additionalChecks["additionalParams"] };
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: v1ApiPath(`stations`, params),
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        let sortStations: ApiStationResponse[] = [];
        let sortExpectedStations: ApiStationResponse[] = [];
        if (additionalChecks["doNotSort"] === true) {
          sortStations = response.body.stations;
          sortExpectedStations = expectedStations;
        } else {
          sortStations = sortArrayOn(response.body.stations, "stationName");
          sortExpectedStations = sortArrayOn(expectedStations, "stationName");
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedStations,
          sortStations,
          excludeCheckOn
        );
      }
      if (additionalChecks["warnings"]) {
        const warnings = response.body.warnings;
        const expectedWarnings = additionalChecks["warnings"];
        expect(warnings).to.exist;
        expectedWarnings.forEach(function (warning: string) {
          expect(warnings, "Expect warning to be present").to.contain(warning);
        });
      }
      if (additionalChecks["messages"]) {
        checkMessages(response, additionalChecks["messages"]);
      }
    });
  }
);
Cypress.Commands.add(
  "apiStationCheck",
  (
    userName: string,
    stationIdOrName: string,
    expectedStation: ApiStationResponse,
    excludeCheckOn: any = [".lastActiveThermalTime"],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let stationId: string;

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks["useRawStationId"] === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(stationIdOrName).id.toString();
    }

    let params = {};
    if (additionalChecks["additionalParams"] !== undefined) {
      params = { ...params, ...additionalChecks["additionalParams"] };
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
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        checkTreeStructuresAreEqualExcept(
          expectedStation,
          response.body.station,
          excludeCheckOn
        );
        cy.wrap(response.body.station.id);
      }
      if (additionalChecks["warnings"]) {
        checkWarnings(response, additionalChecks["warnings"]);
      }
      if (additionalChecks["messages"]) {
        checkMessages(response, additionalChecks["messages"]);
      }
    });
  }
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
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let stationId: string;
    const thisStation = JSON.parse(JSON.stringify(stationUpdates));

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks["useRawStationId"] === true) {
      stationId = stationIdOrName;
    } else {
      stationId = getCreds(getTestName(stationIdOrName)).id.toString();
    }

    //Make new station name unique unless we're asked not to
    if (additionalChecks["useRawStationName"] !== true && thisStation.name) {
      thisStation.name = getTestName(thisStation.name);
    }

    logTestDescription(
      `Update station ${prettyLog(thisStation)}'${stationId}' `,
      { userName, thisStation }
    );

    const body: { [key: string]: string } = {
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
      statusCode
    ).then((response) => {
      if (statusCode == 200) {
        //store station Ids against names
        const stationName = stationUpdates.name;
        const stationId = response.body.stationId;
        saveIdOnly(stationName, stationId);
      }
      if (additionalChecks["warnings"]) {
        checkWarnings(response, additionalChecks["warnings"]);
      }
      if (additionalChecks["messages"]) {
        checkMessages(response, additionalChecks["messages"]);
      }
    });
  }
);

Cypress.Commands.add(
  "apiStationDelete",
  (
    userName: string,
    stationIdOrName: string,
    deleteRecordings: boolean = true,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let stationId: string;

    //Get station ID from name (unless we're asked not to)
    if (additionalChecks["useRawStationId"] === true) {
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
      statusCode
    ).then((response) => {
      if (additionalChecks["warnings"]) {
        const warnings = response.body.warnings;
        const expectedWarnings = additionalChecks["warnings"];
        expect(warnings).to.exist;
        expectedWarnings.forEach(function (warning: string) {
          expect(warnings, "Expect warning to be present").to.contain(warning);
        });
      }
      if (additionalChecks["messages"]) {
        checkMessages(response, additionalChecks["messages"]);
      }
    });
  }
);

Cypress.Commands.add(
  "testStationRetire",
  (
    userName: string,
    stationIdOrName: string,
    retirementDate: string = new Date().toISOString(),
    additionalChecks: any = {}
  ) => {
    let stationId: string;
    //Get station ID from name (unless we're asked not to)
    if (additionalChecks["useRawStationId"] === true) {
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
      HttpStatusCode.Ok
    );
  }
);

export function TestCreateStationData(
  prefix: string,
  identifier: number
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
  identifier: number
): ApiStationResponse {
  const expectedStation: ApiStationResponse = JSON.parse(
    JSON.stringify(template)
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
  recTime: string
): ApiStationResponse {
  const expectedStation: ApiStationResponse = JSON.parse(
    JSON.stringify(template)
  );
  const thisLocation = TestGetLocation(identifier);
  expectedStation.name =
    "New station for " + getTestName(deviceName) + "_" + recTime;
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
