// load the global Cypress types
/// <reference types="cypress" />

import { RecordingId, StationId } from "@typedefs/api/common";
import { logTestDescription } from "../descriptions";
import { checkRecording } from "./recording-tests";
import { getTestName } from "@commands/names";
import {
  checkTreeStructuresAreEqualExcept,
  makeAuthorizedRequestWithStatus,
  v1ApiPath,
} from "@commands/server";
import { HTTP_OK200 } from "@commands/constants";
import {
  ApiCreateStationData,
  ApiStationResponse,
} from "@typedefs/api/station";

// Legacy test functions used in /recordings. To be retired and replaces with standard-format API wrappers.

Cypress.Commands.add(
  "thenCheckStationIs",
  { prevSubject: true },
  (subject: RecordingId, userName: string, station: string) => {
    checkStationIs(userName, subject, station);
  }
);

Cypress.Commands.add(
  "testCreateStation",
  (
    groupName: string,
    userName: string,
    stationData: ApiCreateStationData,
    fromDate: Date | null = null,
    untilDate: Date | null = null,
    returnBody = false,
    expectedStatus: number = HTTP_OK200
  ) => {
    logTestDescription(
      `Create station '${stationData.name}' in group '${groupName}'`,
      stationData
    );

    const createBody: any = {
      station: stationData,
    };
    if (fromDate) {
      createBody["from-date"] = fromDate.toISOString();
    }
    if (untilDate) {
      createBody["until-date"] = untilDate.toISOString();
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath(`groups/${getTestName(groupName)}/station`),
        body: createBody,
      },
      userName,
      expectedStatus
    ).then((response) => {
      if (!returnBody) {
        cy.wrap(response.body.stationId);
      } else {
        cy.wrap(response.body);
      }
    });
  }
);

Cypress.Commands.add(
  "testRetireStation",
  (
    userName: string,
    stationId: StationId,
    retirementDate: Date = new Date()
  ) => {
    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath(`stations/${stationId}`),
        body: {
          "until-date": retirementDate.toISOString(),
        },
      },
      userName,
      HTTP_OK200
    );
  }
);

Cypress.Commands.add(
  "testUpdateStation",
  (
    userName: string,
    stationId: StationId,
    stationUpdates: ApiCreateStationData | null = null,
    fromDate: Date | null = null,
    untilDate: Date | null = null
  ) => {
    const updateBody: any = {};
    if (stationUpdates) {
      updateBody["station-updates"] = stationUpdates;
    }
    if (fromDate) {
      updateBody["from-date"] = fromDate.toISOString();
    }
    if (untilDate) {
      updateBody["until-date"] = untilDate.toISOString();
    }
    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: v1ApiPath(`stations/${stationId}`),
        body: updateBody,
      },
      userName,
      HTTP_OK200
    ).then((response) => {
      cy.wrap(response.body);
    });
  }
);

Cypress.Commands.add(
  "testDeleteStation",
  (
    userName: string,
    stationId: StationId,
    deleteRecordings: boolean = false
  ) => {
    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: v1ApiPath(`stations/${stationId}`, {
          "delete-recordings": deleteRecordings,
        }),
      },
      userName,
      HTTP_OK200
    );
  }
);

Cypress.Commands.add(
  "testGetStation",
  (userName: string, stationId: StationId) => {
    makeAuthorizedRequestWithStatus(
      {
        url: v1ApiPath(`stations/${stationId}`),
      },
      userName,
      HTTP_OK200
    ).then((response) => {
      cy.wrap(response.body.station);
    });
  }
);

Cypress.Commands.add(
  "thenCheckStationBeginsWith",
  { prevSubject: true },
  (recId: RecordingId, userName: string, deviceName: string) =>
    checkStationBeginsWith(userName, recId, deviceName)
);

Cypress.Commands.add(
  "thenCheckAutomaticallyGeneratedStationIsAssignedToRecording",
  { prevSubject: true },
  (subject: RecordingId, userName: string, deviceName: string) => {
    checkRecordingStationHasExpectedAutomaticallyGeneratedNameBasedOnDeviceName(
      userName,
      subject,
      deviceName
    );
  }
);

Cypress.Commands.add(
  "checkRecordingsStationIs",
  (userName: string, station: string) => {
    checkStationIs(userName, 0, station);
  }
);

Cypress.Commands.add(
  "thenCheckRecordingsStationHasId",
  { prevSubject: true },
  (recordingId: RecordingId, userName: string, stationId: StationId) => {
    checkStationIdIs(userName, recordingId, stationId);
  }
);

Cypress.Commands.add(
  "apiStationCheck",
  (
    userName: string,
    stationId: StationId,
    expectedStation: ApiStationResponse,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const additionalParams = additionalChecks["additionalParams"];
    logTestDescription(`Check station ${stationId} `, {
      stationId,
    });
    const url = v1ApiPath(`stations/${stationId}`);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
        body: additionalParams,
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
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks["message"]
          );
        }
      }
    });
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
    expect(recording.stationName).equals(station);
    cy.wrap(recording.stationId);
  });
}

function checkStationIdIs(
  userName: string,
  recId: number,
  stationId: StationId
) {
  logTestDescription(
    `and check recording is assigned to station with id '${stationId}'`,
    {
      userName,
    }
  );
  checkRecording(userName, recId, (recording) => {
    expect(recording.stationId).equals(stationId);
    cy.wrap(recording.stationId);
  });
}

function checkRecordingStationHasExpectedAutomaticallyGeneratedNameBasedOnDeviceName(
  userName: string,
  recId: RecordingId,
  deviceName: string
) {
  const text =
    deviceName === ""
      ? "not assigned to a station"
      : `assigned to automatically generated station for device '${deviceName}'`;
  logTestDescription(`and check recording is ${text}`, {
    userName,
  });
  checkRecording(userName, recId, (recording) => {
    expect(recording.stationName).equals(
      `New station for ${getTestName(deviceName)}_${
        recording.recordingDateTime
      }`
    );
    cy.wrap(recording.stationId);
  });
}

function checkStationBeginsWith(
  userName: string,
  recId: RecordingId,
  deviceName: string
) {
  const text =
    deviceName === ""
      ? "not assigned to a station"
      : `assigned to existing automatically generated station for device '${deviceName}'`;
  logTestDescription(`and check recording is ${text}`, {
    userName,
  });
  checkRecording(userName, recId, (recording) => {
    expect(recording.stationName).does.not.equal(
      `New station for ${getTestName(deviceName)}_${
        recording.recordingDateTime
      }`
    );
    expect(
      recording.stationName.startsWith(
        `New station for ${getTestName(deviceName)}_`
      )
    );
    cy.wrap(recording.stationId);
  });
}
