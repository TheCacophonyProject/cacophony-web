/// <reference path="../../../support/index.d.ts" />
import { testRunOnApi } from "@commands/server";

describe("Teardwon test data", () => {
  before(() => {
  });

  it("Remove test data from database", () => {
    if (Cypress.env("running_in_a_dev_environment") == true) {
      testRunOnApi("sudo -u postgres psql -d cacophonytest -f /app/api/scripts/deleteTestData.sql"); 
    } else {
      testRunOnApi("psql -U user10 -d cacodb -f /srv/cacophony/api/scripts/deleteTestData.sql");
    }
  });
});
