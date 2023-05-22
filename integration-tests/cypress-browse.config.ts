import { defineConfig } from "cypress";

export default defineConfig({
  projectId: "dyez6t",
  env: {
    "cacophony-api-server": "http://localhost:1080",
    testCreds: {},
  },
  chromeWebSecurity: false,
  screenshotOnRunFailure: false,
  e2e: {
    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    setupNodeEvents(on, config) {
      return require("./cypress/plugins/index.js")(on, config);
    },
    specPattern: "cypress/e2e/browse-next/**/*.{js,jsx,ts,tsx}",
    baseUrl: "http://localhost:5173",
  },
});
