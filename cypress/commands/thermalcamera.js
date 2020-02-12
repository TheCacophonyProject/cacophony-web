const url = require("url");
const names = require("./names");

Cypress.Commands.add("createCamera", (cameraName, groupName) => {
  const urlParams = url.format({
    pathname: 'create/' + names.getTestName(cameraName),
    query: {
      'group-name': names.getTestName(groupName),
      'api-server' : Cypress.config('cacophony-api-server'),
    }
  });

  cy.request(Cypress.config('fakeCameraUrl') + urlParams);
});
