/// <reference path="../../../support/index.d.ts" />
import moment from "moment";
import { EventTypes, testCreateExpectedEvent } from "@commands/api/events";
import { runReportStoppedDevicesScript } from "@commands/api/alerts";

describe("Devices stopped alerts", () => {
  const group = "stoppers";
  const user = "Jerry";
  before(() => {
    cy.testCreateUserAndGroup(user, group);
  });

  it.skip("New Device isn't marked as stopped", () => {
    const camera = "Active";
    cy.apiDeviceAdd(camera, group);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON });
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: false,
      hasAlerted: false,
    });
  });

  it.skip("Events-only Device that has been on for longer than 12 hours and hasn't stopped is marked as stopped", () => {
    const camera = "c1";
    const over12Hrs = moment().subtract(13, "hours");
    cy.apiDeviceAdd(camera, group);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      over12Hrs.toISOString(),
    ]).pause().then(() => {

      cy.log("Check for powerEvent");
      cy.testPowerEventsCheckAgainstExpected(user, camera, {
        hasStopped: true,
        hasAlerted: false,
      });
  
      cy.log("Check for stop-reported event");
      const expectedStopEvent=testCreateExpectedEvent(camera, "stop-reported");
      cy.testEventsCheckAgainstExpected(user, camera, expectedStopEvent, 3);
    });
  });

  it.skip("Events-only Device started and stopped yesterday, and not today is marked as stopped", () => {
    const camera = "c2";
    cy.apiDeviceAdd(camera, group);
    const yesterdayStart = moment().subtract(40, "hours");
    const yesterdayStop = yesterdayStart.clone().add(28, "hours");
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      yesterdayStart.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_OFF, details: {} }, [
      yesterdayStop.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
  });

  it.skip("Events-only Device started over 12 hours ago but never stopped is marked as stopped", () => {
    const camera = "c3";
    cy.apiDeviceAdd(camera, group);
    const yesterday = moment().subtract(13, "hours");
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      yesterday.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
  });

  it.skip("Events-only device, Once reported is not marked as stopped again, until powered on again", () => {
    const camera = "c4";
    cy.apiDeviceAdd(camera, group);
    const yesterday = moment().subtract(13, "hours");
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      yesterday.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
    cy.apiEventsAdd(camera, { type: EventTypes.STOP_REPORTED });
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: true,
    });
  });

  it.skip("Events only Device powered on & off yesterday but only on last night is marked as stopped", () => {
    const camera = "c5";
    cy.apiDeviceAdd(camera, group);
    const priorOn = moment().subtract(37, "hours");
    const priorStop = priorOn.clone().add(12, "hours");
    const lastStart = priorOn.clone().add(24, "hours");

    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      priorOn.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_OFF, details: {} }, [
      priorStop.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      lastStart.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
  });

  it.skip("Events only Device checked before it is expected to have powered down is not marked as stopped", () => {
    const camera = "c6";
    cy.apiDeviceAdd(camera, group);
    const priorOn = moment().subtract(36, "hours");
    const priorStop = moment().subtract(24, "hours");
    const lastStart = priorOn.clone().add(24, "hours");

    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      priorOn.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_OFF, details: {} }, [
      priorStop.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      lastStart.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: false,
      hasAlerted: false,
    });
  });

  it.skip("Events only Device hasn't been checked for a long time is marked as stopped", () => {
    const camera = "c7";
    cy.apiDeviceAdd(camera, group);
    const priorOn = moment().subtract(20, "days");
    const priorStop = moment().subtract(20, "days").add(12, "hours");
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      priorOn.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_OFF, details: {} }, [
      priorStop.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
  });

  it.skip("Events only Device that has been reported, is marked as stopped again after new power cycles", () => {
    const camera = "c8";
    cy.apiDeviceAdd(camera, group);
    const priorOn = moment().subtract(5, "days");
    const priorStop = moment().subtract(5, "days").add(12, "hours");
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      priorOn.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_OFF, details: {} }, [
      priorStop.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
    cy.apiEventsAdd(camera, { type: EventTypes.STOP_REPORTED, details: {} }, [
      priorStop.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: true,
    });

    const newOn = moment().subtract(3, "days");
    const newOff = moment().subtract(3, "days").add(12, "hours");
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      newOn.toISOString(),
    ]);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_OFF, details: {} }, [
      newOff.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
  });

  it("Heartbeat device after successful heartbeat is not marked as stopped", () =>  {
    const nextHeartBeatTime=moment().add(3, "hours");

    cy.apiDeviceAdd("hrtCamera1", group);

    cy.apiDeviceHeartbeat("hrtCamera1", nextHeartBeatTime.toISOString()).then(() => {
      runReportStoppedDevicesScript();

      cy.apiEventsCheck(user, "hrtCamera1", {}, []);
    });
  });

  it("Heartbeat device >1 minute after nextHeartbeat expires is marked as stopped", () =>  {
    const nextHeartBeatTime=moment().add(-1, "minute");

    cy.apiDeviceAdd("hrtCamera2", group).then(() => {
      cy.apiDeviceHeartbeat("hrtCamera2", nextHeartBeatTime.toISOString()).then(() => {

        cy.log("Check for stopped devices");
        runReportStoppedDevicesScript();

        const expectedStopEvent=testCreateExpectedEvent("hrtCamera2", {type: "stop-reported", details: {}});
        cy.apiEventsCheck(user, "hrtCamera2", {}, [expectedStopEvent]);
      });
    });
  });

  it("Heartbeat device does not send multiple alerts", () =>  {
    const priorStop=moment().add(-1, "minute");
    const nextHeartBeatTime=moment().add(-1, "hour");

    cy.apiDeviceAdd("hrtCamera3", group).then(() => {
      const expectedStopEvent=testCreateExpectedEvent("hrtCamera3", {type: "stop-reported", details: {}});

      cy.log("Send a heartbeat");
      cy.apiDeviceHeartbeat("hrtCamera3", nextHeartBeatTime.toISOString());

      cy.log("Then add a stop event");
      cy.apiEventsAdd("hrtCamera3", { type: 'stop-reported', details: {} }, [
        priorStop.toISOString(),
      ]);

      cy.log("Check that the stop event exists");
      cy.apiEventsCheck(user, "hrtCamera3", {}, [expectedStopEvent]).then(() => {

        cy.log("Check for stopped devices");
        runReportStoppedDevicesScript();

        cy.log("Check that there is still only one stop events");
        cy.apiEventsCheck(user, "hrtCamera3", {}, [expectedStopEvent]);
      });
    });
  });

  it("Heartbeat device sends new alert after a new failed heartbeat", () =>  {
    const priorStop=moment().add(-1, "hour");
    const secondNextHeartBeatTime=moment().add(-1, "minute");

    cy.apiDeviceAdd("hrtCamera4", group).then(() => {
      cy.log("Add a previous stop event");
      cy.apiEventsAdd("hrtCamera4", { type: 'stop-reported', details: {} }, [
        priorStop.toISOString(),
      ]);

      const expectedStopEvent=testCreateExpectedEvent("hrtCamera4", {type: "stop-reported", details: {}});
      cy.log("Check for a stop event");
      cy.apiEventsCheck(user, "hrtCamera4", {}, [expectedStopEvent]);
 
      cy.log("Send a new heartbeat");
      cy.apiDeviceHeartbeat("hrtCamera4", secondNextHeartBeatTime.toISOString()).then(() => {

        cy.log("Check for stopped devices");
        runReportStoppedDevicesScript();

        cy.log("Check we now have 2 stop events");
        cy.apiEventsCheck(user, "hrtCamera4", {}, [expectedStopEvent, expectedStopEvent]);
      });
    });
  });

});

