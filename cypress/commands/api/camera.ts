import { getTestName } from "../names";
import {
  v1ApiPath,
  saveCreds,
  getCreds,
  uploadFileRequest,
  checkRequestFails,
  makeAuthorizedRequest
} from "../server";
import { logTestDescription } from "../descriptions";
const url = require("url");

Cypress.Commands.add(
  "recordEvent",
  (
    camera: string,
    type: string,
    details = {},
    date = new Date(),
    log = true
  ) => {
    const data = {
      dateTimes: [date.toISOString()],
      description: { type: type, details: details }
    };
    logTestDescription(
      `Create ${type} event for ${camera} at ${date}`,
      { data: data },
      log
    );
    makeAuthorizedRequest(
      {
        method: "POST",
        url: v1ApiPath("events"),
        body: data
      },
      camera
    );
  }
);

Cypress.Commands.add(
  "apiCreateCamera",
  (cameraName: string, group: string, log = true) => {
    logTestDescription(
      `Create camera '${cameraName}' in group '${group}'`,
      {
        camera: cameraName,
        group: group
      },
      log
    );

    const request = createCameraDetails(cameraName, group);
    cy.request(request).then((response) => {
      const id = response.body.id;
      saveCreds(response, cameraName, id);
    });
  }
);

Cypress.Commands.add(
  "apiShouldFailToCreateCamera",
  (
    cameraName: string,
    group: string,
    makeCameraATestName = true,
    log = true
  ) => {
    logTestDescription(
      `Check that user cannot create camera '${cameraName}' in group '${group} '`,
      {
        camera: cameraName,
        group: group
      },
      log
    );

    const request = createCameraDetails(cameraName, group, makeCameraATestName);
    checkRequestFails(request);
  }
);

function createCameraDetails(
  cameraName: string,
  group: string,
  makeCameraNameTestName = true
): any {
  const fullName = makeCameraNameTestName
    ? getTestName(cameraName)
    : cameraName;
  const password = "p" + fullName;

  const data = {
    devicename: fullName,
    password: password,
    group: getTestName(group)
  };

  return {
    method: "POST",
    url: v1ApiPath("devices"),
    body: data
  };
}

Cypress.Commands.add("apiUploadRecording", (cameraName, id) => {
  const recordingsUrl = v1ApiPath('recordings');
  const deviceName = getTestName(cameraName);

  const data = {
       type: 'thermalRaw'
  };

  const fileName="bird_"+id+".cptv";
  const uniqueName=deviceName+"_"+id;
  const aliasName=deviceName+"_a"+id;


  const creds = getCreds(cameraName);
  uploadFileRequest(fileName, uniqueName, aliasName, recordingsUrl, data, creds)

});


Cypress.Commands.add("apiUploadEvent", (cameraName) => {
  const eventsUrl = v1ApiPath('events');
  const deviceName = getTestName(cameraName);
  const creds = getCreds(cameraName);

  const data = {
       description: {
	   type: 'throttle'
       },
       dateTimes: ['2017-11-13T00:47:51.160Z']
  };

  makeAuthorizedRequest(
      {
        method: "POST",
        url: eventsUrl,
        body:  data 
      },
     cameraName
    );

});

Cypress.Commands.add("apiCheckDeviceHasRecordings", (username, deviceName,count) => {
  const user = getCreds(username);
  const camera = getCreds(deviceName);
  const fullUrl = v1ApiPath('')+encodeURI('recordings?where={"DeviceId":'+camera.id+'}');

  cy.request({
    url: fullUrl,
    headers: user.headers
  }).then((request) => {
    expect(request.body.count).to.equal(count);
  });
});


Cypress.Commands.add("apiCheckEventUploaded", (username, deviceName, eventType) => {
  const user = getCreds(username);
  const camera = getCreds(deviceName);
  const eventURL = v1ApiPath('events')+'?deviceId='+camera.id;
  cy.request({
    method: "GET",
    url: eventURL,
    headers: user.headers
  }).then((request) => {
    expect(request.body.rows[0].EventDetail.type).to.equal(eventType);
  });
});


