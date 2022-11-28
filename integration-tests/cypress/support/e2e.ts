// load the global Cypress types
/// <reference types="cypress" />

import "../commands/api/authenticate";
import "../commands/api/group";
import "../commands/api/group-station";
import "../commands/api/user";
import "../commands/api/device";
import "../commands/api/alerts";
import "../commands/api/events";
import "../commands/api/recording";
import "../commands/api/recording-tag";
import "../commands/api/recording-tests";
import "../commands/api/station";
import "../commands/api/monitoring";
import "../commands/api/track";
import "../commands/api/visits";
import "../commands/browsegui/user";
import "../commands/browsegui/groups";
import "../commands/browsegui/general";

beforeEach(function () {
  // This runs before each test file, eg once per file.
  //cy.intercept("POST", "recordings").as("addRecording");
  //cy.intercept("POST", "api/v1/recordings/device/*").as("addRecording");
  cy.intercept("POST", "api/v1/events/thumbnail").as("addEventThumbnail");
  //cy.intercept("POST", "api/v1/recordings/device/*/group/*").as("addRecording");
});

// Ignore benign errors from @vueuse
const resizeObserverLoopErrRe = /^[^(ResizeObserver loop limit exceeded)]/;
Cypress.on("uncaught:exception", (err) => {
  /* returning false here prevents Cypress from failing the test */
  if (resizeObserverLoopErrRe.test(err.message)) {
    return false;
  }
});
