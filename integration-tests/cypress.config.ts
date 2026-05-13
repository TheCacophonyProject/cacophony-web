import { defineConfig } from "cypress";
import registerPlugins from "./cypress/plugins";
import failFast from "cypress-fail-fast/plugin";
export default defineConfig({
  projectId: "dyez6t",
  defaultCommandTimeout: 5000,

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
    defaultCommandTimeout: 10000,

    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    setupNodeEvents(on, config) {
      registerPlugins(on, config);
      failFast(on, config);
      return config;
    },
    specPattern: "cypress/e2e/api/**/*.{js,jsx,ts,tsx}",
  },

  component: {
    devServer: {
      framework: "vue",
      bundler: "vite",
    },
  },
});
