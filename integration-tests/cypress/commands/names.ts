// @ts-ignore
import { randomBytes } from "crypto";

//suffix to add to ids making them unique within each test run
let userId = 0;

const uniqueIdName = "uniqueId";

export function getTestName(baseName: string): string {
  initializeTestNames();

  return `cy_${baseName}_${Cypress.config("env")[uniqueIdName]}`;
}

export function initializeTestNames(uniqueId: string = "") {
  if (
    typeof Cypress.config("env") === "undefined" ||
    typeof Cypress.config("env")[uniqueIdName] === "undefined"
  ) {
    if (uniqueId.length < 1) {
      uniqueId = randomBytes(4).toString("hex");
    }

    cy.log(`Unique id for names for this run is '${uniqueId}'`);
    if (typeof Cypress.config("env") === "undefined") {
      Cypress.config("env", { uniqueIdName: uniqueId });
    }
    Cypress.config("env")[uniqueIdName] = uniqueId;
  }
}

export function stripBackName(testName: string): string {
  const uniqueId = Cypress.config("env")[uniqueIdName];
  return testName.substring(3, testName.length - uniqueId.length - 1);
}

export function getNewIdentity(userName: string): any {
  const user = {
    name: userName + userId.toString(),
    group: userName + userId.toString() + "_group",
    camera: userName + userId.toString() + "_camera",
  };
  userId++;
  return user;
}

//adds suffix of uniq id within test + uniq id for test run
export function getUniq(name: string): string {
  const uniqueId = Cypress.config("env")[uniqueIdName];
  return name + "_" + userId.toString() + "_" + uniqueId;
}
