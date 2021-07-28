import { getTestName } from "../names";
import {
  v1ApiPath,
  saveCreds,
  getCreds,
  uploadFileRequest,
  checkRequestFails,
  makeAuthorizedRequest,
  makeAuthorizedRequestWithStatus,
  sortArrayOn,
  sortArrayOnTwoKeys
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
  (cameraName: string, group: string, saltId: number = null, log = true, statusCode: number = 200) => {
    logTestDescription(
      `Create camera '${cameraName}' in group '${group}' with saltId '${saltId}'`,
      {
        camera: cameraName,
        group: group,
	saltId: saltId
      },
      log
    );

    const request = createCameraDetails(cameraName, group, null, saltId);
    if(statusCode==200) {
      cy.request(request).then((response) => {
        const id = response.body.id;
        saveCreds(response, cameraName, id);
      });
    } else {
      checkRequestFails(request);
    };
  }
);

Cypress.Commands.add(
  "apiDeviceReregister",
  (oldName: string, newName: string, newGroup: string, password: string = null, keepName:boolean = false, statusCode: number = 200) => {
    var uniqueName;
    logTestDescription(
      `Reregister camera '${newName}' in group '${newGroup}'`,
      {
        camera: newName,
        group: newGroup
      },
      true
    );

    if(password==null) {
      password="p"+getTestName(newName);
    };

    if(keepName==false) {
      uniqueName=getTestName(newName);
    } else {
      uniqueName=newName;
    };

    const data = {
      newName: uniqueName,
      newPassword: password,
      newGroup: getTestName(newGroup)
    };
    const fullUrl = v1ApiPath('devices/reregister');

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: fullUrl,
        body: data
      },
      oldName,
      statusCode
    ).then((response) => {
      const id = response.body.id;
      saveCreds(response, newName, id);
    });
  }
);


Cypress.Commands.add(
  "apiShouldFailToCreateCamera",
  (
    cameraName: string,
    group: string,
    password: string = null,
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

    const request = createCameraDetails(cameraName, group, password, null, makeCameraATestName);
    checkRequestFails(request);
  }
);

function createCameraDetails(
  cameraName: string,
  group: string,
  password: string,
  saltId: number,
  makeCameraNameTestName = true
): any {
  const fullName = makeCameraNameTestName
    ? getTestName(cameraName)
    : cameraName;

  if(password==null) {
    password = "p" + fullName;
  };

  const data = {
    devicename: fullName,
    password: password,
    group: getTestName(group)
  };

  if(saltId!=null) {
    data.saltId=saltId;
  };

  return {
    method: "POST",
    url: v1ApiPath("devices"),
    body: data
  };
}


Cypress.Commands.add("apiCheckDevices", (userName: string, expectedDevices: [ComparableDevice], params: string = {},  statusCode: number = 200) => {
  const fullUrl = v1ApiPath('devices',params);

  logTestDescription(
      `${userName} Check devices seen by  user '${userName}'`,
      { user: userName},
      true
  );

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
	  //TODO: Issue 63.  Reenable this when devices count is correct
          //expect(response.body.devices.count).to.equal(expectedDevices.length);
          expect(devices.length).to.equal(expectedDevices.length);
	  var dev_count;
	  var user_count;
          var sortDevices=sortArrayOn(devices,'devicename');
          var sortExpectedDevices=sortArrayOn(expectedDevices,'devicename');
          for (dev_count=0; dev_count < expectedDevices.length; dev_count++) {
  	    expect(sortDevices[dev_count].id).to.equal(sortExpectedDevices[dev_count].id);
    	    expect(sortDevices[dev_count].devicename).to.equal(sortExpectedDevices[dev_count].devicename);
	    expect(sortDevices[dev_count].active).to.equal(sortExpectedDevices[dev_count].active);
            if(sortExpectedDevices[dev_count].Users==null) {
	      expect(sortDevices[dev_count].Users).to.not.exist;
            } else {
              expect(sortDevices[dev_count].Users.length).to.equal(sortExpectedDevices[dev_count].Users.length);
	      // sort users and expected users to ensure order is the same
              var users=sortArrayOn(sortDevices[dev_count].Users,'username');
              var expectedUsers=sortArrayOn(sortExpectedDevices[dev_count].Users,'username');

	      // compare user list
	      var count
              for (count=0; count < expectedUsers.length; count++) {
  		  expect(users[count].username).to.equal(expectedUsers[count].username);
  		  expect(users[count].id).to.equal(expectedUsers[count].id);
  		  expect(users[count].DeviceUsers.admin).to.equal(expectedUsers[count].DeviceUsers.admin);
  		  expect(users[count].DeviceUsers.UserId).to.equal(expectedUsers[count].DeviceUsers.UserId);
	      };
  	    };
    	  }
       };
  });
});

Cypress.Commands.add("apiCheckDevices_contains", (userName: string, expectedDevices: [ComparableDevice], params: string = {}, statusCode: number = 200) => {
  const fullUrl = v1ApiPath('devices',params);
  logTestDescription(
      `${userName} Check devices seen by user '${userName}' contain the expected devices `,
      { user: userName  },
      true
  );

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
          expect(response.body.devices.count).to.be.at.least(expectedDevices.length);
          expect(devices.length).to.be.at.least(expectedDevices.length);
          var dev_count;
          var user_count;
	  //check each device in our expected list
          for (dev_count=0; dev_count < expectedDevices.length; dev_count++) {    
            var found=false;
	    // is found somewhere i the actual list
	    devices.forEach(function(device) {
	      // and contains the correct values
              if(device.devicename==expectedDevices[dev_count].devicename) {
		found=true;
		expect(device.id).to.equal(expectedDevices[dev_count].id);
                expect(device.devicename).to.equal(expectedDevices[dev_count].devicename);
                expect(device.active).to.equal(expectedDevices[dev_count].active);
                if(expectedDevices[dev_count].Users==null) {
                  expect(device.Users).to.not.exist;
                } else {
                  expect(device.Users.length).to.equal(expectedDevices[dev_count].Users.length);
	          // sort users and expected users to ensure order is the same
		  var users=sortArrayOn(device.Users,'username');
		  var expectedUsers=sortArrayOn(expectedDevices[dev_count].Users,'username');

	          // compare user list
                  var count;
                  for (count=0; count < expectedDevices[dev_count].Users.length; count++) {
                      expect(users[count].username).to.equal(expectedUsers[count].username);
                      expect(users[count].id).to.equal(expectedUsers[count].id);
                      expect(users[count].DeviceUsers.admin).to.equal(expectedUsers[count].DeviceUsers.admin);
                      expect(users[count].DeviceUsers.UserId).to.equal(expectedUsers[count].DeviceUsers.UserId);
                  };
                };
              };
	    });
            expect(found).to.equal(true);
          }
       };
  });
});

Cypress.Commands.add("apiCheckDeviceInGroup", (userName: string, cameraName: string, groupName: string, groupId: number, expectedDevice: all, params:string  = {}, statusCode: number = 200) => {
  logTestDescription(
      `${userName} Check user '${userName}' can see device '${cameraName}' in group '${groupName}' `,
      { user: userName, groupName, cameraName },
      true
  );

  // use group id if present, otherwise query by name
  var fullUrl = null;
  if(groupId!=null) {
    fullUrl = v1ApiPath('devices/'+getTestName(cameraName)+'/in-group/'+groupId);
  } else {
    fullUrl = v1ApiPath('devices/'+getTestName(cameraName)+'/in-group/'+getTestName(groupName));
  };

    logTestDescription(`Check that ${userName} get device ${cameraName} in group ${groupName} returns ${statusCode} and correct data`, {});

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
          if(expectedDevice.users==null) {
	    expect(device.users).to.not.exist;
          } else {
            expect(device.users.length).to.equal(expectedDevice.users.length);
	    // sort users and expected users to ensure order is the same
	    var users=sortArrayOn(device.users, 'userName');
	    var expectedUsers=sortArrayOn(expectedDevice.users,'userName');

	    // compare user list
	    var count;
            for (count=0; count < expectedDevice.users.length; count++) {
		  expect(users[count].userName).to.equal(expectedUsers[count].userName);
		  expect(users[count].admin).to.equal(expectedUsers[count].admin);
		  expect(users[count].id).to.equal(expectedUsers[count].id);
	    };
	  };
       };
  });
});

Cypress.Commands.add("apiCheckDevicesQuery", (userName: string, devicesArray: any, groupsArray: any, expectedDevices: any, operator: string='or', statusCode: number = 200) => {
  logTestDescription(
      `${userName} Check devices using query '${JSON.stringify(devicesArray)}' '${operator}' '${JSON.stringify(groupsArray)}'`,
      { user: userName, devicesArray, groupsArray, operator? },
      true
  );

  const params = {
	    devices: JSON.stringify(devicesArray),
	    groups: JSON.stringify(groupsArray),
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
	  // sort both devices and expected devices on devicename,groupname to ensure order is same
          var devices=sortArrayOnTwoKeys(response.body.devices,'devicename','groupname');
	  expectedDevices=sortArrayOnTwoKeys(expectedDevices,'devicename','groupname');
	  expect(devices.length).to.equal(expectedDevices.length);

	  //compare device list
          for (var index=0; index < expectedDevices.length; index++) {
		  expect(devices[index].groupname).to.equal(expectedDevices[index].groupname);
		  expect(devices[index].devicename).to.equal(expectedDevices[index].devicename);
		  if(expectedDevices[index].saltId!=null) {	
                    expect(devices[index].saltId).to.equal(expectedDevices[index].saltId);
		  };

		  //TODO: consider removing the following from API - not a standard format of parameter
		  expect(devices[index]['Group.groupname']).to.equal(expectedDevices[index].groupname);
	  }
       };
  });
});

Cypress.Commands.add("apiCheckDevicesUsers", (userName: string, deviceName: string, expectedUsers: [ExpectedUser], statusCode: number = 200) => {
 logTestDescription(
      `${userName} Check users for device '${deviceName}' requesting as user '${userName}'`,
      { user: userName, deviceName },
      true
  );
  const params = {
	    deviceId: getCreds(deviceName).id
  };
  const fullUrl = v1ApiPath('devices/users', params);

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
	  // sort users and expected users to ensure order is the same
          var users=sortArrayOn(response.body.rows, 'username');
          expectedUsers=sortArrayOn(expectedUsers, 'username');
	  expect(users.length).to.equal(expectedUsers.length);

          for (var index=0; index < expectedUsers.length; index++) {
		  expect(users[index].id).to.equal(expectedUsers[index].id);
		  expect(users[index].username).to.equal(expectedUsers[index].username);
		  expect(users[index].relation).to.equal(expectedUsers[index].relation);
		  expect(users[index].admin).to.equal(expectedUsers[index].admin);
		  expect(users[index].email).to.equal(expectedUsers[index].email);
	  }
       };
  });
});

Cypress.Commands.add(
  "apiAddUserToDevice",
  (deviceAdminUser: string, userName: string, device: string, admin: boolean = false, statusCode: number = 200) => {
    logTestDescription(
      `${deviceAdminUser} Adding user '${userName}' to device '${device}'`,
      { user: userName, device }
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: v1ApiPath("devices/users"),
        body: {
          deviceId: getCreds(device).id,
          admin: admin,
          username: getTestName(userName)
        }
      },
      deviceAdminUser,
      statusCode
    );
  }
);

Cypress.Commands.add(
  "apiRemoveUserFromDevice",
  (deviceAdminUser: string, userName: string, device: string, statusCode: number = 200) => {
    logTestDescription(
      `${deviceAdminUser} Removing user '${userName}' to device '${device}'`,
      { user: userName, device }
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: v1ApiPath("devices/users"),
        body: {
          deviceId: getCreds(device).id,
          admin: "false",
          username: getTestName(userName)
        }
      },
      deviceAdminUser,
      statusCode
    );
  }
);




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


