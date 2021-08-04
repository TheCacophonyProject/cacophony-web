// load the global Cypress types
/// <reference types="cypress" />
export const DEFAULT_DATE = new Date(2021, 4, 9, 22);
export const AuthorizationError = 402;

import { format as urlFormat } from "url";

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

export function expectRequestHasFailed(response, statusCode) {
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

//TODO: This functionality duplicates fileUpload in fileUpload.ts. This one needs removing
export const uploadFileRequest = (
  fileToUpload,
  uniqueName,
  aliasName,
  uploadUrl,
  fileData,
  credentials
) => {
  const data = new FormData();

  data.append("data", '{"type":"thermalRaw"}');
  //  data.append("hasHeader", "true");
  // data.append("name", uniqueName);

  cy.server()
    .route({
      method: "POST",
      url: uploadUrl,
    })
    .as(aliasName)
    .window()
    .then((win) => {
      cy.fixture(fileToUpload, "binary")
        .then((binary) => Cypress.Blob.binaryStringToBlob(binary))
        .then((blob) => {
          const xhr = new win.XMLHttpRequest();

          data.set("file", blob, fileToUpload);

          xhr.open("POST", uploadUrl);

          xhr.setRequestHeader(
            "Authorization",
            credentials.headers.authorization
          ),
            xhr.send(data);
        });
    });
};

export function checkResponse(response: Cypress.Response<any>, code: number) {
  expect(response.status, "Expected specified status code").to.eq(code);
  return response;
}

export function sortArrayOn(theArray, theKey) {
  theArray.sort(function (a, b) {
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

export function sortArrayOnTwoKeys(theArray, key1, key2) {
  theArray.sort(function (a, b) {
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
