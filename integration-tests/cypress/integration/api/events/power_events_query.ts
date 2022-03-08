/// <reference path="../../../support/index.d.ts" />
//
// This test set verifies correct retrieval of power events
// For generation of power events and alerts please see alerts/device_stopped.ts
//
import { EventTypes } from "@commands/api/events";
import { getTestName } from "@commands/names";
import { getCreds } from "@commands/server";
import { ApiPowerEventReturned } from "@commands/types";
import { HTTP_Forbidden, HTTP_Unprocessable } from "@commands/constants";

describe("Events - query power events", () => {
  const time1 = "2018-01-01T07:22:56.000Z";
  const time2 = "2018-01-01T08:22:56.000Z";
  const time3 = "2018-01-01T09:22:56.000Z";
  const time4 = "2018-01-01T10:22:56.000Z";
  const time5 = "2018-01-01T11:22:56.000Z";
  const eventPowerOn = { type: EventTypes.POWERED_ON, details: {} };
  const eventPowerOff = { type: EventTypes.POWERED_OFF, details: {} };
  const eventStopReported = { type: EventTypes.STOP_REPORTED, details: {} };
  const eventVersionData = {
    type: "versionData",
    details: {
      modemd: "1.2.3",
      audiobait: "3.0.1",
      "rtc-utils": "1.3.0",
      "salt-updater": "0.4.0",
      "event-reporter": "3.3.0",
      "device-register": "1.4.0",
      "cacophony-config": "1.6.4",
      "thermal-recorder": "2.13.0~SNAPSHOT-82263f4",
      "thermal-uploader": "2.3.0",
      "attiny-controller": "3.5.0",
      "management-interface": "1.9.0",
    },
  };

  let peCameraDevice: any;
  let peGroup: any;
  let peOtherGroup: any;
  let peOtherCameraDevice: any;
  let peOtherGroupCameraDevice: any;
  let expectedCamera: ApiPowerEventReturned;
  let expectedOtherCamera: ApiPowerEventReturned;
  //  let expectedOtherGroupCamera: ApiPowerEventReturned;

  before(() => {
    // group with 2 devices, admin and member users
    cy.testCreateUserGroupAndDevice("peGroupAdmin", "peGroup", "peCamera");
    cy.apiUserAdd("peGroupMember");
    cy.apiGroupUserAdd("peGroupAdmin", "peGroupMember", "peGroup", false);
    cy.apiDeviceAdd("peOtherCamera", "peGroup");

    //another group and device
    cy.testCreateUserGroupAndDevice(
      "peOtherGroupAdmin",
      "peOtherGroup",
      "peOtherGroupCamera"
    );

    //Create some events to reuse / query
    cy.apiEventsDeviceAddOnBehalf("peGroupAdmin", "peCamera", eventPowerOn, [
      time1,
    ]);
    cy.apiEventsDeviceAddOnBehalf(
      "peGroupAdmin",
      "peCamera",
      eventStopReported,
      [time2]
    );
    cy.apiEventsDeviceAddOnBehalf("peGroupAdmin", "peCamera", eventPowerOff, [
      time3,
    ]);
    cy.apiEventsDeviceAddOnBehalf(
      "peGroupAdmin",
      "peOtherCamera",
      eventPowerOn,
      [time4]
    );
    cy.apiEventsDeviceAddOnBehalf(
      "peGroupAdmin",
      "peOtherCamera",
      eventStopReported,
      [time5]
    );
    cy.apiEventsDeviceAddOnBehalf(
      "peOtherGroupAdmin",
      "peOtherGroupCamera",
      eventPowerOn,
      [time1]
    );
    cy.apiEventsDeviceAddOnBehalf(
      "peOtherGroupAdmin",
      "peOtherGroupCamera",
      eventVersionData,
      [time4]
    );
    cy.apiEventsDeviceAddOnBehalf(
      "peOtherGroupAdmin",
      "peOtherGroupCamera",
      eventStopReported,
      [time5]
    );
  });

  before(() => {
    peGroup = { groupname: getTestName("peGroup"), id: getCreds("peGroup").id };
    peOtherGroup = {
      groupname: getTestName("peOtherGroup"),
      id: getCreds("peOtherGroup").id,
    };
    peCameraDevice = {
      id: getCreds("peCamera").id,
      devicename: getTestName("peCamera"),
      GroupId: getCreds("peGroup").id,
      Group: peGroup,
    };
    peOtherCameraDevice = {
      id: getCreds("peOtherCamera").id,
      devicename: getTestName("peOtherCamera"),
      GroupId: getCreds("peGroup").id,
      Group: peGroup,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    peOtherGroupCameraDevice = {
      id: getCreds("peOtherGroupCamera").id,
      devicename: getTestName("peOtherGroupCamera"),
      GroupId: getCreds("peOtherGroup").id,
      Group: peOtherGroup,
    };

    expectedCamera = {
      hasStopped: true,
      lastStarted: time1,
      lastReported: time2,
      lastStopped: time3,
      hasAlerted: true,
      Device: peCameraDevice,
    };
    expectedOtherCamera = {
      hasStopped: true,
      lastStarted: time4,
      lastReported: time5,
      lastStopped: null,
      hasAlerted: true,
      Device: peOtherCameraDevice,
    };
    //    expectedOtherGroupCamera = {
    //      hasStopped: true,
    //      lastStarted: time1,
    //      lastReported: time5,
    //      lastStopped: null,
    //      hasAlerted: true,
    //      Device: peOtherGroupCameraDevice,
    //    };
  });

  it("Group admin can view all power events on all devices their group", () => {
    cy.apiPowerEventsCheck("peGroupAdmin", undefined, {}, [
      expectedCamera,
      expectedOtherCamera,
    ]);
  });

  it("Group member can view all events on all devices their group", () => {
    cy.apiPowerEventsCheck("peGroupMember", undefined, {}, [
      expectedCamera,
      expectedOtherCamera,
    ]);
  });

  it("Group admin can only request events from within their group", () => {
    cy.apiPowerEventsCheck("peGroupAdmin", "peCamera", {}, [expectedCamera]);
    cy.apiPowerEventsCheck("peGroupAdmin", "peOtherCamera", {}, [
      expectedOtherCamera,
    ]);
    cy.apiPowerEventsCheck(
      "peGroupAdmin",
      "peOtherGroupCamera",
      {},
      [],
      [],
      HTTP_Forbidden
    );
  });

  it("Handles invalid parameters correctly", () => {
    cy.log("Test for non existent device");
    cy.apiPowerEventsCheck(
      "peGroupAdmin",
      undefined,
      { deviceId: 999999 },
      [],
      [],
      HTTP_Forbidden
    );
    cy.log("Bad value for device id");
    cy.apiPowerEventsCheck(
      "peGroupAdmin",
      undefined,
      { deviceId: "bad value" },
      [],
      [],
      HTTP_Unprocessable
    );
  });
});
