import moment from "moment";
import { testCreateExpectedEvent } from "@commands/api/events";
import { runReportStoppedDevicesScript } from "@commands/api/alerts";

describe.skip("Devices stopped alerts", () => {
  const group = "stoppers";
  const user = "Jerry";
  before(() => {
    cy.testCreateUserAndGroup(user, group);
  });

  it("Heartbeat device after successful heartbeat is not marked as stopped", () => {
    const nextHeartBeatTime = moment().add(3, "hours");

    cy.apiDeviceAdd("hrtCamera1", group);

    cy.apiDeviceHeartbeat("hrtCamera1", nextHeartBeatTime.toISOString()).then(
      () => {
        runReportStoppedDevicesScript(() => {
          cy.apiEventsCheck(user, "hrtCamera1", {}, []);
        });
      },
    );
  });

  it("Heartbeat device >1 minute after nextHeartbeat expires is marked as stopped", () => {
    const nextHeartBeatTime = moment().add(-1, "minute");

    cy.apiDeviceAdd("hrtCamera2", group).then(() => {
      cy.apiDeviceHeartbeat("hrtCamera2", nextHeartBeatTime.toISOString()).then(
        () => {
          cy.log("Check for stopped devices");
          runReportStoppedDevicesScript((val) => {
            cy.log(JSON.stringify(val));
            const expectedStopEvent = testCreateExpectedEvent("hrtCamera2", {
              type: "stop-reported",
              details: {},
            });
            cy.apiEventsCheck(user, "hrtCamera2", {}, [expectedStopEvent]);
          });
        },
      );
    });
  });

  it("Heartbeat device does not send multiple alerts", () => {
    const priorStop = moment().add(-1, "minute");
    const nextHeartBeatTime = moment().add(-1, "hour");

    cy.apiDeviceAdd("hrtCamera3", group).then(() => {
      const expectedStopEvent = testCreateExpectedEvent("hrtCamera3", {
        type: "stop-reported",
        details: {},
      });

      cy.log("Send a heartbeat");
      cy.apiDeviceHeartbeat("hrtCamera3", nextHeartBeatTime.toISOString());

      cy.log("Then add a stop event");
      cy.apiEventsAdd("hrtCamera3", { type: "stop-reported", details: {} }, [
        priorStop.toISOString(),
      ]);

      cy.log("Check that the stop event exists");
      cy.apiEventsCheck(user, "hrtCamera3", {}, [expectedStopEvent]).then(
        () => {
          cy.log("Check for stopped devices");
          runReportStoppedDevicesScript(() => {
            cy.log("Check that there is still only one stop events");
            cy.apiEventsCheck(user, "hrtCamera3", {}, [expectedStopEvent]);
          });
        },
      );
    });
  });

  it("Heartbeat device sends new alert after a new failed heartbeat", () => {
    const priorStop = moment().add(-1, "hour");
    const secondNextHeartBeatTime = moment().add(-1, "minute");

    cy.apiDeviceAdd("hrtCamera4", group).then(() => {
      cy.log("Add a previous stop event");
      cy.apiEventsAdd("hrtCamera4", { type: "stop-reported", details: {} }, [
        priorStop.toISOString(),
      ]);

      const expectedStopEvent = testCreateExpectedEvent("hrtCamera4", {
        type: "stop-reported",
        details: {},
      });
      cy.log("Check for a stop event");
      cy.apiEventsCheck(user, "hrtCamera4", {}, [expectedStopEvent]);

      cy.log("Send a new heartbeat");
      cy.apiDeviceHeartbeat(
        "hrtCamera4",
        secondNextHeartBeatTime.toISOString(),
      ).then(() => {
        cy.log("Check for stopped devices");
        runReportStoppedDevicesScript(() => {
          cy.log("Check we now have 2 stop events");
          cy.apiEventsCheck(user, "hrtCamera4", {}, [
            expectedStopEvent,
            expectedStopEvent,
          ]);
        });
      });
    });
  });
});
