// load the global Cypress types
/// <reference types="cypress" />

import { v1ApiPath, getCreds } from "../server";
import { logTestDescription } from "../descriptions";
import { TestComparableVisit, TestVisitsWhere } from "../types";

Cypress.Commands.add(
  "checkVisitTags",
  (userName: string, deviceName: string, expectedTags: string[]) => {
    const expectedVisits = expectedTags.map((tag) => {
      return { tag };
    });

    logTestDescription(
      `Check visit tags match ${JSON.stringify(expectedTags)}`,
      {
        userName,
        deviceName,
        expectedVisits,
      }
    );

    checkVisitsMatch(userName, deviceName, expectedVisits);
  }
);

Cypress.Commands.add(
  "checkVisits",
  (
    userName: string,
    deviceName: string,
    expectedVisits: TestComparableVisit[]
  ) => {
    logTestDescription(`Check visits match ${JSON.stringify(expectedVisits)}`, {
      userName,
      deviceName,
      expectedVisits,
    });

    checkVisitsMatch(userName, deviceName, expectedVisits);
  }
);

function checkVisitsMatch(
  userName: string,
  deviceName: string,
  expectedVisits: TestComparableVisit[]
) {
  const where: TestVisitsWhere = {
    duration: { $gte: "0" },
    type: "thermalRaw",
  };

  if (deviceName) {
    where.DeviceId = getCreds(deviceName).id;
  }

  const params = {
    where: JSON.stringify(where),
    limit: 100,
  };

  cy.request({
    method: "GET",
    url: v1ApiPath("recordings/visits", params),
    headers: getCreds(userName).headers,
  }).then((response) => {
    checkResponseMatches(response, expectedVisits);
  });
}

function checkResponseMatches(
  response: Cypress.Response<any>,
  expectedVisits: TestComparableVisit[]
) {
  const responseVisits = response.body.visits;

  expect(
    responseVisits.length,
    `Number of visits to be ${responseVisits.length}`
  ).to.eq(expectedVisits.length);
  const increasingDateResponseVisits = responseVisits.reverse();

  // pull out the bits we care about
  const responseVisitsToCompare: TestComparableVisit[] = [];
  for (let i = 0; i < expectedVisits.length; i++) {
    const expectedVisit = expectedVisits[i];
    const completeResponseVisit = increasingDateResponseVisits[i];
    const simplifiedResponseVisit: TestComparableVisit = {};

    if (expectedVisit.tag) {
      simplifiedResponseVisit.tag = completeResponseVisit.what || "<null>";
    }

    if (expectedVisit.recordings) {
      const recordingIds = completeResponseVisit.events.map((ev) => {
        return ev.recID;
      });
      const recordingIdsSet = new Set(recordingIds);
      simplifiedResponseVisit.recordings = recordingIdsSet.size;
    }

    if (expectedVisit.start) {
      simplifiedResponseVisit.start = completeResponseVisit.start;
    }

    if (expectedVisit.end) {
      simplifiedResponseVisit.end = completeResponseVisit.end;
    }

    responseVisitsToCompare.push(simplifiedResponseVisit);
  }
  expect(JSON.stringify(responseVisitsToCompare)).to.eq(
    JSON.stringify(expectedVisits)
  );
}
