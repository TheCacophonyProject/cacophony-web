/// <reference path="../../../support/index.d.ts" />
import moment from "moment";
import { EventTypes } from "@commands/api/events";

describe("Devices stopped alerts", () => {
  const group = "stoppers";
  const user = "Jerry";
  before(() => {
    cy.testCreateUserAndGroup(user, group);
  });

  it("New Device isn't marked as stopped", () => {
    const camera = "Active";
    cy.apiDeviceAdd(camera, group);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON });
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: false,
      hasAlerted: false,
    });
  });

  it("Device that has been on for longer than 12 hours and hasn't stopped is marked as stopped", () => {
    const camera = "c1";
    const over12Hrs = moment().subtract(13, "hours");
    cy.apiDeviceAdd(camera, group);
    cy.apiEventsAdd(camera, { type: EventTypes.POWERED_ON, details: {} }, [
      over12Hrs.toISOString(),
    ]);
    cy.testPowerEventsCheckAgainstExpected(user, camera, {
      hasStopped: true,
      hasAlerted: false,
    });
  });

  it("Device started and stopped yesterday, and not today is marked as stopped", () => {
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

  it("Device started over 12 hours ago but never stopped is marked as stopped", () => {
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

  it("Once reported is not marked as stopped again, until powered on again", () => {
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

  it("Device powered on & off yesterday but only on last night is marked as stopped", () => {
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

  it("Device checked before it is expected to have powered down is not marked as stopped", () => {
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

  it("Device hasn't been checked for a long time is marked as stopped", () => {
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

  it("Device that has been reported, is marked as stopped again after new power cycles", () => {
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
});
