import { getTestName } from "../names";
import {
  v1ApiPath,
  saveCreds,
  getCreds,
  uploadFileRequest,
  checkRequestFails,
  makeAuthorizedRequest,
  makeAuthorizedRequestWithStatus
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

Cypress.Commands.add("apiCheckDevices", (userName: string, expectedDevices: [ComparableDevice], statusCode: number = 200) => {
  const fullUrl = v1ApiPath('devices');

  makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null
      },
      userName,
      statusCode
    ).then((response)=>{
       if(statusCode==null || statusCode==200) {
	  var devices=response.body.devices.rows;
          expect(response.body.devices.count).to.equal(expectedDevices.length);
          expect(devices.length).to.equal(expectedDevices.length);
	  var dev_count;
	  var user_count;
          for (dev_count=0; dev_count < expectedDevices.length; dev_count++) {
  	    expect(devices[dev_count].id).to.equal(expectedDevices[dev_count].id);
    	    expect(devices[dev_count].devicename).to.equal(expectedDevices[dev_count].devicename);
//	    expect(devices[dev_count].groupName).to.equal(expectedDevices[dev_count].groupName);
//            expect(devices[dev_count].userIsAdmin).to.equal(expectedDevices[dev_count].userIsAdmin);
            expect(devices[dev_count].Users.length).to.equal(expectedDevices[dev_count].Users.length);
            for (user_count=0; user_count < expectedDevices[dev_count].Users.length; user_count++) {
  		  expect(devices[dev_count].Users[user_count]).to.equal(expectedDevices[dev_count].Users[user_count]);
  	    }
	  }
       };
  });
});

Cypress.Commands.add("apiCheckDevice", (userName: string, cameraName: string, groupName: string, expectedDevice: ComparableDevice, statusCode: number = 200) => {
  const fullUrl = v1ApiPath('devices/'+getTestName(cameraName)+'/in-group/'+getTestName(groupName));

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null
      },
      userName,
      statusCode
    ).then((response) => {
       if(statusCode==null || statusCode==200) {
	  var device=response.body.device;
	  expect(device.id).to.equal(getCreds(cameraName).id);
	  expect(device.deviceName).to.equal(getTestName(cameraName));
	  expect(device.groupName).to.equal(getTestName(groupName));
          expect(device.userIsAdmin).to.equal(expectedDevice.userIsAdmin);
          expect(device.users.length).to.equal(expectedDevice.users.length);
	  var count;
          for (count=0; count < expectedDevice.users.length; count++) {
		  expect(device.users[count]).to.equal(expectedDevice.users[count]);
	  }
       };
  });
});

Cypress.Commands.add("apiCheckDevicesQuery", (userName: string, queryArray: any, operator: string='and', statusCode: number = 200) => {
  const params = {
	    devices: JSON.stringify(queryArray),
	    operator: operator
  };
  const fullUrl = v1ApiPath('devices/query', params);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: fullUrl,
        body: null
      },
      userName,
      statusCode
    ).then((response) => {
       if(statusCode==null || statusCode==200) {
	  // API returns devices: [ groupname: ..., devicename: ..., saltId, ..., Group.groupName: ... ]
          var devices=response.body.devices;
	  expect(devices.length).to.equal(queryArray.length);

	  // sort both arrays on devicename, groupnam
	  devices.sort(function(a,b) { 
		   if (a.devicename+a.groupname < b.devicename+b.groupname) return -1;
                   if (a.devicename+a.groupname > b.devicename+b.groupname) return 1;
                   return 0;
	  });
	  queryArray.sort(function(a,b) { 
		   if (a.devicename+a.groupname < b.devicename+b.groupname) return -1;
                   if (a.devicename+a.groupname > b.devicename+b.groupname) return 1;
                   return 0;
	  });

          for (var index=0; index < queryArray.length; index++) {
		  expect(devices[index].groupname).to.equal(queryArray[index].groupname);
		  expect(devices[index].devicename).to.equal(queryArray[index].devicename);
                  //TODO: consider adding check for salt id
		  //TODO: consider removing the following from API - not a standard format of parameter
		  expect(devices[index]['Group.groupname']).to.equal(queryArray[index].groupname);
	  }
       };
  });
});



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


