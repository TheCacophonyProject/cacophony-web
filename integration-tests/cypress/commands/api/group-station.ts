// load the global Cypress types
/// <reference types="cypress" />

import { checkRecording } from "./recording-tests";
import { ApiStationData, } from "../types";
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
import { RecordingId } from "@typedefs/api/common";


Cypress.Commands.add(
  "apiGroupStationAdd",
  (
    userName: string,
    groupIdOrName: string,
    station: ApiStationData,
    fromDate?: string,
    untilDate?: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    let fullGroupName: string;
    let thisStation=JSON.parse(JSON.stringify(station));

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }

    //Make station name unique unless we're asked not to
    if (additionalChecks["useRawStationName"] !== true) {
      thisStation.name  = getTestName(thisStation.name);
    }

    logTestDescription(
      `Add station ${prettyLog(station)} to group '${groupIdOrName}' `,
      { userName, groupIdOrName, thisStation, fromDate, untilDate }
    );

    const body: { [key: string]: string } = {
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
      statusCode
    ).then((response) => {
      if (additionalChecks["warnings"]) {
        if (additionalChecks["warnings"]=="none") {
          expect(response.body.warnings).to.be.undefined;
        } else {
          const warnings = response.body.warnings;
          const expectedWarnings = additionalChecks["warnings"];
          expect(warnings).to.exist;
          expectedWarnings.forEach(function (warning: string) {
            expect(warnings, "Expect warning to be present").to.contain(warning);
          });
        }
      }
      if (additionalChecks["messages"]) {
        const messages = response.body.messages;
        const expectedMessages = additionalChecks["messages"];
        expect(messages).to.exist;
        expectedMessages.forEach(function (message: string) {
          expect(messages, "Expect message to be present").to.contain(message);
        });
      }

      if (statusCode == 200) {
        //store station Id against name
          const stationName = thisStation.name;
          const stationId = response.body.stationId;
          saveIdOnly(stationName, stationId);
          cy.wrap(stationId);
      }
    });

  }
);

Cypress.Commands.add(
  "apiGroupStationCheck",
  (
    userName: string,
    groupIdOrName: string,
    stationName: string,
    expectedStation: ApiStationResponse,
    excludeCheckOn: any = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check station ${stationName} for group ${groupIdOrName}`, {
      userName,
      groupIdOrName,
    });
    let fullGroupName: string;
    let fullStationName: string;

    //Make station name unique unless we're asked not to
    if (additionalChecks["useRawStationName"] === true) {
      fullStationName = stationName;
    } else {
      fullStationName = getTestName(stationName);
    }

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }
    let params={};
    if (additionalChecks["additionalParams"]!==undefined) {
       params={...params, ...additionalChecks["additionalParams"]};
    };
  

    makeAuthorizedRequestWithStatus(
    {
        method: "GET",
        url: v1ApiPath(`groups/${fullGroupName}/station/${fullStationName}`, params),
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
    });
  }
);

// Legacy test functions used in /recordings. To be retired and replaces with standard-format API wrappers.

Cypress.Commands.add(
  "thenCheckStationIs",
  { prevSubject: true },
  (subject, userName: string, station: string) => {
    checkStationNameIs(userName, subject, station);
  }
);

Cypress.Commands.add(
  "apiGroupStationsCheck",
  (
    userName: string,
    groupIdOrName: string,
    expectedStations: ApiStationResponse[],
    excludeCheckOn: any = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check stations for group ${groupIdOrName}`, {
      userName,
      groupIdOrName,
    });
    let fullGroupName: string;
    let sortStations: ApiStationResponse[];
    let sortExpectedStations: ApiStationResponse[];

    //Make group name unique unless we're asked not to
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupIdOrName;
    } else {
      fullGroupName = getTestName(groupIdOrName);
    }

    let params={};
    if (additionalChecks["additionalParams"]!==undefined) {
       params={...params, ...additionalChecks["additionalParams"]};
    }

    makeAuthorizedRequestWithStatus(
    {
        method: "GET",
        url: v1ApiPath(`groups/${fullGroupName}/stations`, params),
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        //sort expected and actual events into same order (means groupName, devicename, username,   userId is mandatory in   expectedGroup)
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
          excludeCheckOn
        );
      }
    });
  }
);

// Legacy test functions used in /recordings. To be retired and replaces with standard-format API wrappers.

Cypress.Commands.add(
  "thenCheckStationNameIs",
  { prevSubject: true },
  (subject: RecordingId, userName: string, station: string) => {
    checkStationNameIs(userName, subject, station);
  }
);

Cypress.Commands.add(
  "thenCheckStationIdIs",
  { prevSubject: true },
  (subject: RecordingId, userName: string, stationId: number) => {
    checkStationIdIs(userName, subject, stationId);
  }
);

Cypress.Commands.add(
  "thenCheckStationIsNew",
  { prevSubject: true },
  (subject: RecordingId, userName: string) => {
    checkRecording(userName, subject, (recording) => {
      expect(recording.stationName).contains("New station for ");
      expect(recording.stationName).contains(recording.recordingDateTime);
      saveIdOnly(recording.stationName, recording.stationId);
      return({id: recording.stationId, name: recording.stationName});
    });
  }
);

Cypress.Commands.add(
  "checkRecordingsStationNameIs",
  (userName: string, station: string) => {
    let returnedStation=checkStationNameIs(userName, 0, station);
    cy.wrap(returnedStation);
  }
);

 Cypress.Commands.add(
    "checkRecordingsStationIsNew",
    (userName: string, recId: number) => {
      checkRecording(userName, recId, (recording) => {
        expect(recording.stationName).contains("New station for ");
        expect(recording.stationName).contains(recording.recordingDateTime);
        saveIdOnly(recording.stationName, recording.stationId);

        return({id: recording.stationId, name: recording.stationName});
      });
    }
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
    return({id: recording.stationId, name: recording.stationName});
  });
}

function checkStationIdIs(userName: string, recId: number, stationId: number) {
  logTestDescription(`and check recording is assigned to station ${stationId}`, {
    userName,
  });
  checkRecording(userName, recId, (recording) => {
    expect(recording.stationId).equals(stationId);
    return({id: recording.stationId, name: recording.stationName});
  });
}

