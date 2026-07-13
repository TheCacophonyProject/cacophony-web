// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

// load the global Cypress types
/// <reference types="cypress" />

import PluginEvents = Cypress.PluginEvents;
import PluginConfigOptions = Cypress.PluginConfigOptions;

export default (on: PluginEvents, config: PluginConfigOptions) => {
  // on('after:spec', (spec) => {
  //   const path = spec.relative + '.md';
  //   cy.writeFile(path, 'helloworld');
  // })
  console.log(
    "Cypress is running in CI env?",
    !(process.env["IS_CI_ENV"] === undefined),
  );
  config.video = false; //process.env["IS_CI_ENV"] === undefined;
  return config;
};
