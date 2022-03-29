/// <reference path="../../../support/index.d.ts" />
import {
  checkRecording,
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import {
  getCreds,
  makeAuthorizedRequestWithStatus,
  v1ApiPath,
} from "@commands/server";
import {
  EXCLUDE_IDS,
  HTTP_BadRequest,
  HTTP_Forbidden,
  HTTP_OK200,
  NOT_NULL,
  NOT_NULL_STRING,
} from "@commands/constants";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { ApiRecordingSet } from "@commands/types";
import { getTestName } from "@commands/names";
import { LatLng } from "@typedefs/api/common";
import { ApiDeviceResponse } from "@typedefs/api/device";

const getNewLocation = (function () {
  let numGeneratedLocations = -1;
  const baseLocation = { lat: -43.62367659982, lng: 172.62646754804 };
  return (): LatLng => {
    numGeneratedLocations++;
    return {
      lat: baseLocation.lat + numGeneratedLocations,
      lng: baseLocation.lng - numGeneratedLocations,
    };
  };
})();

const templateRecording: ApiRecordingSet = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING)
);

const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
  JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
);

describe("Stations: add and remove", () => {
  const Josie = "Josie_stations";
  const group = "add_stations";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group);
  });

  it("Adding a recording in a new location automatically creates a new station", () => {
    const deviceName = "new-device";
    const recordingTime = new Date();
    const location = getNewLocation();

    cy.apiDeviceAdd(deviceName, group);
    const expectedStation1 = {
      location,
      name: NOT_NULL_STRING,
      id: NOT_NULL,
      lastThermalRecordingTime: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      activeAt: recordingTime.toISOString(),
      automatic: true,
      groupId: getCreds(group).id,
      groupName: getTestName(group),
    };
    cy.testUploadRecording(deviceName, { ...location, time: recordingTime })
      .thenCheckAutomaticallyGeneratedStationIsAssignedToRecording(
        Josie,
        deviceName
      )
      .then((stationId) => {
        cy.apiStationCheck(Josie, stationId, expectedStation1);
      });
  });

  it("Adding a recording within the radius of an existing station assigns the existing station to the recording", () => {
    const deviceName = "new-device-2";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    cy.testUploadRecording(
      deviceName,
      location
    ).thenCheckAutomaticallyGeneratedStationIsAssignedToRecording(
      Josie,
      deviceName
    );
    cy.testUploadRecording(deviceName, location).thenCheckStationBeginsWith(
      Josie,
      deviceName
    );
  });

  it("Can manually add a single station", () => {
    const location = getNewLocation();
    const stationName = "Josie-station-1";
    const expectedStation = {
      location,
      name: stationName,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };
    cy.testCreateStation(group, Josie, { name: stationName, ...location }).then(
      (stationId) => {
        expectedStation.id = stationId;
        cy.apiStationCheck(Josie, stationId, expectedStation);
      }
    );
  });

  it("Can manually retire a station", () => {
    const location = getNewLocation();
    const stationName = "Josie-station-2";
    const expectedStation = {
      location,
      name: stationName,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };
    cy.testCreateStation(group, Josie, { name: stationName, ...location }).then(
      (stationId) => {
        expectedStation.id = stationId;

        cy.apiStationCheck(Josie, stationId, expectedStation);
        const retirementDate = new Date();
        cy.testRetireStation(Josie, stationId, retirementDate).then(() => {
          (expectedStation as any).retiredAt = retirementDate.toISOString();
          (expectedStation as any).lastUpdatedById = getCreds(Josie).id;
          cy.apiStationCheck(Josie, stationId, expectedStation);
        });
      }
    );
  });

  it("Can rename a station", () => {
    const location = getNewLocation();
    const stationName = "Josie-station-3";
    const expectedStation = {
      location,
      name: stationName,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };
    cy.testCreateStation(group, Josie, { name: stationName, ...location }).then(
      (stationId) => {
        expectedStation.id = stationId;

        cy.apiStationCheck(Josie, stationId, expectedStation);
        const newName = "Josie-station-3-renamed";
        cy.testUpdateStation(Josie, stationId, { name: newName }).then(() => {
          (expectedStation as any).lastUpdatedById = getCreds(Josie).id;
          expectedStation.name = newName;
          cy.apiStationCheck(Josie, stationId, expectedStation);
        });
      }
    );
  });

  it("Changing a station location to collide with another in the same time window generates a proximity warning", () => {
    const location1 = getNewLocation();
    const location2 = getNewLocation();

    cy.log("Create two stations in separate locations");

    const stationName1 = "Josie-station-333";
    const expectedStation1 = {
      location: location1,
      name: stationName1,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };
    cy.testCreateStation(group, Josie, {
      name: stationName1,
      ...location1,
    }).then((stationId) => {
      expectedStation1.id = stationId;
      cy.apiStationCheck(Josie, stationId, expectedStation1);
    });

    const stationName2 = "Josie-station-3333";
    const expectedStation2 = {
      location: location2,
      name: stationName2,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };
    cy.testCreateStation(group, Josie, {
      name: stationName2,
      ...location2,
    }).then((stationId) => {
      expectedStation2.id = stationId;
      cy.apiStationCheck(Josie, stationId, expectedStation2);
      cy.log(`Move ${stationName2} to the location of ${stationName1}`);
      cy.testUpdateStation(Josie, stationId, { ...location1 }).then(
        (responseBody) => {
          expect(responseBody).to.haveOwnProperty("warnings");
          expect((responseBody as any).warnings.length).to.equal(1);
          expectedStation2.location = location1;
          cy.apiStationCheck(Josie, stationId, expectedStation2);
        }
      );
    });
  });

  it("Cannot rename a station to have an existing active station name", () => {
    const location = getNewLocation();
    const stationName = "Josie-station-33";

    const expectedStation = {
      location,
      name: stationName,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };
    cy.testCreateStation(group, Josie, { name: stationName, ...location }).then(
      (stationId) => {
        expectedStation.id = stationId;

        cy.apiStationCheck(Josie, stationId, expectedStation);

        cy.log(
          "Attempt to create another station with the same name active in the same time range"
        );
        cy.testCreateStation(
          group,
          Josie,
          { name: stationName, ...location },
          undefined,
          undefined,
          true,
          HTTP_BadRequest
        ).then((response) => {
          cy.log(JSON.stringify(response));
          expect((response as any).success).to.equal(false);
        });
      }
    );
  });

  it("Renaming an automatically created station sets automatic to false", () => {
    const deviceName = "new-device-33";
    const recordingTime = new Date();
    const location = getNewLocation();

    cy.apiDeviceAdd(deviceName, group);
    const expectedStation = {
      location,
      name: NOT_NULL_STRING,
      id: NOT_NULL,
      lastThermalRecordingTime: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      activeAt: recordingTime.toISOString(),
      automatic: true,
      groupId: getCreds(group).id,
      groupName: getTestName(group),
    };
    cy.testUploadRecording(deviceName, { ...location, time: recordingTime })
      .thenCheckAutomaticallyGeneratedStationIsAssignedToRecording(
        Josie,
        deviceName
      )
      .then((stationId) => {
        cy.apiStationCheck(Josie, stationId, expectedStation);
        const newName = "renamed-station";
        cy.testUpdateStation(Josie, stationId, { name: newName }).then(() => {
          (expectedStation as any).lastUpdatedById = getCreds(Josie).id;
          expectedStation.automatic = false;
          expectedStation.name = newName;
          cy.apiStationCheck(Josie, stationId, expectedStation);
        });
      });
  });

  it("Adding an older recording within the radius of an existing retired station which was active at the time the recording was made assigns the station to the recording", () => {
    const deviceName = "new-device-4";
    const stationName = "Josie-station-4";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    const expectedStation = {
      location,
      name: stationName,
      id: NOT_NULL,
      activeAt: NOT_NULL_STRING,
      createdAt: NOT_NULL_STRING,
      updatedAt: NOT_NULL_STRING,
      automatic: false,
      retiredAt: now.toISOString(),
      groupId: getCreds(group).id,
      lastUpdatedById: NOT_NULL,
      groupName: getTestName(group),
    };

    cy.testCreateStation(
      group,
      Josie,
      { name: stationName, ...location },
      oneMonthAgo,
      now
    ).then((stationId) => {
      cy.apiStationCheck(Josie, stationId, expectedStation).then(
        (stationId) => {
          cy.testUploadRecording(deviceName, {
            ...location,
            time: oneWeekAgo,
          }).thenCheckRecordingsStationHasId(Josie, stationId);
        }
      );
    });
  });

  it.skip("Manually creating station with a startDate (and optionally an end-date) should try to match existing recordings on creation.", () => {
    // TODO - Not 100% sure of behaviour here
  });

  it("Adding a new recording within the radius of an existing retired station automatically creates a new station and assigns it to the recording", () => {
    const deviceName = "new-device-5";
    const stationName = "Josie-station-5";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const now = new Date();

    cy.testCreateStation(
      group,
      Josie,
      { name: stationName, ...location },
      oneMonthAgo,
      oneWeekAgo
    ).then(() => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: now,
      }).thenCheckAutomaticallyGeneratedStationIsAssignedToRecording(
        Josie,
        deviceName
      );
    });
  });

  it("Can manually add a single station where or close to where there is already a station - creating a warning", () => {
    const deviceName = "new-device-6";
    const stationName1 = "Josie-station-6";
    const stationName2 = "Josie-station-7";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    cy.testCreateStation(
      group,
      Josie,
      { name: stationName1, ...location },
      oneMonthAgo // Active from one month ago
    ).then(() => {
      cy.testCreateStation(
        group,
        Josie,
        { name: stationName2, ...location },
        null,
        null,
        true
      ).then((response) => {
        expect(response).to.haveOwnProperty("warnings");
        expect((response as any).warnings.length).to.equal(1);
      });
    });
  });

  it("Can manually delete a station", () => {
    const deviceName = "new-device-7";
    const stationName = "Josie-station-8";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.testCreateStation(
      group,
      Josie,
      { name: stationName, ...location },
      oneMonthAgo,
      oneWeekAgo
    ).then((stationId) => {
      cy.testDeleteStation(Josie, stationId).then(() => {
        cy.apiStationCheck(Josie, stationId, null, null, HTTP_Forbidden);
      });
    });
  });

  it("Can manually delete a station, and have all recordings belonging to the station be deleted too", () => {
    const deviceName = "new-device-8";
    const stationName = "Josie-station-9";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.testCreateStation(
      group,
      Josie,
      { name: stationName, ...location },
      oneMonthAgo
    ).then((stationId) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneWeekAgo,
      }).then((recordingId) => {
        cy.testDeleteStation(Josie, stationId, true).then(() => {
          cy.log("Check that station and its recordings are deleted");
          cy.apiStationCheck(Josie, stationId, null, null, HTTP_Forbidden);
          cy.apiRecordingCheck(Josie, recordingId, null, null, HTTP_Forbidden, {
            useRawRecordingId: true,
          });
        });
      });
    });
  });

  it("Can manually delete a station, and have the station unassigned from any recordings", () => {
    const deviceName = "new-device-9";
    const stationName = "Josie-station-9";
    const location = getNewLocation();
    cy.apiDeviceAdd(deviceName, group);
    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));

    cy.testCreateStation(
      group,
      Josie,
      { name: stationName, ...location },
      oneMonthAgo
    ).then((stationId) => {
      cy.testUploadRecording(deviceName, {
        ...location,
        time: oneWeekAgo,
      }).then((recordingId) => {
        makeAuthorizedRequestWithStatus(
          {
            method: "GET",
            url: v1ApiPath(`recordings/${recordingId}`),
          },
          Josie,
          HTTP_OK200
        ).then((response) => {
          const recording = response.body.recording;
          expect(recording.stationId).to.equal(stationId);
          cy.testDeleteStation(Josie, stationId).then(() => {
            cy.log(
              "Check that station is deleted, and its recordings don't have the station id"
            );
            cy.apiStationCheck(Josie, stationId, null, null, HTTP_Forbidden);
            makeAuthorizedRequestWithStatus(
              {
                method: "GET",
                url: v1ApiPath(`recordings/${recordingId}`),
              },
              Josie,
              HTTP_OK200
            ).then((response) => {
              const recording = response.body.recording;
              expect(recording.stationId).to.equal(undefined);
            });
          });
        });
      });
    });
  });

  it("Device can have a manual location change added, and stations are reassigned to the correct device recordings", () => {
    cy.log(
      "Create a device (in the past), give it a location by uploading a recording for it at a given point in time."
    );
    const deviceName = "new-device-99";
    const stationName = "Josie-station-99";
    const location = getNewLocation();
    const fixedLocation = getNewLocation();
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const twoWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 14));
    cy.apiDeviceAdd(deviceName, group);

    cy.testUploadRecording(deviceName, {
      ...location,
      time: oneWeekAgo,
    })
      .then((recordingId) => {
        checkRecording(Josie, recordingId, (recording) => {
          expect(recording.stationName).equals(
            `New station for ${getTestName(deviceName)}_${
              recording.recordingDateTime
            }`
          );
          cy.wrap(recordingId);
        });
      })
      .then((recordingId) => {
        cy.log(
          "Create a new station at a point in time (where the device *actually* was)"
        );
        cy.testCreateStation(
          group,
          Josie,
          { name: stationName, ...fixedLocation },
          twoWeeksAgo
        ).then((stationId) => {
          cy.log(
            "Change our mind about where the device was at that point in time. (Assign it to the newly created station)."
          );
          makeAuthorizedRequestWithStatus(
            {
              method: "PATCH",
              url: v1ApiPath(`devices/fix-location/${getCreds(deviceName).id}`),
              body: {
                setStationAtTime: {
                  stationId,
                  fromDateTime: oneWeekAgo,
                },
              },
            },
            Josie,
            HTTP_OK200
          ).then((response) => {
            expect((response as any).body.messages.length).to.equal(2);
            expect((response as any).body.messages[1]).to.equal(
              "Updated 1 recording(s)"
            );
            cy.log(
              "Make sure the recording is reassigned to the correct station, and the location updated."
            );
            checkRecording(Josie, recordingId, (recording) => {
              expect(recording.stationId).to.equal(stationId);
              expect(recording.location.lat).to.equal(fixedLocation.lat);
              expect(recording.location.lng).to.equal(fixedLocation.lng);
            });

            cy.log(
              "Make sure the device location is updated since there are no future DeviceHistory entries for this device"
            );
            cy.apiDevice(Josie, deviceName).then(
              (device: ApiDeviceResponse) => {
                expect(device.location.lat).to.equal(fixedLocation.lat);
                expect(device.location.lng).to.equal(fixedLocation.lng);
              }
            );

            cy.log(
              "Adding a new recording for the device in the correct time range should use the fixed station"
            );
            cy.testUploadRecording(deviceName, {
              ...fixedLocation,
            }).then((recordingId) => {
              checkRecording(Josie, recordingId, (recording) => {
                expect(recording.stationName).to.equal(stationName);
                expect(recording.stationId).to.equal(stationId);
                expect(recording.location.lat).to.equal(fixedLocation.lat);
                expect(recording.location.lng).to.equal(fixedLocation.lng);
              });
            });
          });
        });
      });
  });

  it.skip("recordings are not updated if before date specified", () => {
    const Josie2 = "Josie2";
    const groupUpdate = "update-stations";
    const camera = "update-after";

    const oneMonthAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    cy.testCreateUserGroupAndDevice(Josie2, groupUpdate, camera);
    cy.testUploadRecording(camera, {
      time: oneMonthAgo,
      lat: -43.6,
      lng: 172.8,
    });

    cy.checkRecordingsStationIs(Josie2, "");

    const stations = [
      { name: "forest", lat: -43.62367659982, lng: 172.62646754804 },
      { name: "waterfall", lat: -43.6, lng: 172.8 },
    ];
    cy.apiGroupStationsUpdate(Josie2, groupUpdate, stations);
    cy.checkRecordingsStationIs(Josie2, "");
  });

  it.skip("Stations can have bulk changes applied, with changes back-dated", () => {
    const Josie2 = "Josie3";
    const groupUpdate = "update-stations-2";
    const camera = "update-after";
    const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
    const fromDate = oneWeekAgo.toISOString();

    cy.testCreateUserGroupAndDevice(Josie2, groupUpdate, camera);
    cy.apiGroupStationsUpdate(
      Josie2,
      groupUpdate,
      [{ name: "foo", lat: 1, lng: 2 }],
      fromDate
    );

    /*
    1) Create. This stays as-currently-is
    2) Rename. This functionality should be kept - rename the existing station if the location is the same
    3) Move. This is currently broken. In this case we need to rename the old station to keep it unique and create a new one as-per trapNZ
     */

    // Stations will be matched on name, location,
  });
});

describe.skip("Stations: add and remove", () => {
  const Josie = "Josie_stations";
  const group = "add_stations";
  const date = "2021-05-25T09:01:00.000Z";
  const earlier = "2021-05-25T08:00:00.000Z";
  const later = "2021-05-25T10:00:00.000Z";

  before(() => {
    cy.testCreateUserAndGroup(Josie, group);
    const stations = [
      { name: "forest", lat: -43.62367659982, lng: 172.62646754804 },
      { name: "stream", lat: -43.62367659983, lng: 172.62646754804 },
    ];
    cy.apiGroupStationsUpdate(Josie, group, stations);
  });

  it("recordings are updated if after date specified", () => {
    const Josie3 = "Josie3";
    const camera = "update-earlier";
    const groupNotUpdate = "not-update-stations";
    cy.testCreateUserGroupAndDevice(Josie3, groupNotUpdate, camera);
    cy.testUploadRecording(camera, {
      time: new Date(date),
      lat: -43.6,
      lng: 172.8,
    });
    cy.checkRecordingsStationIs(Josie3, "");

    const stations = [
      { name: "forest", lat: -43.62367659982, lng: 172.62646754804 },
      { name: "waterfall", lat: -43.6, lng: 172.8 },
    ];
    cy.apiGroupStationsUpdate(Josie3, groupNotUpdate, stations, earlier);
    cy.checkRecordingsStationIs(Josie3, "waterfall");
  });

  it("Recording is assigned to a correct station after rename", () => {
    cy.testCreateUserGroupAndDevice("staUser2", "staGroup2", "staCamera2");
    const stations = [
      { name: "test1", lat: -43.1, lng: 172 },
      { name: "test2", lat: -43.2, lng: 172 },
    ];
    cy.apiGroupStationsUpdate("staUser2", "staGroup2", stations);

    const stations2 = [
      { name: "test1", lat: -43.1, lng: 172 },
      { name: "test3", lat: -43.2, lng: 172 },
    ];
    cy.apiGroupStationsUpdate("staUser2", "staGroup2", stations2).then(() => {
      cy.testUploadRecording("staCamera2", {
        time: new Date(Date.now()),
        lat: -43.2,
        lng: 172,
      });

      cy.checkRecordingsStationIs("staUser2", "test3");
    });
  });

  it("Recording is assigned to correct station after rename with duplicate name", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    let expectedRecording1: ApiThermalRecordingResponse;

    cy.testCreateUserGroupAndDevice("staUser3", "staGroup3", "staCamera3");
    cy.log("Add stations test1 and test2");
    const stations = [
      { name: "test1", lat: -43.1, lng: 172 },
      { name: "test2", lat: -43.2, lng: 172 },
    ];
    cy.apiGroupStationsUpdate("staUser3", "staGroup3", stations);

    cy.log("Rename test2 to test3 (retire test2)");
    const stations2 = [
      { name: "test1", lat: -43.1, lng: 172 },
      { name: "test3", lat: -43.2, lng: 172 },
    ];
    cy.apiGroupStationsUpdate("staUser3", "staGroup3", stations2);

    cy.log("Rename test3 to test2 (retire test3, create new test2)");
    cy.apiGroupStationsUpdate("staUser3", "staGroup3", stations);

    cy.log("Add a recording at location of station test2");
    recording1.recordingDateTime = new Date(Date.now()).toISOString();
    recording1.location = [-43.2, 172];

    cy.apiRecordingAdd(
      "staCamera3",
      recording1,
      undefined,
      "staRecording3"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "staRecording3",
        "staCamera3",
        "staGroup3",
        null,
        recording1
      );

      expectedRecording1.stationName = "test2";
      expectedRecording1.stationId = getCreds("test2").id;

      cy.log(
        "Check recording assigned to correct station (and the latest, non-retired version of it)"
      );
      //check stationId
      cy.apiRecordingCheck(
        "staUser3",
        "staRecording3",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });
  });
});
