import { testRunOnApi } from "@commands/server";

describe("Teardown test data", () => {
  before(() => {});

  it.skip("Remove test data from database", () => {
    if (Cypress.env("running_in_a_dev_environment") == true) {
      // do not error in dev as we don't want a failed teardown to fail a build in travis
      testRunOnApi(
        "sudo -u postgres psql -d cacophonytest -f /app/api/scripts/deleteTestData.sql",
        { failOnNonZeroExit: false },
      );
    } else {
      testRunOnApi(
        "psql -U user10 -d cacodb -f /srv/cacophony/api/scripts/deleteTestData.sql",
      );
    }
  });
});
