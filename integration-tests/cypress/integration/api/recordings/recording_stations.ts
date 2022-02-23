/// <reference path="../../../support/index.d.ts" />
import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";
import { getCreds } from "@commands/server";
import { EXCLUDE_IDS } from "@commands/constants";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { ApiRecordingSet } from "@commands/types";

const templateRecording: ApiRecordingSet = TEMPLATE_THERMAL_RECORDING;

const templateExpectedRecording: ApiThermalRecordingResponse =
  TEMPLATE_THERMAL_RECORDING_RESPONSE;

describe("Stations: add and remove", () => {
  const Josie = "Josie_stations";
  const group = "add_stations";
  const forestLatLong = { lat: -43.62367659982, lng: 172.62646754804 };
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

  it.skip("recordings are assigned to the correct stations", () => {
    cy.apiDeviceAdd("in-forest", group);
    cy.testUploadRecording("in-forest", forestLatLong).thenCheckStationIs(
      Josie,
      "forest"
    );

    cy.apiDeviceAdd("in-stream", group);
    cy.testUploadRecording("in-stream", {
      lat: -43.62367659983,
      lng: 172.62646754804,
    }).thenCheckStationIs(Josie, "stream");
  });

  it("recording that is not close to any station is not assigned a station", () => {
    cy.apiDeviceAdd("neither", group);
    cy.testUploadRecording("neither", {
      lat: -43.6,
      lng: 172.6,
    }).thenCheckStationIs(Josie, "");
  });

  it("recordings in another group are not assigned a station", () => {
    const otherGroup = "Josies-other";
    const camera = "other-group";
    cy.apiGroupAdd(Josie, otherGroup);
    cy.apiDeviceAdd(camera, otherGroup);
    cy.testUploadRecording(camera, forestLatLong).thenCheckStationIs(Josie, "");
  });

  it("recordings are not updated if before date specified", () => {
    const Josie2 = "Josie2";
    const groupUpdate = "update-stations";
    const camera = "update-after";
    cy.testCreateUserGroupAndDevice(Josie2, groupUpdate, camera);
    cy.testUploadRecording(camera, {
      time: new Date(date),
      lat: -43.6,
      lng: 172.8,
    });
    cy.checkRecordingsStationIs(Josie2, "");

    const stations = [
      { name: "forest", lat: -43.62367659982, lng: 172.62646754804 },
      { name: "waterfall", lat: -43.6, lng: 172.8 },
    ];
    cy.apiGroupStationsUpdate(Josie2, groupUpdate, stations, later);
    cy.checkRecordingsStationIs(Josie2, "");
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

  it.skip("recordings will lose their station assignment if the station is removed", () => {
    const Josie4 = "Josie4";
    const camera = "update-remove";
    const groupRemove = "remove-station";
    const date = "2021-03-25T21:01:00.000Z";
    const earlier = "2021-03-25T20:01:00.000Z";
    cy.testCreateUserGroupAndDevice(Josie4, groupRemove, camera);
    const stations = [{ name: "waterfall", lat: -43.6, lng: 172.8 }];
    cy.apiGroupStationsUpdate(Josie4, groupRemove, stations, earlier);
    cy.testUploadRecording(camera, {
      time: new Date(date),
      lat: -43.6,
      lng: 172.8,
    });
    cy.checkRecordingsStationIs(Josie4, "waterfall");

    const stations2 = [
      { name: "forest", lat: -43.62367659982, lng: 172.62646754804 },
    ];
    cy.apiGroupStationsUpdate(Josie4, groupRemove, stations2, earlier);
    cy.checkRecordingsStationIs(Josie4, "");
  });

  it("Recording is not assigned to a retired station", () => {
    cy.testCreateUserGroupAndDevice("sta_user1", "sta_group1", "sta_camera1");
    const stations = [
      { name: "test1", lat: -43.1, lng: 172 },
      { name: "test2", lat: -43.2, lng: 172 },
    ];
    cy.apiGroupStationsUpdate("sta_user1", "sta_group1", stations);

    const stations2 = [{ name: "test1", lat: -43.1, lng: 172 }];
    cy.apiGroupStationsUpdate("sta_user1", "sta_group1", stations2).then(() => {
      cy.testUploadRecording("sta_camera1", {
        time: new Date(Date.now()),
        lat: -43.2,
        lng: 172,
      });

      cy.checkRecordingsStationIs("sta_user1", "");
    });
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

  it.skip("Recording assigned based on their recordingDateTime after stations renamed", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    let expectedRecording1: ApiThermalRecordingResponse;

    cy.testCreateUserGroupAndDevice("staUser4", "staGroup4", "staCamera4");
    cy.log("Add stations test1 and test2");
    const stations = [
      { name: "test4-1", lat: -43.1, lng: 172 },
      { name: "test4-2", lat: -43.2, lng: 172 },
    ];
    cy.apiGroupStationsUpdate("staUser4", "staGroup4", stations).then(() => {
      const recordingDate = new Date(Date.now()).toISOString();
      const station2Id = getCreds("test4-2").id;

      cy.log("Rename test4-2 to test4-3 (retire test4-2, create test4-3)");
      const stations2 = [
        { name: "test4-1", lat: -43.1, lng: 172 },
        { name: "test4-3", lat: -43.2, lng: 172 },
      ];
      cy.apiGroupStationsUpdate("staUser4", "staGroup4", stations2);

      cy.log("Rename test4-3 to test4-2 (retire test4-3, create new test4-2)");
      cy.apiGroupStationsUpdate("staUser4", "staGroup4", stations);

      cy.log(
        "Add a recording at location of station test4-2 timed before the 1st update"
      );
      recording1.recordingDateTime = recordingDate;
      recording1.location = [-43.2, 172];

      cy.apiRecordingAdd(
        "staCamera4",
        recording1,
        undefined,
        "staRecording4"
      ).then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "staRecording4",
          "staCamera4",
          "staGroup4",
          null,
          recording1
        );

        expectedRecording1.stationName = "test4-2";
        expectedRecording1.stationId = station2Id;

        cy.log(
          "Check recording assigned to station that was active at time it was recorded (not the latest version)"
        );
        //check stationId
        cy.apiRecordingCheck(
          "staUser4",
          "staRecording4",
          expectedRecording1,
          EXCLUDE_IDS
        );
      });
    });
  });
});
