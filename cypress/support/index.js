// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before each test file.
//
// This is a great place to for global configuration.
// ***********************************************************

import '../commands/general';
import '../commands/thermalcamera';
import '../commands/api/users';
import '../commands/api/camera';
import '../commands/browsegui/user';
import '../commands/browsegui/groups';

before(function () {
  // This runs before each test file, eg once per file.
  cy.log('Global test before: Getting api server path');
  cy.getApiPath();
});