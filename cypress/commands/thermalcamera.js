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

  cy.request(Cypress.config('fakeCameraUrl') + urlParams).then((request) => {
    Cypress.config("devices")[cameraName] = {
      "id":request.body,
      "groupname": groupName,
    };
  });
});

Cypress.Commands.add("cameraEvent", (eventType) => {
  const urlParams = url.format({
    pathname: 'triggerEvent/' + eventType,
  });

  cy.request('GET', Cypress.config('fakeCameraUrl') + urlParams);
});


Cypress.Commands.add("cameraRecording", () => {
  const urlParams = url.format({
    pathname: 'sendCPTVFrames',
  });

  cy.request('GET', Cypress.config('fakeCameraUrl') + urlParams);
});
