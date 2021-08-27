// load the global Cypress types
/// <reference types="cypress" />
export const DEFAULT_DATE = new Date(2021, 4, 9, 22);

import { format as urlFormat } from "url";

import { NOT_NULL } from "./constants";

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
  headers: {
    authorization: any;
  };
  jwt: string;
  id: number;
}

export function saveIdOnly(name: string, id: number) {
  const creds = {
    name,
    headers: {
      authorization: "",
    },
    jwt: "",
    id,
  };
  Cypress.env("testCreds")[name] = creds;
}

export function getCreds(userName: string): ApiCreds {
  return Cypress.env("testCreds")[userName];
}

export function saveCreds(
  response: Cypress.Response<any>,
  name: string,
  id = 0
) {
  const creds = {
    name,
    headers: {
      authorization: response.body.token,
    },
    jwt: response.body.token,
    id,
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
// treeSoFar is an internal varaible used to pass the current point in the tree when making recursive calls
// prettyTreeSoFar is same as treeSoFar but includes array element numbers and is used for display purposes only
export function checkTreeStructuresAreEqualExcept(
  containedStruct: any,
  containingStruct: any,
  excludeKeys: any = [],
  treeSoFar: string = "",
  prettyTreeSoFar: string = ""
) {
  if (isArrayOrHash(containingStruct)) {
    if (Array.isArray(containingStruct)) {
      //check lengths are equal
      expect(
        containingStruct.length,
        `Expect ${prettyTreeSoFar} number of elements should match`
      ).to.equal(containedStruct.length);

      //itterate over array
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
            prettyElementName
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
      //Not an array so mush be a hash
      //check lengths are equal
      expect(
        Object.keys(containingStruct).length,
        `Check ${prettyTreeSoFar} number of elements in [${Object.keys(
          containingStruct
        ).toString()}]`
      ).to.equal(Object.keys(containedStruct).length);

      //push two hashes in same order
      const containedKeys: string[] = Object.keys(containedStruct).sort();
      const containingKeys: string[] = Object.keys(containingStruct).sort();

      //itterate over hash
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
              prettyElementName
            );
          } else {
            //check we were aksed to validate, or validate NOT NULL
            if (containedStruct[containedKeys[count]] == NOT_NULL) {
              expect(
                containingStruct[containedKeys[count]],
                `Expected ${prettyElementName} should not be NULL`
              ).to.not.be.null;
            } else {
              //otherwise, check the values are as expected
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

export function removeUndefinedParams(jsStruct: any) {
  const keys = Object.keys(jsStruct);
  const resultStruct = {};
  for (let count = 0; count < keys.length; count++) {
    if (jsStruct[keys[count]] !== undefined) {
      resultStruct[keys[count]] = jsStruct[keys[count]];
    }
  }
  return resultStruct;
}
