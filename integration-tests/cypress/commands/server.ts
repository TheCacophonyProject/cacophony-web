// load the global Cypress types
/// <reference types="cypress" />

export const DEFAULT_DATE = new Date(2021, 4, 9, 22);
import { logTestDescription, prettyLog } from "./descriptions";

import { format as urlFormat } from "url";

import { NOT_NULL_STRING } from "./constants";
import { ApiLocation } from "./types";

export function apiPath(): string {
  return Cypress.env("cacophony-api-server");
}

export function v1ApiPath(page: string, queryParams: any = {}): string {
  const urlpage = urlFormat({
    pathname: `/api/v1/${page}`,
    query: queryParams,
  });
  return `${Cypress.env("cacophony-api-server")}${urlpage}`;
}

export function processingApiPath(
  page: string = "",
  queryParams: any = {}
): string {
  const urlpage = urlFormat({
    pathname: `/api/fileProcessing/${page}`,
    query: queryParams,
  });
  return `${Cypress.env("cacophony-processing-api-server")}${urlpage}`;
}

// time string should look like "21:09"
export function convertToDate(timeOrDate: Date | string): Date {
  if (timeOrDate instanceof Date) {
    return timeOrDate as Date;
  } else if (timeOrDate) {
    const parts = (timeOrDate as String).split(":");
    if (parts.length == 2) {
      const nums = parts.map((item) => parseInt(item));
      const date = new Date(DEFAULT_DATE);
      date.setHours(nums[0], nums[1]);
      return date;
    }
    return new Date(DEFAULT_DATE);
  }

  return null;
}

interface ApiCreds {
  name: string;
  password: string;
  headers: {
    authorization: any;
  };
  jwt: string;
  jobKey: string;
  id: number;
  location: ApiLocation;
}

export function saveIdOnly(name: string, id: number) {
  const creds = {
    name: name,
    password: "",
    headers: {
      authorization: "",
    },
    jwt: "",
    jobKey: "",
    id: id,
    location: undefined,
  };
  Cypress.env("testCreds")[name] = creds;
}

export function saveJobKeyByName(name: string, jobKey: string) {
  Cypress.env("testCreds")[name].jobKey = jobKey;
}

export function saveJWTByName(name: string, jwt: string) {
  Cypress.env("testCreds")[name].jwt = jwt;
}

export function getCreds(userName: string): ApiCreds {
  if (userName) {
    const creds: ApiCreds = Cypress.env("testCreds")[userName];
    if (creds == undefined) {
      logTestDescription(
        `ERROR: could not find credentials for '${userName}'`,
        { name: userName }
      );
    }
    return creds;
  } else {
    logTestDescription(
      `NOTE: asked to retrieve credential for 'undefined'`,
      {}
    );

    return {
      name: null,
      id: null,
      password: undefined,
      jwt: undefined,
      headers: undefined,
      jobKey: undefined,
      location: undefined,
    };
  }
}

export function getCredsByIdAndNameLike(
  id: number,
  nameLike: string
): ApiCreds {
  const creds = Cypress.env("testCreds");
  const values: ApiCreds[] = Object.values(creds);
  logTestDescription(`${JSON.stringify(values)}`, {
    values,
  });
  const cred: ApiCreds = values.find(
    (cred) => cred.id === id && cred.name.includes(nameLike)
  );

  return cred;
}

export function renameCreds(oldName: string, newName: string) {
  const creds = getCreds(oldName);

  creds["name"] = newName;
  Cypress.env("testCreds")[newName] = creds;
}

export function saveCreds(
  response: Cypress.Response<any>,
  name: string,
  id = 0
) {
  const creds = {
    name: name,
    password: "",
    headers: {
      authorization: response.body.token,
    },
    jwt: response.body.token,
    jobKey: response.body.jobKey,
    id: id,
    location: response.body.location,
  };
  Cypress.env("testCreds")[name] = creds;
}

export function saveStation(location: ApiLocation, name: string, id = 0) {
  const creds = {
    name: name,
    password: "",
    headers: {},
    jwt: "",
    jobKey: "",
    id: id,
    location: location,
  };
  Cypress.env("testCreds")[name] = creds;
}

export function makeAuthorizedRequestWithStatus(
  requestDetails: Partial<Cypress.RequestOptions>,
  credName: string,
  statusCode: number
): Cypress.Chainable<Cypress.Response<any>> {
  if (statusCode && statusCode > 200) {
    // must set failOnStatusCode to false, to stop cypress from failing the test due to a failed status code before the then is called.
    requestDetails.failOnStatusCode = false;
    return makeAuthorizedRequest(requestDetails, credName).then((response) => {
      expectRequestHasFailed(response, statusCode);
    });
  } else {
    requestDetails.failOnStatusCode = true;
    return makeAuthorizedRequest(requestDetails, credName);
  }
}

export function checkAuthorizedRequestFails(
  requestDetails: Partial<Cypress.RequestOptions>,
  credName: string,
  statusCode: number
) {
  // must set failOnStatusCode to false, to stop cypress from failing the test due to a failed status code before the then is called.
  requestDetails.failOnStatusCode = false;
  makeAuthorizedRequest(requestDetails, credName).then((response) => {
    expectRequestHasFailed(response, statusCode);
  });
}

export function checkRequestFails(
  requestDetails: Partial<Cypress.RequestOptions>,
  statusCode: number
) {
  // must set failOnStatusCode to false, to stop cypress from failing the test due to a failed status code before the then is called.
  requestDetails.failOnStatusCode = false;
  cy.request(requestDetails).then((response) => {
    expectRequestHasFailed(response, statusCode);
  });
}

export function makeAuthorizedRequest(
  requestDetails: Partial<Cypress.RequestOptions>,
  credName: string
): Cypress.Chainable<Cypress.Response<any>> {
  const creds = getCreds(credName);
  requestDetails.headers = creds.headers;
  return cy.request(requestDetails);
}

export function expectRequestHasFailed(response: any, statusCode: number) {
  expect(
    response.isOkStatusCode,
    "Request should return a failure status code."
  ).to.be.false;
  expect(
    response.status,
    `Error scenario should be caught and return custom ${statusCode} error, should not cause 500 server error`
  ).to.equal(statusCode);

  return response;
}

export function checkResponse(response: Cypress.Response<any>, code: number) {
  expect(response.status, "Expected specified status code").to.eq(code);
  return response;
}

export function sortArrayOnHash(theArray: any, theKey: string) {
  theArray.sort(function (a: any, b: any) {
    if (JSON.stringify(a[theKey]) < JSON.stringify(b[theKey])) {
      return -1;
    }
    if (JSON.stringify(a[theKey]) > JSON.stringify(b[theKey])) {
      return 1;
    }
    return 0;
  });
  return theArray;
}

export function sortArrayOn(theArray: any, theKey: string) {
  theArray.sort(function (a: any, b: any) {
    if (a[theKey] < b[theKey]) {
      return -1;
    }
    if (a[theKey] > b[theKey]) {
      return 1;
    }
    return 0;
  });
  return theArray;
}

export function sortArrayOnTwoKeys(theArray: any, key1: string, key2: string) {
  theArray.sort(function (a: any, b: any) {
    if (a[key1] + a[key2] < b[key1] + b[key2]) {
      return -1;
    }
    if (a[key1] + a[key2] > b[key1] + b[key2]) {
      return 1;
    }
    return 0;
  });
  return theArray;
}

export function checkFlatStructuresAreEqualExcept(
  containedStruct: any,
  containingStruct: any,
  excludeKeys: any
) {
  const containedKeys: string[] = Object.keys(containedStruct).sort();
  const containingKeys: string[] = Object.keys(containingStruct).sort();
  for (let count = 0; count < containedKeys.length; count++) {
    if (!excludeKeys.includes(containedKeys[count])) {
      expect(
        containingKeys,
        `result includes parameter ${containedKeys[count]}`
      ).includes(containedKeys[count]);
      expect(
        containingStruct[containedKeys[count]],
        `${containedKeys[count]} should equal ${
          containedStruct[containedKeys[count]]
        }`
      ).to.equal(containedStruct[containedKeys[count]]);
    }
  }
}
// recursively search a JSON tree or array and match values in containing with contained, except any keys in excludeKeys.
// excludeKeys should be in the form: ["a.b[].c", ...] where [] indicates and array and a,b and c are keys
// treeSoFar is an internal variable used to pass the current point in the tree when making recursive calls
// prettyTreeSoFar is same as treeSoFar but includes array element numbers and is used for display purposes only
export function checkTreeStructuresAreEqualExcept(
  containedStruct: any,
  containingStruct: any,
  excludeKeys: any = [],
  treeSoFar: string = "",
  prettyTreeSoFar: string = "",
  approximateTimes: any = []
) {
  if (isArrayOrHash(containingStruct)) {
    if (Array.isArray(containingStruct)) {
      //check lengths are equal
      expect(
        containingStruct.length,
        `Expect ${prettyTreeSoFar} number of elements should match`
      ).to.equal(containedStruct.length);

      //iterate over array
      for (let count = 0; count < containingStruct.length; count++) {
        const prettyElementName = prettyTreeSoFar + "[" + count + "]";
        const elementName = treeSoFar + "[]";

        //if element is a nested object, recursively call this function again over the nested onject
        if (isArrayOrHash(containingStruct[count])) {
          checkTreeStructuresAreEqualExcept(
            containedStruct[count],
            containingStruct[count],
            excludeKeys,
            elementName,
            prettyElementName,
            approximateTimes
          );
        } else {
          //otherwise, check the values are as expected
          expect(
            containingStruct[count],
            `Expected ${prettyElementName} should equal ${JSON.stringify(
              containedStruct[count]
            )}`
          ).to.equal(containedStruct[count]);
        }
      }
    } else {
      expect(
        typeof containingStruct,
        `Expect result includes parameter ${prettyTreeSoFar} :::`
      ).equal(typeof containedStruct);

      const keyDiff = (a, b) => {
        return {
          missingKeys: Object.keys(a).filter((key) => !b.hasOwnProperty(key)),
          unknownKeys: Object.keys(b).filter((key) => !a.hasOwnProperty(key)),
        };
      };

      expect(
        Object.keys(containingStruct).length,
        `Check ${prettyTreeSoFar} number of elements in [${Object.keys(
          containingStruct
        ).toString()}] - Diff: ${JSON.stringify(
          keyDiff(containedStruct, containingStruct)
        )}`
      ).to.equal(Object.keys(containedStruct).length);

      //push two hashes in same order
      const containedKeys: string[] = Object.keys(containedStruct).sort();
      const containingKeys: string[] = Object.keys(containingStruct).sort();

      //iterate over hash
      for (let count = 0; count < containedKeys.length; count++) {
        const elementName = treeSoFar + "." + containedKeys[count];
        const prettyElementName = prettyTreeSoFar + "." + containedKeys[count];
        //check if we asked to ignore this parameter
        if (!excludeKeys.includes(elementName)) {
          expect(
            containingKeys,
            `Expect result includes parameter ${prettyElementName} :::`
          ).includes(containedKeys[count]);
          //if element is a nested object, recursively call this function again over the nested onject
          if (isArrayOrHash(containingStruct[containedKeys[count]])) {
            checkTreeStructuresAreEqualExcept(
              containedStruct[containedKeys[count]],
              containingStruct[containedKeys[count]],
              excludeKeys,
              elementName,
              prettyElementName,
              approximateTimes
            );
          } else {
            //check we were asked to validate, or validate NOT NULL
            if (containedStruct[containedKeys[count]] == NOT_NULL_STRING) {
              expect(
                containingStruct[containedKeys[count]],
                `Expected ${prettyElementName} should not be NULL`
              ).to.not.be.null;
            } else if (approximateTimes.includes(elementName)) {
              const comparedTime = new Date(
                containingStruct[containedKeys[count]]
              ).getTime();
              const expectedTime = new Date(
                containedStruct[containedKeys[count]]
              ).getTime();
              expect(
                new Date(comparedTime),
                `Time ${containedKeys[count]} should be approximately ${containedKeys[count]}`
              ).to.be.within(expectedTime - 60000, expectedTime + 60000);
            } else {
              //otherwise, check the values are as expected
              const testVal = containingStruct[containedKeys[count]];
              if (typeof testVal === "number" && !(testVal % 1 === 0)) {
                // This is a floating point value, and we might have some precision issues, so allow a small
                // 'epsilon' value of fuzziness when testing equality:
                const EPSILON = 0.000001;
                expect(
                  testVal,
                  `Expected ${prettyElementName} should be more than ${JSON.stringify(
                    containedStruct[containedKeys[count]]
                  )}`
                ).to.be.gt(containedStruct[containedKeys[count]] - EPSILON);
                expect(
                  testVal,
                  `Expected ${prettyElementName} should be less than ${JSON.stringify(
                    containedStruct[containedKeys[count]]
                  )}`
                ).to.be.lt(containedStruct[containedKeys[count]] + EPSILON);
              } else {
                expect(
                  containingStruct[containedKeys[count]],
                  `Expected ${prettyElementName} should equal ${JSON.stringify(
                    containedStruct[containedKeys[count]]
                  )}`
                ).to.equal(containedStruct[containedKeys[count]]);
              }
            }
          }
        }
      }
    }
  } else {
    //not an array or hash - fallback to compare two variables as JSON string
    expect(
      JSON.stringify(containingStruct),
      `Expect flat element ${prettyTreeSoFar} should equal ${JSON.stringify(
        containedStruct
      )}`
    ).to.equal(JSON.stringify(containedStruct));
  }
}

function isArrayOrHash(theObject: any) {
  return (
    typeof theObject == "object" &&
    theObject !== undefined &&
    theObject !== null
  );
}

export function removeUndefinedParams(jsStruct: any): any {
  if (jsStruct !== undefined && jsStruct !== null) {
    const resultStruct = {};
    for (const [key, val] of Object.entries(jsStruct)) {
      if (val !== undefined) {
        resultStruct[key] = val;
      }
    }
    return resultStruct;
  } else {
    return jsStruct;
  }
}

export function testRunOnApi(command: string, options = {}) {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    cy.exec(
      `cd ../api && docker-compose exec -T server bash -lic ${command}`,
      options
    );
  } else {
    if (Cypress.env("API-ssh-server") != null) {
      cy.exec(`ssh ${Cypress.env("API-ssh-server")} ${command}`, options);
    } else {
      alert(
        "Asked to run command on API server but have no credentials to do so"
      );
    }
  }
}

export function checkMessages(response: any, expectedMessages: string[]) {
  const messages = response.body.messages;
  expect(messages).to.exist;
  expectedMessages.forEach(function (message: string) {
    expect(
      messages.find((el: string) => el.includes(message)),
      `Messages should contain ${message}`
    ).to.exist;
  });
}

export function checkWarnings(response: any, expectedWarnings: any) {
  const warnings = response.body.warnings;
  if (expectedWarnings == "none") {
    expect(response.body.warnings).to.be.undefined;
  } else {
    expect(warnings).to.exist;
    expectedWarnings.forEach(function (warning: string) {
      expect(
        warnings.find((el: string) => el.includes(warning)),
        `Messages should contain ${warning}`
      ).to.exist;
    });
  }
}
