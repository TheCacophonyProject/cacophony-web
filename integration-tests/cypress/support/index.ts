// load the global Cypress types
/// <reference types="cypress" />

import "../commands/api/authenticate";
import "../commands/api/user";
import "../commands/api/camera";
import "../commands/api/alerts";
import "../commands/api/events";
import "../commands/api/recording";
import "../commands/api/monitoring";
import "../commands/api/stations";
import "../commands/api/visits";
import "../commands/browsegui/user";
import "../commands/browsegui/groups";
import "../commands/browsegui/general";

beforeEach(function () {
  // This runs before each test file, eg once per file.
  cy.intercept("POST", "recordings").as("addRecording");
  cy.intercept("POST", "api/v1/recordings/device/*").as("addRecording");
  cy.intercept("POST", "api/v1/recordings/device/*/group/*").as("addRecording");
});
