// load the global Cypress types
/// <reference types="cypress" />

import { RecordingId } from "@typedefs/api/common";
import { logTestDescription } from "../descriptions";
import { checkRecording } from "./recording-tests";

// Legacy test functions used in /recordings. To be retired and replaces with standard-format API wrappers.

Cypress.Commands.add(
  "thenCheckStationIs",
  { prevSubject: true },
  (subject: RecordingId, userName: string, station: string) => {
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
    if (recording.stationName) {
      expect(recording.stationName).equals(station);
    } else {
      expect("").equals(station);
    }
  });
}
