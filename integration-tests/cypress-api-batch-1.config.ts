import { defineConfig } from "cypress";
import registerPlugins from "./cypress/plugins";

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
    setupNodeEvents(on, config) {
      return registerPlugins(on, config);
    },
    specPattern: "cypress/e2e/api/batch-1/**/*.{js,jsx,ts,tsx}",
  },

  component: {
    devServer: {
      framework: "vue",
      bundler: "vite",
    },
  },
});
