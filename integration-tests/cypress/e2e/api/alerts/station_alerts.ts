/// <reference path="../../../support/index.d.ts" />
import { checkResponse } from "@commands/server";
import { getNewIdentity } from "@commands/names";
import { ApiAlertCondition } from "@typedefs/api/alerts";
import { createExpectedAlert } from "@commands/api/alerts";
import { createExpectedEvent } from "@commands/api/events";

import { HttpStatusCode, RecordingProcessingState } from "@typedefs/api/consts";
import { RecordingId, StationId } from "@typedefs/api/common";

describe("Station alerts", () => {
  const POSSUM_ALERT: ApiAlertCondition[] = [
    { tag: "possum", automatic: true },
  ];

  // Just basic station alerts - most other error cases are covered by `device_alerts`

  it("Cannot create station alert without access permissions", () => {
    const usera = getNewIdentity("alice");
    const userb = getNewIdentity("bob");

    cy.apiUserAdd(userb.name);
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        lng: 1.2,
        lat: 2.4,
      },
      "recording1"
    )
      .then((recordingId: RecordingId) => {
        cy.apiRecordingGet(usera.name, recordingId).then((response) => {
          cy.wrap(response.body.recording.stationId);
        });
      })
      .then((stationId: StationId) => {
        //attempt to create alert for station that is not ours
        cy.apiStationAlertAdd(
          userb.name,
          "alert1",
          POSSUM_ALERT,
          stationId,
          null,
          HttpStatusCode.Forbidden
        ).then((response: any) => {
          checkResponse(response, HttpStatusCode.Forbidden);
        });
      });
  });

  it("Can receive an alert", () => {
    const usera = getNewIdentity("andrew");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);
    cy.apiGroupStationAdd(usera.name, usera.group, {
      name: "test-station",
      lat: 1,
      lng: 2,
    }).then((stationId) => {
      // create alert
      cy.apiStationAlertAdd(
        usera.name,
        "alert1",
        POSSUM_ALERT,
        stationId,
        0,
        HttpStatusCode.Ok
      ).then((alertId) => {
        //upload a recording tagged as possum and  build an expected event using the returned recording details
        cy.testUploadRecording(
          usera.camera,
          {
            processingState: RecordingProcessingState.Finished,
            tags: ["possum"],
            lat: 1,
            lng: 2,
            time: new Date(),
          },
          "recording1"
        ).then((recordingId) => {
          const expectedAlert = createExpectedAlert(
            "alert1",
            0,
            POSSUM_ALERT,
            true,
            usera.name
          );
          const expectedEvent = createExpectedEvent(
            usera.camera,
            "recording1",
            "alert1"
          );

          //check that an alert is present and has a 'last alerted'
          cy.apiStationAlertCheck(usera.name, stationId, expectedAlert);

          //check expected event is received
          cy.testEventsCheckAgainstExpected(
            usera.name,
            usera.camera,
            expectedEvent
          );
        });
      });
    });
  });

  it("Recordings uploaded on behalf of a device should not generate alerts", () => {
    const usera = getNewIdentity("andrew");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);
    cy.apiGroupStationAdd(usera.name, usera.group, {
      name: "test-station",
      lat: 1,
      lng: 2,
    }).then((stationId) => {
      // create alert
      cy.apiStationAlertAdd(
        usera.name,
        "alert1",
        POSSUM_ALERT,
        stationId,
        0,
        HttpStatusCode.Ok
      ).then((alertId) => {
        //upload a recording tagged as possum and  build an expected event using the returned recording details
        cy.testUploadRecordingOnBehalfUsingDevice(
          usera.name,
          usera.camera,
          {
            processingState: RecordingProcessingState.Finished,
            tags: ["possum"],
            lat: 1,
            lng: 2,
            time: new Date(),
          },
          "recording1"
        ).then((recordingId) => {
          const expectedAlert = createExpectedAlert(
            "alert1",
            0,
            POSSUM_ALERT,
            false,
            usera.name
          );
          // check that an alert is present and has no 'last alerted'
          cy.apiStationAlertCheck(usera.name, stationId, expectedAlert);

          // check that no actual alert was sent
          cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
        });
      });
    });
  });

  it("Recordings older than 24 hours should not generate alerts", () => {
    const twoDaysAgo = new Date(new Date().setDate(new Date().getDate() - 2));
    const usera = getNewIdentity("andrew");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);
    cy.apiGroupStationAdd(usera.name, usera.group, {
      name: "test-station",
      lat: 1,
      lng: 2,
    }).then((stationId) => {
      // create alert
      cy.apiStationAlertAdd(
        usera.name,
        "alert1",
        POSSUM_ALERT,
        stationId,
        0,
        HttpStatusCode.Ok
      ).then((alertId) => {
        //upload a recording tagged as possum and  build an expected event using the returned recording details
        cy.testUploadRecording(
          usera.camera,
          {
            processingState: RecordingProcessingState.Finished,
            tags: ["possum"],
            lat: 1,
            lng: 2,
            time: twoDaysAgo,
          },
          "recording1"
        ).then((recordingId) => {
          const expectedAlert = createExpectedAlert(
            "alert1",
            0,
            POSSUM_ALERT,
            false,
            usera.name
          );
          // check that an alert is present and has no 'last alerted'
          cy.apiStationAlertCheck(usera.name, stationId, expectedAlert);

          // check that no alerts were actually sent
          cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
        });
      });
    });
  });
});
