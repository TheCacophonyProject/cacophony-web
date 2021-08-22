// load the global Cypress types
/// <reference types="cypress" />

import { v1ApiPath, makeAuthorizedRequest } from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { getTestName } from "../names";
import { checkRecording } from "./recording";
import { ApiCreateStationData } from "../types";

Cypress.Commands.add(
  "apiUploadStations",
  (
    userName: string,
    groupName: string,
    stations: ApiCreateStationData[],
    updateFrom?: Date
  ) => {
    logTestDescription(
      `Add stations ${prettyLog(stations)} to group '${groupName}' `,
      { userName, groupName, stations, updateFrom }
    );

    const actualGroup = getTestName(groupName);
    const body: { [key: string]: string } = {
      stations: JSON.stringify(stations),
    };
    if (updateFrom) {
      body["fromDate"] = updateFrom.toISOString();
    }

    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath(`groups/${actualGroup}/stations`),
        body,
      },
      userName
    );
  }
);

Cypress.Commands.add(
  "apiCheckStations",
  (userName: string, groupName: string) => {
    logTestDescription(`Check stations for group ${groupName}`, {
      userName,
      groupName,
    });

    const actualGroup = getTestName(groupName);

    makeAuthorizedRequest(
      {
        method: "GET",
        url: v1ApiPath(`groups/${actualGroup}/stations`),
      },
      userName
    );
  }
);

Cypress.Commands.add(
  "thenCheckStationIs",
  { prevSubject: true },
  (subject, userName: string, station: string) => {
    checkStationIs(userName, subject, station);
  }
);

Cypress.Commands.add(
  "checkRecordingsStationIs",
  (userName: string, station: string) => {
    checkStationIs(userName, 0, station);
  }
);

function checkStationIs(userName: string, recId: number, station: string) {
  const text =
    station === ""
      ? "not assigned to a station"
      : `assigned to station '${station}'`;
  logTestDescription(`and check recording is ${text}`, {
    userName,
  });
  checkRecording(userName, recId, (recording) => {
    if (recording.Station) {
      expect(recording.Station.name).equals(station);
    } else {
      expect("").equals(station);
    }
  });
}
