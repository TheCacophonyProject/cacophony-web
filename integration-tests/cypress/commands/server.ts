import { ApiLoggedInUserResponse } from "@shared/api/user";

export const DEFAULT_DATE = new Date(2021, 4, 9, 22);
import { logTestDescription } from "./descriptions";

import { NOT_NULL_STRING } from "./constants";
import { ApiLocation } from "./types";

export function apiPath(): string {
  return Cypress.env("cacophony-api-server");
}

export function v1ApiPath(page: string, queryParams = {}): string {
  const urlpage = new URL(Cypress.env("cacophony-api-server"));
  urlpage.pathname = `/api/v1/${page}`;
  for (const [key, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) {
      for (const val of value) {
        urlpage.searchParams.append(key, val);
      }
    } else {
      urlpage.searchParams.append(key, String(value));
    }
  }
  return urlpage.toString();
}

export function processingApiPath(page = "", queryParams = {}): string {
  const urlpage = new URL(Cypress.env("cacophony-processing-api-server"));
  urlpage.pathname = `/api/fileProcessing/${page}`;
  for (const [key, value] of Object.entries(queryParams)) {
    urlpage.searchParams.append(key, String(value));
  }
  return urlpage.toString();
}

// time string should look like "21:09"
export function convertToDate(timeOrDate: Date | string): Date {
  if (timeOrDate instanceof Date) {
    return timeOrDate as Date;
  } else if (timeOrDate) {
    const parts = (timeOrDate as string).split(":");
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
  email: string;
  password: string;
  headers: {
    authorization: unknown;
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
        { name: userName },
      );
    }
    return creds;
  } else {
    logTestDescription(
      `NOTE: asked to retrieve credential for 'undefined'`,
      {},
    );

    return {
      name: null,
      email: null,
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
  nameLike: string,
): ApiCreds {
  const creds = Cypress.env("testCreds");
  const values: ApiCreds[] = Object.values(creds);
  logTestDescription(`${JSON.stringify(values)}`, {
    values,
  });
  const cred: ApiCreds = values.find(
    (cred) => cred.id === id && cred.name.includes(nameLike),
  );

  return cred;
}

export function renameCreds(oldName: string, newName: string) {
  const creds = getCreds(oldName);

  creds["name"] = newName;
  Cypress.env("testCreds")[newName] = creds;
}

export function saveCreds(
  response: Cypress.Response<{
    userData?: ApiLoggedInUserResponse;
    token: string;
    jobKey?: string;
    location?: unknown;
  }>,
  name: string,
  id = 0,
) {
  // console.log(response.body);
  const creds = {
    name: name,
    password: "",
    email: response?.body?.userData?.email ?? `${name}@email.com`,
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
  statusCode: number,
): Cypress.Chainable<Cypress.Response<unknown>> {
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
  statusCode: number,
) {
  // must set failOnStatusCode to false, to stop cypress from failing the test due to a failed status code before the then is called.
  requestDetails.failOnStatusCode = false;
  makeAuthorizedRequest(requestDetails, credName).then((response) => {
    expectRequestHasFailed(response, statusCode);
  });
}

export function checkRequestFails(
  requestDetails: Partial<Cypress.RequestOptions>,
  statusCode: number,
) {
  // must set failOnStatusCode to false, to stop cypress from failing the test due to a failed status code before the then is called.
  requestDetails.failOnStatusCode = false;
  cy.request(requestDetails).then((response) => {
    expectRequestHasFailed(response, statusCode);
  });
}

export function makeAuthorizedRequest(
  requestDetails: Partial<Cypress.RequestOptions>,
  credName: string,
): Cypress.Chainable<Cypress.Response<unknown>> {
  const creds = getCreds(credName);
  requestDetails.headers = creds.headers;
  return cy.request(requestDetails);
}

export function expectRequestHasFailed(
  response: Cypress.Response<unknown>,
  statusCode: number,
) {
  expect(
    response.isOkStatusCode,
    "Request should return a failure status code.",
  ).to.be.false;
  expect(
    response.status,
    `Error scenario should be caught and return custom ${statusCode} error, should not cause 500 server error`,
  ).to.equal(statusCode);

  return response;
}

export function checkResponse(
  response: Cypress.Response<unknown>,
  code: number,
) {
  expect(response.status, "Expected specified status code").to.eq(code);
  return response;
}

export function sortArrayOnHash<T>(theArray: T[], theKey: string) {
  theArray.sort(function (a, b) {
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

export function sortArrayOn<T>(
  theArray: T[],
  theKey: string,
  sortOrder?: string[],
) {
  if (sortOrder) {
    theArray.sort((a, b) => {
      if (sortOrder.indexOf(a[theKey]) < sortOrder.indexOf(b[theKey])) {
        return -1;
      }
      if (sortOrder.indexOf(a[theKey]) > sortOrder.indexOf(b[theKey])) {
        return 1;
      }
      return 0;
    });
  } else {
    theArray.sort((a, b) => {
      if (a[theKey] < b[theKey]) {
        return -1;
      }
      if (a[theKey] > b[theKey]) {
        return 1;
      }
      return 0;
    });
  }
  return theArray;
}

export function sortArrayOnTwoKeys<T>(
  theArray: T[],
  key1: string,
  key2: string,
) {
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

export function checkFlatStructuresAreEqualExcept(
  containedStruct: object,
  containingStruct: object,
  excludeKeys: string[],
) {
  const containedKeys: string[] = Object.keys(containedStruct).sort();
  const containingKeys: string[] = Object.keys(containingStruct).sort();
  for (const containedKey of containedKeys) {
    if (!excludeKeys.includes(containedKey)) {
      expect(
        containingKeys,
        `result includes parameter ${containedKey}`,
      ).includes(containedKey);
      expect(
        containingStruct[containedKey],
        `${containedKey} should equal ${containedStruct[containedKey]}`,
      ).to.equal(containedStruct[containedKey]);
    }
  }
}
// recursively search a JSON tree or array and match values in containing with contained, except any keys in excludeKeys.
// excludeKeys should be in the form: ["a.b[].c", ...] where [] indicates and array and a,b and c are keys
// treeSoFar is an internal variable used to pass the current point in the tree when making recursive calls
// prettyTreeSoFar is same as treeSoFar but includes array element numbers and is used for display purposes only
export function checkTreeStructuresAreEqualExcept(
  containedStruct: unknown[] | unknown,
  containingStruct: unknown,
  excludeKeys: unknown[] = [],
  treeSoFar = "",
  prettyTreeSoFar = "",
  approximateTimes: unknown[] = [],
) {
  if (isArrayOrHash(containingStruct)) {
    if (Array.isArray(containingStruct)) {
      //check lengths are equal
      expect(
        containingStruct.length,
        `Expect ${prettyTreeSoFar} number of elements should match`,
      ).to.equal((containedStruct as unknown[]).length);

      //iterate over array
      for (let count = 0; count < containingStruct.length; count++) {
        const prettyElementName = prettyTreeSoFar + "[" + count + "]";
        const elementName = treeSoFar + "[]";

        //if element is a nested object, recursively call this function again over the nested object
        if (isArrayOrHash(containingStruct[count])) {
          checkTreeStructuresAreEqualExcept(
            containedStruct[count],
            containingStruct[count],
            excludeKeys,
            elementName,
            prettyElementName,
            approximateTimes,
          );
        } else {
          //otherwise, check the values are as expected
          expect(
            containingStruct[count],
            `Expected ${prettyElementName} should equal ${JSON.stringify(
              containedStruct[count],
            )}`,
          ).to.equal(containedStruct[count]);
        }
      }
    } else {
      const keyDiff = (a, b) => {
        return {
          missingKeys:
            a &&
            Object.keys(a).filter(
              (key) => b && !Object.prototype.hasOwnProperty.call(b, key),
            ),
          unknownKeys:
            b &&
            Object.keys(b).filter(
              (key) => a && !Object.prototype.hasOwnProperty.call(a, key),
            ),
        };
      };

      if (containedStruct && containingStruct) {
        let keys = Object.keys(containingStruct);
        let expectedKeys = Object.keys(containedStruct);

        const excludedElementNames = [];
        for (const key of keys) {
          const elementName = treeSoFar + "." + key;
          if (excludeKeys.includes(elementName)) {
            excludedElementNames.push(elementName);
          }
        }
        keys = keys.filter(
          (key) => !excludedElementNames.includes(`${treeSoFar}.${key}`),
        );
        expectedKeys = expectedKeys.filter(
          (key) => !excludedElementNames.includes(`${treeSoFar}.${key}`),
        );
        let diff = { missingKeys: [], unknownKeys: [] };
        if (keys.length !== expectedKeys.length) {
          diff = keyDiff(containedStruct, containingStruct);
        }
        let diffPrinted = "";
        if (diff.missingKeys.length || diff.unknownKeys.length) {
          diffPrinted = ` Diff: ${JSON.stringify(diff)}`;
        }
        expect(
          keys.length,
          `Check ${prettyTreeSoFar} number of elements in [${keys.toString()}]}${diffPrinted}`,
        ).to.equal(expectedKeys.length);

        const containedKeys: string[] = keys;
        //iterate over hash
        for (const containedKey of containedKeys) {
          const elementName = treeSoFar + "." + containedKey;
          const prettyElementName = prettyTreeSoFar + "." + containedKey;

          //if element is a nested object, recursively call this function again over the nested onject
          if (isArrayOrHash(containingStruct[containedKey])) {
            checkTreeStructuresAreEqualExcept(
              containedStruct[containedKey],
              containingStruct[containedKey],
              excludeKeys,
              elementName,
              prettyElementName,
              approximateTimes,
            );
          } else {
            //check we were asked to validate, or validate NOT NULL
            if (containedStruct[containedKey] == NOT_NULL_STRING) {
              expect(
                containingStruct[containedKey],
                `Expected ${prettyElementName} should not be NULL`,
              ).to.not.be.null;
            } else if (approximateTimes.includes(elementName)) {
              const comparedTime = new Date(
                containingStruct[containedKey],
              ).getTime();
              const expectedTime = new Date(
                containedStruct[containedKey],
              ).getTime();
              expect(
                new Date(comparedTime),
                `Time ${containedKey} should be approximately ${containedKey}`,
              ).to.be.within(expectedTime - 60000, expectedTime + 60000);
            } else {
              //otherwise, check the values are as expected
              const testVal = containingStruct[containedKey];
              if (typeof testVal === "number" && !(testVal % 1 === 0)) {
                // This is a floating point value, and we might have some precision issues, so allow a small
                // 'epsilon' value of fuzziness when testing equality:
                const EPSILON = 0.000001;
                expect(
                  testVal,
                  `Expected ${prettyElementName} should be more than ${JSON.stringify(
                    containedStruct[containedKey],
                  )}`,
                ).to.be.gt(containedStruct[containedKey] - EPSILON);
                expect(
                  testVal,
                  `Expected ${prettyElementName} should be less than ${JSON.stringify(
                    containedStruct[containedKey],
                  )}`,
                ).to.be.lt(containedStruct[containedKey] + EPSILON);
              } else {
                expect(
                  containingStruct[containedKey],
                  `Expected ${prettyElementName} should equal ${JSON.stringify(
                    containedStruct[containedKey],
                  )}`,
                ).to.equal(containedStruct[containedKey]);
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
        containedStruct,
      )}`,
    ).to.equal(JSON.stringify(containedStruct));
  }
}

function isArrayOrHash(theObject: unknown) {
  return (
    typeof theObject === "object" &&
    theObject !== undefined &&
    theObject !== null
  );
}

export function removeUndefinedParams<T>(jsStruct: T | null | undefined): T {
  if (jsStruct !== undefined && jsStruct !== null) {
    const resultStruct = {};
    for (const [key, val] of Object.entries(jsStruct)) {
      if (val !== undefined) {
        resultStruct[key] = val;
      }
    }
    return resultStruct as T;
  } else {
    return jsStruct;
  }
}

export function testRunOnApi(
  command: string,
  options = {},
  callback = undefined,
) {
  if (Cypress.env("running_in_a_dev_environment") == true) {
    cy.exec(
      `cd ../api && docker exec cacophony-web bash -lic "${command}"`,
      options,
    ).then((val) => callback && callback(val));
  } else {
    if (Cypress.env("API-ssh-server") != null) {
      cy.exec(`ssh ${Cypress.env("API-ssh-server")} ${command}`, options).then(
        () => callback && callback(),
      );
    } else {
      alert(
        "Asked to run command on API server but have no credentials to do so",
      );
    }
  }
}

export const testRunDockerCommand = async (command: string, options = {}) => {
  return new Promise((resolve) => {
    testRunOnApi(command, options, resolve);
  });
};

export function checkMessages(
  response: Cypress.Response<{ messages: string[] }>,
  expectedMessages: string[],
) {
  const messages = response.body.messages;
  expect(messages).to.exist;
  expectedMessages.forEach(function (message: string) {
    expect(
      messages.find((el: string) => el.includes(message)),
      `Messages should contain ${message}`,
    ).to.exist;
  });
}

export function checkWarnings(
  response: Cypress.Response<{ warnings?: string[] }>,
  expectedWarnings: string | string[],
) {
  const warnings = response.body.warnings;
  if (expectedWarnings === "none") {
    expect(response.body.warnings).to.be.undefined;
  } else {
    expect(warnings).to.exist;
    (expectedWarnings as string[]).forEach(function (warning: string) {
      expect(
        warnings.find((el: string) => el.includes(warning)),
        `Messages should contain ${warning}`,
      ).to.exist;
    });
  }
}
