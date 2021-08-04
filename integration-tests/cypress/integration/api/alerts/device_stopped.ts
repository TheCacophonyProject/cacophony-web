/// <reference path="../../../support/index.d.ts" />
import moment from "moment";
import { EventTypes } from "../../../commands/api/events";

describe("Devices stopped alerts", () => {
  const group = "stoppers";
  const user = "Jerry";
  before(() => {
    cy.apiCreateUserGroup(user, group);
  });

  it("New Device isn't marked as stopped", () => {
    const camera = "Active";
    cy.apiCreateDevice(camera, group);
    cy.recordEvent(camera, EventTypes.POWERED_ON);
    cy.checkPowerEvents(user, camera, { hasStopped: false, hasAlerted: false });
  });

  it("Device that has been on for longer than 12 hours and hasn't stopped is marked as stopped", () => {
    const camera = "c1";
    cy.apiCreateDevice(camera, group);
    cy.recordEvent(
      camera,
      EventTypes.POWERED_ON,
      {},
      moment().subtract(13, "hours").toDate()
    );
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
  });

  it("Device started and stopped yesterday, and not today is marked as stopped", () => {
    const camera = "c2";
    cy.apiCreateDevice(camera, group);
    const yesterdayStart = moment().subtract(40, "hours");
    const yesterdayStop = yesterdayStart.clone().add(28, "hours");
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, yesterdayStart.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_OFF, {}, yesterdayStop.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
  });

  it("Device started over 12 hours ago but never stopped is marked as stopped", () => {
    const camera = "c3";
    cy.apiCreateDevice(camera, group);
    const yesterday = moment().subtract(13, "hours");
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, yesterday.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
  });

  it("Once reported is not marked as stopped again, until powered on again", () => {
    const camera = "c4";
    cy.apiCreateDevice(camera, group);
    const yesterday = moment().subtract(13, "hours");
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, yesterday.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
    cy.recordEvent(camera, EventTypes.STOP_REPORTED);
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: true });
  });

  it("Device powered on & off yesterday but only on last night is marked as stopped", () => {
    const camera = "c5";
    cy.apiCreateDevice(camera, group);
    const priorOn = moment().subtract(37, "hours");
    const priorStop = priorOn.clone().add(12, "hours");
    const lastStart = priorOn.clone().add(24, "hours");

    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, priorOn.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_OFF, {}, priorStop.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, lastStart.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
  });

  it("Device checked before it is expected to have powered down is not marked as stopped", () => {
    const camera = "c6";
    cy.apiCreateDevice(camera, group);
    const priorOn = moment().subtract(36, "hours");
    const priorStop = moment().subtract(24, "hours");
    const lastStart = priorOn.clone().add(24, "hours");

    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, priorOn.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_OFF, {}, priorStop.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, lastStart.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: false, hasAlerted: false });
  });

  it("Device hasn't been checked for a long time is marked as stopped", () => {
    const camera = "c7";
    cy.apiCreateDevice(camera, group);
    const priorOn = moment().subtract(20, "days");
    const priorStop = moment().subtract(20, "days").add(12, "hours");
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, priorOn.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_OFF, {}, priorStop.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
  });

  it("Device that has been reported, is marked as stopped again after new power cycles", () => {
    const camera = "c8";
    cy.apiCreateDevice(camera, group);
    const priorOn = moment().subtract(5, "days");
    const priorStop = moment().subtract(5, "days").add(12, "hours");
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, priorOn.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_OFF, {}, priorStop.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
    cy.recordEvent(camera, EventTypes.STOP_REPORTED, {}, priorStop.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: true });

    const newOn = moment().subtract(3, "days");
    const newOff = moment().subtract(3, "days").add(12, "hours");
    cy.recordEvent(camera, EventTypes.POWERED_ON, {}, newOn.toDate());
    cy.recordEvent(camera, EventTypes.POWERED_OFF, {}, newOff.toDate());
    cy.checkPowerEvents(user, camera, { hasStopped: true, hasAlerted: false });
  });
});
