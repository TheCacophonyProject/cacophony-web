import { defineConfig } from "cypress";

export default defineConfig({
  projectId: "dyez6t",

  env: {
    "cacophony-api-server": "http://localhost:1080",
    "cacophony-processing-api-server": "http://localhost:2008",
    running_in_a_dev_environment: true,
    "base-url-returned-in-links": "http://test.site",
    testCreds: {
      superuser: {
        name: "admin_test",
        password: "admin_test",
        email: "admin@email.com",
      },
    },
  },

  chromeWebSecurity: false,
  screenshotOnRunFailure: false,

  e2e: {
    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    setupNodeEvents(on, config) {
      return require("./cypress/plugins/index.js")(on, config);
    },
    specPattern: "cypress/e2e/api/batch-2/**/*.{js,jsx,ts,tsx}",
  },

  component: {
    devServer: {
      framework: "vue-cli",
      bundler: "webpack",
    },
  },
});
